require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const OpenAI = require('openai');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { createClient } = require('@supabase/supabase-js');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const WORK_DIR = path.join(__dirname, 'tmp');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 25 * 1024 * 1024);
const MAX_DURATION_SECONDS = Number(process.env.MAX_DURATION_SECONDS || 60);
const CLEANUP_AFTER_MS = Number(process.env.CLEANUP_AFTER_MS || 30 * 60 * 1000);

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

let jobRunning = false;

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: WORK_DIR,
  limits: { fileSize: MAX_FILE_SIZE }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/outputs', express.static(OUTPUT_DIR));
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.json({
    ok: true,
    app: 'ViralVoice API',
    mode: 'client-wallet-admin-free',
    endpoints: [
      '/api/health',
      '/api/client',
      '/api/wallet',
      '/api/admin/add-tokens',
      '/api/dub-video'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'ViralVoice API',
    version: '1.2.0-client-admin-wallet',
    openaiKey: Boolean(process.env.OPENAI_API_KEY),
    supabase: Boolean(supabase),
    adminSecret: Boolean(ADMIN_SECRET),
    ffmpeg: true,
    maxFileMb: Math.round(MAX_FILE_SIZE / 1024 / 1024),
    maxDurationSeconds: MAX_DURATION_SECONDS,
    busy: jobRunning,
    transcriptionModel: TRANSCRIBE_MODEL,
    translationModel: TEXT_MODEL,
    ttsModel: TTS_MODEL
  });
});

app.post('/api/client', async (req, res) => {
  try {
    requireSupabase();

    const email = normalizeEmail(req.body.email);
    const name = cleanText(req.body.name || '');

    if (!email) {
      return res.status(400).json({
        error: 'Email client obligatoire.'
      });
    }

    const { client, wallet } = await ensureClientAndWallet(email, name);

    res.json({
      ok: true,
      client,
      wallet
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Erreur création client.'
    });
  }
});

app.get('/api/wallet', async (req, res) => {
  try {
    requireSupabase();

    const email = normalizeEmail(req.query.email);

    if (!email) {
      return res.status(400).json({
        error: 'Email client obligatoire.'
      });
    }

    const { client, wallet } = await ensureClientAndWallet(email, '');

    res.json({
      ok: true,
      client,
      wallet
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Erreur lecture portefeuille.'
    });
  }
});

app.post('/api/admin/add-tokens', async (req, res) => {
  try {
    requireSupabase();
    requireAdmin(req);

    const email = normalizeEmail(req.body.email);
    const tokens = Number(req.body.tokens || 0);
    const packName = cleanText(req.body.packName || 'Pack manuel');
    const amountEur = Number(req.body.amountEur || 0);
    const revolutPaymentId = cleanText(req.body.revolutPaymentId || '');

    if (!email) {
      return res.status(400).json({
        error: 'Email client obligatoire.'
      });
    }

    if (!Number.isInteger(tokens) || tokens <= 0) {
      return res.status(400).json({
        error: 'Nombre de crédits invalide.'
      });
    }

    const { client, wallet } = await addTokensToWallet({
      email,
      tokens,
      packName,
      amountEur,
      revolutPaymentId
    });

    res.json({
      ok: true,
      message: `${tokens} crédit(s) ajouté(s) au client ${email}.`,
      client,
      wallet
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Erreur ajout crédits.'
    });
  }
});

