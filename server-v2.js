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
  version: '2.0.0-speaker-timeline-sync'
}));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  app: 'ViralVoice API',
  version: '2.0.0-speaker-timeline-sync',
  openaiKey: Boolean(process.env.OPENAI_API_KEY),
  supabase: db.isConfigured(),
  adminSecret: Boolean(config.ADMIN_SECRET),
  ffmpeg: true,
  maxFileMb: Math.round(config.MAX_FILE_SIZE / 1024 / 1024),
  maxDurationSeconds: config.MAX_DURATION_SECONDS,
  maxSyncSegments: config.MAX_SYNC_SEGMENTS,
  busy: jobRunning,
  transcriptionModel: config.TRANSCRIBE_MODEL,
  diarizationModel: config.DIARIZE_MODEL,
  translationModel: config.TEXT_MODEL,
  ttsModel: config.TTS_MODEL,
  syncMode: 'speaker-segments-with-original-timestamps'
}));

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
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquante dans Render.');
    db.requireSupabase();
    if (!uploaded) return res.status(400).json({ error: 'Aucun fichier reçu.' });

    adminFreeMode = isAdminFreeRequest(req);
    const clientEmail = normalizeEmail(req.body.clientEmail || req.body.email);
    const effectiveEmail = adminFreeMode ? 'admin@viralvoice.local' : clientEmail;
    if (!effectiveEmail) {
      return res.status(400).json({ error: 'Email client obligatoire pour utiliser les minutes.' });
    }

    const isVideo = String(uploaded.mimetype || '').startsWith('video/');
    const isAudio = String(uploaded.mimetype || '').startsWith('audio/');
    if (!isVideo && !isAudio) {
      return res.status(400).json({ error: 'Format non supporté. Utilise une vidéo ou un audio.' });
    }

    const options = {
      targetLanguage: cleanText(req.body.targetLanguage || 'anglais'),
      selectedVoice: cleanVoice(req.body.voice || 'alloy'),
      maleVoice: cleanVoice(req.body.maleVoice || 'cedar'),
      femaleVoice: cleanVoice(req.body.femaleVoice || 'coral'),
      firstSpeakerRole: cleanSpeakerRole(req.body.firstSpeakerRole || 'male'),
      multiVoiceRequested: String(req.body.multiVoice || 'false') === 'true',
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
    if (!duration || duration <= 0) throw new Error('Durée du fichier impossible à lire.');
    if (duration > config.MAX_DURATION_SECONDS) {
      return res.status(400).json({
        error: `Fichier trop long. Limite actuelle : ${config.MAX_DURATION_SECONDS} secondes.`
      });
    }

    const minutesNeeded = Math.max(1, Math.ceil(duration / 60));
    if (adminFreeMode) {
      chargedClient = (await db.ensureClientAndWallet(effectiveEmail, 'Admin ViralVoice')).client;
    } else {
      chargedClient = (await db.consumeMinutes(effectiveEmail, minutesNeeded)).client;
      chargedMinutes = minutesNeeded;
    }

    if (isVideo) await media.extractAudio(inputPath, sourceAudioPath);
    else await media.convertAudio(inputPath, sourceAudioPath);

    const transcription = await speech.transcribeWithSpeakerTimeline(
      sourceAudioPath, duration, jobId
    );
    let segments = speech.normalizeSegments(transcription.segments, duration);
    segments = speech.mergeAdjacentSpeakerSegments(segments);
    segments = speech.limitSegmentCount(segments, config.MAX_SYNC_SEGMENTS);
    if (!segments.length) throw new Error('Transcription vide. Essaie avec un audio plus clair.');

    const speakers = [...new Set(segments.map(segment => segment.speaker))];
    const translated = await speech.translateTimedSegments(
      segments, options.targetLanguage, jobId
    );
    const voiceMap = speech.buildSpeakerVoiceMap({ speakers, ...options });
    const prepared = [];

    for (let index = 0; index < translated.length; index += 1) {
      const segment = translated[index];
      const slotDuration = Math.max(0.25, segment.end - segment.start);
      const rawPath = path.join(config.WORK_DIR, `${jobId}-${index}-raw.wav`);
      const fitPath = path.join(config.WORK_DIR, `${jobId}-${index}-fit.wav`);
      createdFiles.push(rawPath, fitPath);
      const voice = voiceMap[segment.speaker] || options.selectedVoice;
      await speech.generateVoiceSegment({
        text: segment.translatedText,
        voice,
        outputPath: rawPath,
        slotDuration,
        role: speech.getSpeakerRole(segment.speaker, speakers, options.firstSpeakerRole)
      });
      await media.fitVoiceToDuration(rawPath, fitPath, slotDuration);
      prepared.push({ ...segment, voice, audioPath: fitPath });
      console.log(
        `[${jobId}] SEGMENT ${index + 1}/${translated.length} ` +
        `${segment.speaker} ${segment.start.toFixed(2)}-${segment.end.toFixed(2)} ${voice}`
      );
    }

    await media.createSilentAudio(silentPath, duration);
    await media.renderSpeakerTimeline(silentPath, prepared, timelinePath, duration);
    await media.normalizeVoice(timelinePath, finalAudioPath, options.voiceVolume);

    const payload = {
      ok: true,
      clientEmail: effectiveEmail,
      adminFreeMode,
      durationSeconds: Number(duration.toFixed(3)),
      minutesUsed: adminFreeMode ? 0 : minutesNeeded,
      transcript: segments.map(item => `${item.speaker}: ${item.text}`).join('\n'),
      translation: translated.map(item => `${item.speaker}: ${item.translatedText}`).join('\n'),
      multiVoiceRequested: options.multiVoiceRequested,
      multiVoiceUsed: options.multiVoiceRequested && speakers.length > 1,
      speakersDetected: speakers.length,
      speakerVoices: voiceMap,
      synchronizedSegments: prepared.length,
      syncMode: 'speaker-segments-with-original-timestamps',
      transcriptionMode: transcription.mode,
      warning: transcription.warning || null,
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

    await db.recordGeneration({
      clientId: chargedClient.id,
      prompt: `Doublage synchronisé vers ${options.targetLanguage}`,
      voiceStyle: payload.multiVoiceUsed ? 'multi-speaker' : options.selectedVoice,
      resultUrl: payload.dubbedVideoUrl || payload.dubbedAudioUrl,
      status: adminFreeMode ? 'admin_free' : 'completed',
      tokensUsed: adminFreeMode ? 0 : minutesNeeded
    });
    payload.wallet = await db.getWalletByClientId(chargedClient.id);
    console.log(`[${jobId}] DONE`);
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
    res.status(500).json({ error: error.message || 'Erreur pendant le doublage.' });
  } finally {
    jobRunning = false;
    createdFiles.forEach(safeDelete);
    if (uploaded?.path) safeDelete(uploaded.path);
    logMemory(jobId);
  }
});

function requireAdmin(req) {
  if (!config.ADMIN_SECRET) throw new Error('ADMIN_SECRET manquant dans Render.');
  const secret = String(req.headers['x-admin-secret'] || req.body.adminSecret || '');
  if (secret !== config.ADMIN_SECRET) throw new Error('Accès admin refusé.');
}

function isAdminFreeRequest(req) {
  if (!config.ADMIN_SECRET) return false;
  return String(req.headers['x-admin-secret'] || req.body.adminSecret || '') ===
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
          if (!statError && now - stat.mtimeMs > config.CLEANUP_AFTER_MS) safeDelete(fullPath);
        });
      });
    });
  });
}, 10 * 60 * 1000);

app.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `Fichier trop lourd. Limite : ${Math.round(config.MAX_FILE_SIZE / 1024 / 1024)} MB.`
    });
  }
  res.status(500).json({ error: error.message || 'Erreur serveur.' });
});

app.listen(config.PORT, () => {
  console.log(`ViralVoice 2.0 démarré sur ${config.PORT}`);
});
