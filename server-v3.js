require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const config = require('./lib/config');
const db = require('./lib/database');
const media = require('./lib/media');
const speech = require('./lib/speech-sync');
const autoDubbing = require('./lib/auto-dubbing');
const costMeter = require('./lib/cost-meter');
const {
  normalizeEmail, cleanText, cleanVoice, cleanSpeakerRole,
  clamp, safeDelete, logMemory
} = require('./lib/utils');

const app = express();
let jobRunning = false;

fs.mkdirSync(config.WORK_DIR, { recursive: true });
fs.mkdirSync(config.OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: config.WORK_DIR,
  limits: { fileSize: config.MAX_FILE_SIZE }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/outputs', express.static(config.OUTPUT_DIR));
app.use(express.static(config.PUBLIC_DIR));

app.get('/', (req, res) => res.json({
  ok: true,
  app: 'ViralVoice API',
  version: '4.0.2-cost-log'
}));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'ViralVoice API',
    version: '4.0.2-cost-log',
    openaiKey: Boolean(process.env.OPENAI_API_KEY),
    supabase: db.isConfigured(),
    adminSecret: Boolean(config.ADMIN_SECRET),
    ffmpeg: true,
    maxFileMb: Math.round(config.MAX_FILE_SIZE / 1024 / 1024),
    maxDurationSeconds: config.MAX_DURATION_SECONDS,
    maxSyncSegments: config.MAX_SYNC_SEGMENTS,
    busy: jobRunning,
    autoRouting: true,
    adminCostLog: true,
    transcriptionModel: config.TRANSCRIBE_MODEL,
    diarizationModel: config.DIARIZE_MODEL,
    realtimeTranslateModel: config.REALTIME_TRANSLATE_MODEL,
    realtimeTranscribeModel: config.REALTIME_TRANSCRIBE_MODEL,
    translationModel: config.TEXT_MODEL,
    translationFallbackModel: config.TEXT_FALLBACK_MODEL,
    translationReasoningEffort: config.TEXT_REASONING_EFFORT,
    audioDubModel: config.AUDIO_DUB_MODEL,
    ttsFallbackModel: config.TTS_FALLBACK_MODEL,
    voiceProfileModel: config.VOICE_PROFILE_MODEL,
    syncMode: 'automatic-openai-routing'
  });
});

app.post('/api/client', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) return res.status(400).json({ error: 'Email client obligatoire.' });
    const result = await db.ensureClientAndWallet(email, cleanText(req.body.name || ''));
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur création client.' });
  }
});

app.get('/api/wallet', async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ error: 'Email client obligatoire.' });
    const result = await db.ensureClientAndWallet(email);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur lecture portefeuille.' });
  }
});