app.post('/api/dub-video', upload.single('media'), async (req, res) => {
  const uploaded = req.file;
  const createdFiles = [];
  const jobId = crypto.randomBytes(8).toString('hex');

  let chargedClient = null;
  let charged = false;
  let adminFreeMode = false;

  if (jobRunning) {
    if (uploaded && uploaded.path) safeDelete(uploaded.path);
    return res.status(429).json({
      error: 'Un doublage est déjà en cours. Attends la fin avant de relancer.'
    });
  }

  jobRunning = true;
  console.log(`[${jobId}] START`);

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OPENAI_API_KEY manquante dans Render.'
      });
    }

    requireSupabase();

    if (!uploaded) {
      return res.status(400).json({
        error: 'Aucun fichier reçu.'
      });
    }

    adminFreeMode = isAdminFreeRequest(req);

    const clientEmail = normalizeEmail(req.body.clientEmail || req.body.email);
    const effectiveClientEmail = adminFreeMode ? 'admin@viralvoice.local' : clientEmail;

    if (!effectiveClientEmail) {
      return res.status(400).json({
        error: 'Email client obligatoire pour utiliser les crédits.'
      });
    }

    const targetLanguage = cleanText(req.body.targetLanguage || 'anglais');
    const voice = cleanVoice(req.body.voice || 'alloy');
    const voiceVolume = clamp(Number(req.body.voiceVolume || 1), 0.6, 1.3);
    const originalVolume = clamp(Number(req.body.originalVolume || 0.18), 0, 0.6);

    const isVideo = String(uploaded.mimetype || '').startsWith('video/');
    const isAudio = String(uploaded.mimetype || '').startsWith('audio/');

    if (!isVideo && !isAudio) {
      return res.status(400).json({
        error: 'Format non supporté. Utilise une vidéo ou un audio.'
      });
    }

    if (adminFreeMode) {
      const { client } = await ensureClientAndWallet(effectiveClientEmail, 'Admin ViralVoice');
      chargedClient = client;
      charged = false;
      console.log(`[${jobId}] ADMIN FREE MODE`);
    } else {
      const { client } = await consumeOneToken(effectiveClientEmail);
      chargedClient = client;
      charged = true;
    }

    const inputPath = uploaded.path;
    const audioForTranscription = path.join(WORK_DIR, `${jobId}-source.mp3`);
    const ttsPath = path.join(WORK_DIR, `${jobId}-voice.mp3`);
    const finalAudioPath = path.join(OUTPUT_DIR, `${jobId}-viralvoice-audio.mp3`);
    const finalVideoPath = path.join(OUTPUT_DIR, `${jobId}-viralvoice-video.mp4`);

    createdFiles.push(inputPath, audioForTranscription, ttsPath);

    console.log(`[${jobId}] FILE size=${uploaded.size} type=${uploaded.mimetype}`);

    const duration = await getDurationSeconds(inputPath);
    console.log(`[${jobId}] DURATION ${duration}s`);

    if (duration > MAX_DURATION_SECONDS) {
      throw new Error(`Fichier trop long pour Render gratuit. Limite actuelle : ${MAX_DURATION_SECONDS} secondes.`);
    }

    if (isVideo) {
      console.log(`[${jobId}] EXTRACT AUDIO`);
      await extractAudio(inputPath, audioForTranscription);
    } else {
      console.log(`[${jobId}] CONVERT AUDIO`);
      await convertAudio(inputPath, audioForTranscription);
    }

    const transcript = await transcribeAudio(audioForTranscription);
    console.log(`[${jobId}] TRANSCRIPT chars=${transcript.length}`);

    if (!transcript) {
      throw new Error('Transcription vide. Essaie avec un audio plus clair.');
    }

    const translation = await translateText(transcript, targetLanguage);
    console.log(`[${jobId}] TRANSLATION chars=${translation.length}`);

    if (!translation) {
      throw new Error('Traduction vide. Réessaie avec un fichier plus court.');
    }

    await generateVoice(translation, voice, ttsPath);
    console.log(`[${jobId}] TTS OK`);

    await normalizeVoice(ttsPath, finalAudioPath, voiceVolume);
    console.log(`[${jobId}] AUDIO OK`);

    const responsePayload = {
      ok: true,
      clientEmail: effectiveClientEmail,
      adminFreeMode,
      transcript,
      translation,
      multiVoiceUsed: false,
      speakersDetected: 1,
      dubbedAudioUrl: `/outputs/${path.basename(finalAudioPath)}`
    };

    if (isVideo) {
      console.log(`[${jobId}] MUX VIDEO`);
      await muxVideoWithDub(inputPath, ttsPath, finalVideoPath, originalVolume, voiceVolume);
      responsePayload.dubbedVideoUrl = `/outputs/${path.basename(finalVideoPath)}`;
    }

    await recordGeneration({
      clientId: chargedClient.id,
      prompt: adminFreeMode
        ? `Admin gratuit - doublage vers ${targetLanguage}`
        : `Doublage vers ${targetLanguage}`,
      voiceStyle: voice,
      resultUrl: responsePayload.dubbedVideoUrl || responsePayload.dubbedAudioUrl,
      status: adminFreeMode ? 'admin_free' : 'completed',
      tokensUsed: adminFreeMode ? 0 : 1
    });

    const wallet = await getWalletByClientId(chargedClient.id);
    responsePayload.wallet = wallet;

    console.log(`[${jobId}] DONE`);
    res.json(responsePayload);
  } catch (error) {
    console.error(`[${jobId}] ERROR`, error);

    if (charged && chargedClient) {
      await refundOneToken(chargedClient.id).catch(refundError => {
        console.error(`[${jobId}] REFUND ERROR`, refundError);
      });

      await recordGeneration({
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

    for (const filePath of createdFiles) {
      safeDelete(filePath);
    }

    if (uploaded && uploaded.path) {
      safeDelete(uploaded.path);
    }

    logMemory(jobId);
  }
});

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase non configuré. Vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans Render.');
  }
}