app.post('/api/admin/add-tokens', async (req, res) => {
  try {
    requireAdmin(req);
    const email = normalizeEmail(req.body.email);
    const minutes = Number(req.body.tokens || req.body.minutes || 0);
    if (!email) return res.status(400).json({ error: 'Email client obligatoire.' });
    if (!Number.isInteger(minutes) || minutes <= 0) {
      return res.status(400).json({ error: 'Nombre de minutes invalide.' });
    }

    const result = await db.addMinutesToWallet({
      email,
      minutes,
      packName: cleanText(req.body.packName || 'Ajout manuel'),
      amountEur: Number(req.body.amountEur || 0),
      revolutPaymentId: cleanText(req.body.revolutPaymentId || '')
    });

    res.json({
      ok: true,
      message: `${minutes} minute(s) ajoutée(s) au client ${email}.`,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur ajout minutes.' });
  }
});

app.get('/api/admin/cost-log', async (req, res) => {
  try {
    requireAdmin(req);
    const result = await db.getAdminCostLog(Number(req.query.limit || 50));
    res.json({
      ok: true,
      currency: 'USD',
      estimateOnly: true,
      message: 'Coûts API estimés pour le pilotage. La facture OpenAI finale reste la référence.',
      ...result
    });
  } catch (error) {
    res.status(403).json({ error: error.message || 'Accès admin refusé.' });
  }
});

app.post('/api/dub-video', upload.single('media'), async (req, res) => {
  const uploaded = req.file;
  const jobId = crypto.randomBytes(8).toString('hex');
  const createdFiles = [];
  let chargedClient = null;
  let chargedMinutes = 0;
  let adminFreeMode = false;

  if (jobRunning) {
    if (uploaded?.path) safeDelete(uploaded.path);
    return res.status(429).json({ error: 'Un doublage est déjà en cours.' });
  }

  jobRunning = true;
  console.log(`[${jobId}] START`);

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY manquante dans Render.');
    }
    db.requireSupabase();
    if (!uploaded) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    adminFreeMode = isAdminFreeRequest(req);
    const clientEmail = normalizeEmail(req.body.clientEmail || req.body.email);
    const effectiveEmail = adminFreeMode ? 'admin@viralvoice.local' : clientEmail;
    if (!effectiveEmail) {
      return res.status(400).json({
        error: 'Email client obligatoire pour utiliser les minutes.'
      });
    }

    const isVideo = String(uploaded.mimetype || '').startsWith('video/');
    const isAudio = String(uploaded.mimetype || '').startsWith('audio/');
    if (!isVideo && !isAudio) {
      return res.status(400).json({
        error: 'Format non supporté. Utilise une vidéo ou un audio.'
      });
    }

    const options = {
      targetLanguage: cleanText(req.body.targetLanguage || 'anglais'),
      selectedVoice: cleanVoice(req.body.voice || 'alloy'),
      maleVoice: cleanVoice(req.body.maleVoice || 'cedar'),
      femaleVoice: cleanVoice(req.body.femaleVoice || 'coral'),
      firstSpeakerRole: cleanSpeakerRole(req.body.firstSpeakerRole || 'auto'),
      multiVoiceRequested: true,
      voiceVolume: clamp(Number(req.body.voiceVolume || 1), 0.6, 1.3),
      originalVolume: clamp(Number(req.body.originalVolume || 0.18), 0, 0.6)
    };

    const inputPath = uploaded.path;
    const sourceAudioPath = path.join(config.WORK_DIR, `${jobId}-source.mp3`);
    const timelinePath = path.join(config.WORK_DIR, `${jobId}-timeline.mp3`);
    const silentPath = path.join(config.WORK_DIR, `${jobId}-silent.wav`);
    const finalAudioPath = path.join(config.OUTPUT_DIR, `${jobId}-viralvoice-audio.mp3`);
    const finalVideoPath = path.join(config.OUTPUT_DIR, `${jobId}-viralvoice-video.mp4`);
    createdFiles.push(inputPath, sourceAudioPath, timelinePath, silentPath);

    const mediaInfo = await media.getMediaInfo(inputPath);
    const duration = mediaInfo.duration;
    if (!duration || duration <= 0) {
      throw new Error('Durée du fichier impossible à lire.');
    }
    if (duration > config.MAX_DURATION_SECONDS) {
      return res.status(400).json({
        error: `Fichier trop long. Limite actuelle : ${config.MAX_DURATION_SECONDS} secondes.`
      });
    }

    const minutesNeeded = Math.max(1, Math.ceil(duration / 60));
    if (adminFreeMode) {
      chargedClient = (
        await db.ensureClientAndWallet(effectiveEmail, 'Admin ViralVoice')
      ).client;
    } else {
      chargedClient = (await db.consumeMinutes(effectiveEmail, minutesNeeded)).client;
      chargedMinutes = minutesNeeded;
    }

    if (isVideo) await media.extractAudio(inputPath, sourceAudioPath);
    else await media.convertAudio(inputPath, sourceAudioPath);

    const transcription = await speech.transcribeWithSpeakerTimeline(
      sourceAudioPath,
      duration,
      jobId
    );

    let segments = speech.normalizeSegments(transcription.segments, duration);
    segments = speech.mergeAdjacentSpeakerSegments(segments);
    segments = speech.limitSegmentCount(segments, config.MAX_SYNC_SEGMENTS);
    if (!segments.length) {
      throw new Error('Transcription vide. Essaie avec un audio plus clair.');
    }

    const speakers = [...new Set(segments.map(segment => segment.speaker))];
    let route = autoDubbing.chooseRoute({
      speakers,
      targetLanguage: options.targetLanguage
    });
    let routeFallbackReason = null;
    let dubbing = null;

    console.log(
      `[${jobId}] AUTO ROUTE ${route.id} speakers=${speakers.length} ` +
      `segments=${segments.length} language=${options.targetLanguage}`
    );

    if (route.id.startsWith('realtime-')) {
      try {
        dubbing = await autoDubbing.runRealtimeAdaptive({
          sourceAudioPath,
          segments,
          targetLanguage: options.targetLanguage,
          duration,
          timelinePath,
          silentPath,
          finalAudioPath,
          voiceVolume: options.voiceVolume,
          createdFiles,
          jobId
        });
      } catch (realtimeError) {
        routeFallbackReason = realtimeError.message || 'Moteur temps réel indisponible.';
        console.warn(`[${jobId}] REALTIME AUTO FALLBACK`, routeFallbackReason);
        route = {
          id: speakers.length > 1
            ? 'segmented-multispeaker-auto-fallback'
            : 'segmented-auto-fallback',
          label: speakers.length > 1
            ? 'Doublage multi-intervenants synchronisé'
            : 'Doublage synchronisé de secours',
          reason: 'Le moteur direct a demandé un secours automatique.'
        };
      }
    }

    if (!dubbing) {
      const speakerProfiles = await detectSpeakerProfiles({
        sourceAudioPath,
        segments,
        speakers,
        options,
        createdFiles,
        jobId
      });

      dubbing = await autoDubbing.runSegmentedPremium({
        segments,
        speakers,
        speakerProfiles,
        options,
        duration,
        timelinePath,
        silentPath,
        finalAudioPath,
        createdFiles,
        jobId
      });
    }

    const translated = dubbing.translated;
    const prepared = dubbing.prepared;
    const realtimeRoute = route.id.startsWith('realtime-');

    const payload = {
      ok: true,
      clientEmail: effectiveEmail,
      adminFreeMode,
      durationSeconds: Number(duration.toFixed(3)),
      minutesUsed: adminFreeMode ? 0 : minutesNeeded,
      autoRouting: true,
      autoEngine: route.id,
      autoEngineLabel: route.label,
      autoEngineReason: route.reason,
      autoFallbackReason: routeFallbackReason,
      transcript: segments.map(item => `${item.speaker}: ${item.text}`).join('\n'),
      translation: translated
        .map(item => `${item.speaker}: ${item.translatedText}`)
        .join('\n'),
      multiVoiceRequested: true,
      multiVoiceUsed: speakers.length > 1,
      speakersDetected: speakers.length,
      speakerProfiles: dubbing.speakerProfiles,
      speakerVoices: dubbing.voiceMap,
      voiceDetectionMode: realtimeRoute
        ? 'dynamic-source-adaptation'
        : options.firstSpeakerRole === 'auto'
          ? 'automatic-audio-profile'
          : 'manual-first-speaker',
      synchronizedSegments: prepared.length,
      durationAdaptedSegments: realtimeRoute
        ? prepared.length
        : translated.filter(
          item => speech.countWords(item.translatedText) <= item.wordBudget + 2
        ).length,
      syncMode: dubbing.syncMode,
      transcriptionMode: transcription.mode,
      transcriptionModel: config.DIARIZE_MODEL,
      translationModel: dubbing.translationModel,
      audioDubModel: dubbing.audioDubModel,
      voiceEngines: dubbing.voiceEngines,
      voiceFallbackSegments: dubbing.voiceFallbackSegments,
      warning: transcription.warning || null,
      lipSyncRequested: false,
      lipSyncUsed: false,
      lipSyncEngine: null,
      lipSyncWarning: null,
      dubbedAudioUrl: `/outputs/${path.basename(finalAudioPath)}`
    };

    if (isVideo) {
      await media.muxVideoWithDub({
        videoPath: inputPath,
        voicePath: finalAudioPath,
        outputPath: finalVideoPath,
        originalVolume: options.originalVolume,
        hasOriginalAudio: mediaInfo.hasAudio
      });
      payload.dubbedVideoUrl = `/outputs/${path.basename(finalVideoPath)}`;
    }

    const apiCost = costMeter.estimateRouteCost({
      durationSeconds: duration,
      route: route.id,
      speakers: speakers.length,
      segments: prepared.length,
      realtimeTranscription: realtimeRoute
    });

    await db.recordGeneration({
      clientId: chargedClient.id,
      prompt: `Doublage automatique ${route.id} vers ${options.targetLanguage}`,
      voiceStyle: route.id,
      resultUrl: payload.dubbedVideoUrl || payload.dubbedAudioUrl,
      status: adminFreeMode ? 'admin_free' : 'completed',
      tokensUsed: adminFreeMode ? 0 : minutesNeeded,
      durationSeconds: Number(duration.toFixed(3)),
      apiCostEstimateUsd: apiCost.estimatedUsd,
      apiCostPerMinuteUsd: apiCost.costPerMinuteUsd,
      apiCostBreakdown: apiCost,
      modelRoute: route.id
    });

    payload.wallet = await db.getWalletByClientId(chargedClient.id);
    console.log(
      `[${jobId}] DONE route=${route.id} estimatedApiCost=` +
      `$${apiCost.estimatedUsd.toFixed(4)} (${apiCost.costPerMinuteCents.toFixed(1)}c/min)`
    );
    res.json(payload);
  } catch (error) {
    console.error(`[${jobId}] ERROR`, error);

    if (chargedMinutes > 0 && chargedClient) {
      await db.refundMinutes(chargedClient.id, chargedMinutes).catch(() => {});
      await db.recordGeneration({
        clientId: chargedClient.id,
        prompt: 'Doublage échoué',
        voiceStyle: cleanVoice(req.body.voice || 'alloy'),
        resultUrl: null,
        status: 'failed',
        tokensUsed: 0
      }).catch(() => {});
    }

    res.status(500).json({
      error: error.message || 'Erreur pendant le doublage.'
    });
  } finally {
    jobRunning = false;
    createdFiles.forEach(safeDelete);
    if (uploaded?.path) safeDelete(uploaded.path);
    logMemory(jobId);
  }
});

async function detectSpeakerProfiles({
  sourceAudioPath,
  segments,
  speakers,
  options,
  createdFiles,
  jobId
}) {
  if (!options.multiVoiceRequested) {
    return speech.buildManualSpeakerProfiles(speakers, options.firstSpeakerRole);
  }

  if (options.firstSpeakerRole !== 'auto') {
    return speech.buildManualSpeakerProfiles(speakers, options.firstSpeakerRole);
  }

  const profiles = {};
  const selectedSpeakers = speakers.slice(0, Math.max(1, config.MAX_PROFILE_SPEAKERS));

  await Promise.all(selectedSpeakers.map(async speaker => {
    const sample = speech.pickRepresentativeSegment(segments, speaker);
    if (!sample) {
      profiles[speaker] = {
        profile: 'neutral',
        confidence: 0,
        source: 'no-sample'
      };
      return;
    }

    const safeSpeaker = String(speaker).replace(/[^a-zA-Z0-9_-]/g, '_');
    const samplePath = path.join(
      config.WORK_DIR,
      `${jobId}-profile-${safeSpeaker}.mp3`
    );
    createdFiles.push(samplePath);

    try {
      await media.extractAudioSegment(
        sourceAudioPath,
        samplePath,
        sample.start,
        sample.duration
      );
      profiles[speaker] = await speech.classifyVoiceProfile(
        samplePath,
        speaker,
        jobId
      );
    } catch (error) {
      console.warn(`[${jobId}] VOICE PROFILE FALLBACK ${speaker}`, error.message || error);
      profiles[speaker] = {
        profile: 'neutral',
        confidence: 0,
        source: 'sample-error'
      };
    }
  }));

  speakers.slice(selectedSpeakers.length).forEach(speaker => {
    profiles[speaker] = {
      profile: 'neutral',
      confidence: 0,
      source: 'speaker-limit'
    };
  });

  return speech.reconcileSpeakerProfiles(profiles, speakers);
}