function requireAdmin(req) {
  if (!ADMIN_SECRET) {
    throw new Error('ADMIN_SECRET manquant dans Render.');
  }

  const givenSecret = String(req.headers['x-admin-secret'] || req.body.adminSecret || '');

  if (!givenSecret || givenSecret !== ADMIN_SECRET) {
    throw new Error('Accès admin refusé.');
  }
}

function isAdminFreeRequest(req) {
  if (!ADMIN_SECRET) return false;

  const givenSecret = String(
    req.headers['x-admin-secret'] ||
    req.body.adminSecret ||
    ''
  );

  return givenSecret === ADMIN_SECRET;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 120);
}

async function ensureClientAndWallet(email, name = '') {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail) {
    throw new Error('Email client obligatoire.');
  }

  let { data: client, error: clientSelectError } = await supabase
    .from('clients')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (clientSelectError) {
    throw clientSelectError;
  }

  if (!client) {
    const { data: newClient, error: insertClientError } = await supabase
      .from('clients')
      .insert({
        email: cleanEmail,
        name: name || null
      })
      .select('*')
      .single();

    if (insertClientError) {
      throw insertClientError;
    }

    client = newClient;
  }

  let { data: wallet, error: walletSelectError } = await supabase
    .from('token_wallets')
    .select('*')
    .eq('client_id', client.id)
    .maybeSingle();

  if (walletSelectError) {
    throw walletSelectError;
  }

  if (!wallet) {
    const { data: newWallet, error: insertWalletError } = await supabase
      .from('token_wallets')
      .insert({
        client_id: client.id,
        token_balance: 0,
        total_tokens_purchased: 0,
        total_tokens_used: 0
      })
      .select('*')
      .single();

    if (insertWalletError) {
      throw insertWalletError;
    }

    wallet = newWallet;
  }

  return { client, wallet };
}

async function getWalletByClientId(clientId) {
  const { data: wallet, error } = await supabase
    .from('token_wallets')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (error) {
    throw error;
  }

  return wallet;
}

async function addTokensToWallet({ email, tokens, packName, amountEur, revolutPaymentId }) {
  const { client, wallet } = await ensureClientAndWallet(email, '');

  const newBalance = Number(wallet.token_balance || 0) + tokens;
  const newPurchased = Number(wallet.total_tokens_purchased || 0) + tokens;

  const { data: updatedWallet, error: updateError } = await supabase
    .from('token_wallets')
    .update({
      token_balance: newBalance,
      total_tokens_purchased: newPurchased,
      updated_at: new Date().toISOString()
    })
    .eq('client_id', client.id)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  const { error: paymentError } = await supabase
    .from('payments')
    .insert({
      client_id: client.id,
      revolut_payment_id: revolutPaymentId || null,
      pack_name: packName,
      amount_eur: amountEur,
      tokens_added: tokens,
      payment_status: 'paid'
    });

  if (paymentError) {
    throw paymentError;
  }

  return {
    client,
    wallet: updatedWallet
  };
}