function requireAdmin(req) {
  if (!config.ADMIN_SECRET) {
    throw new Error('ADMIN_SECRET manquant dans Render.');
  }
  const secret = String(req.headers['x-admin-secret'] || req.body?.adminSecret || '');
  if (secret !== config.ADMIN_SECRET) {
    throw new Error('Accès admin refusé.');
  }
}

function isAdminFreeRequest(req) {
  if (!config.ADMIN_SECRET) return false;
  return String(req.headers['x-admin-secret'] || req.body?.adminSecret || '') ===
    config.ADMIN_SECRET;
}

setInterval(() => {
  const now = Date.now();

  [config.OUTPUT_DIR, config.WORK_DIR].forEach(dir => {
    fs.readdir(dir, (error, files) => {
      if (error) return;

      files.forEach(file => {
        const fullPath = path.join(dir, file);
        fs.stat(fullPath, (statError, stat) => {
          if (
            !statError &&
            now - stat.mtimeMs > config.CLEANUP_AFTER_MS
          ) {
            safeDelete(fullPath);
          }
        });
      });
    });
  });
}, 10 * 60 * 1000);

app.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error:
        `Fichier trop lourd. Limite : ` +
        `${Math.round(config.MAX_FILE_SIZE / 1024 / 1024)} MB.`
    });
  }

  res.status(500).json({
    error: error.message || 'Erreur serveur.'
  });
});

app.listen(config.PORT, () => {
  console.log(`ViralVoice 4.0.2 démarré sur ${config.PORT}`);
});