async function consumeOneToken(email) {
  const { client, wallet } = await ensureClientAndWallet(email, '');

  const currentBalance = Number(wallet.token_balance || 0);

  if (currentBalance <= 0) {
    throw new Error('Solde insuffisant. Achète un pack pour générer une voix.');
  }

  const { data: updatedWallet, error: updateError } = await supabase
    .from('token_wallets')
    .update({
      token_balance: currentBalance - 1,
      total_tokens_used: Number(wallet.total_tokens_used || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('client_id', client.id)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  return {
    client,
    wallet: updatedWallet
  };
}

async function refundOneToken(clientId) {
  const wallet = await getWalletByClientId(clientId);

  const { data: updatedWallet, error: updateError } = await supabase
    .from('token_wallets')
    .update({
      token_balance: Number(wallet.token_balance || 0) + 1,
      total_tokens_used: Math.max(0, Number(wallet.total_tokens_used || 0) - 1),
      updated_at: new Date().toISOString()
    })
    .eq('client_id', clientId)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  return updatedWallet;
}

async function recordGeneration({ clientId, prompt, voiceStyle, resultUrl, status, tokensUsed = 1 }) {
  const { error } = await supabase
    .from('generations')
    .insert({
      client_id: clientId,
      prompt,
      voice_style: voiceStyle,
      tokens_used: tokensUsed,
      result_url: resultUrl,
      status
    });

  if (error) {
    throw error;
  }
}

function getDurationSeconds(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) return reject(error);
      const duration = Math.ceil(Number(metadata?.format?.duration || 0));
      resolve(duration);
    });
  });
}

async function transcribeAudio(audioPath) {
  const result = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: TRANSCRIBE_MODEL,
    response_format: 'text'
  });

  return String(result || '').trim();
}

async function translateText(text, targetLanguage) {
  const safeText = String(text || '').slice(0, 6000);

  const completion = await openai.chat.completions.create({
    model: TEXT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Tu es un traducteur pour doublage vidéo. Réponds uniquement avec le texte traduit, sans explication. Garde un style oral naturel et fluide.'
      },
      {
        role: 'user',
        content: `Traduis ce texte en ${targetLanguage}.\n\n${safeText}`
      }
    ]
  });

  return String(completion.choices?.[0]?.message?.content || '').trim();
}

async function generateVoice(text, voice, outputPath) {
  const safeText = String(text || '').slice(0, 6000);

  const mp3 = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice,
    input: safeText,
    format: 'mp3'
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
}

function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .audioChannels(1)
      .audioFrequency(24000)
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function convertAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .audioChannels(1)
      .audioFrequency(24000)
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function normalizeVoice(inputPath, outputPath, voiceVolume) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters([`volume=${voiceVolume}`])
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function muxVideoWithDub(videoPath, voicePath, outputPath, originalVolume, voiceVolume) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(voicePath)
      .complexFilter([
        `[0:a]volume=${originalVolume}[a0]`,
        `[1:a]volume=${voiceVolume}[a1]`,
        '[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0[aout]'
      ])
      .outputOptions([
        '-threads 1',
        '-map 0:v:0',
        '-map [aout]',
        '-c:v copy',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart',
        '-shortest'
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function cleanText(value) {
  return String(value || '').trim().slice(0, 80);
}

function cleanVoice(value) {
  const allowed = new Set(['alloy', 'ash', 'coral', 'sage', 'verse']);
  return allowed.has(value) ? value : 'alloy';
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeDelete(filePath) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
}

function logMemory(jobId) {
  const memory = process.memoryUsage();
  console.log(
    `[${jobId}] MEMORY rss=${Math.round(memory.rss / 1024 / 1024)}MB heap=${Math.round(memory.heapUsed / 1024 / 1024)}MB`
  );
}

setInterval(() => {
  const now = Date.now();

  for (const dir of [OUTPUT_DIR, WORK_DIR]) {
    fs.readdir(dir, (error, files) => {
      if (error) return;

      files.forEach(file => {
        const fullPath = path.join(dir, file);

        fs.stat(fullPath, (statError, stat) => {
          if (statError) return;

          if (now - stat.mtimeMs > CLEANUP_AFTER_MS) {
            safeDelete(fullPath);
          }
        });
      });
    });
  }
}, 10 * 60 * 1000);

app.use((error, req, res, next) => {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `Fichier trop lourd. Limite actuelle : ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`
    });
  }

  res.status(500).json({
    error: error.message || 'Erreur serveur.'
  });
});

app.listen(PORT, () => {
  console.log(`ViralVoice backend démarré sur ${PORT}`);
});
