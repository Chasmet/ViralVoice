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

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const WORK_DIR = path.join(__dirname, 'tmp');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 80 * 1024 * 1024);
const CLEANUP_AFTER_MS = Number(process.env.CLEANUP_AFTER_MS || 60 * 60 * 1000);

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: WORK_DIR,
  limits: { fileSize: MAX_FILE_SIZE }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/outputs', express.static(OUTPUT_DIR));
app.use(express.static(PUBLIC_DIR));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'ViralVoice',
    version: '1.0.0',
    openaiKey: Boolean(process.env.OPENAI_API_KEY),
    maxFileMb: Math.round(MAX_FILE_SIZE / 1024 / 1024)
  });
});

app.post('/api/dub-video', upload.single('media'), async (req, res) => {
  const uploaded = req.file;
  const createdFiles = [];

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY manquante dans Render.' });
    }

    if (!uploaded) {
      return res.status(400).json({ error: 'Aucun fichier reçu.' });
    }

    const targetLanguage = cleanText(req.body.targetLanguage || 'anglais');
    const voice = cleanVoice(req.body.voice || 'alloy');
    const voiceVolume = clamp(Number(req.body.voiceVolume || 1), 0.6, 1.3);
    const originalVolume = clamp(Number(req.body.originalVolume || 0.18), 0, 0.6);
    const isVideo = String(uploaded.mimetype || '').startsWith('video/');
    const isAudio = String(uploaded.mimetype || '').startsWith('audio/');

    if (!isVideo && !isAudio) {
      return res.status(400).json({ error: 'Format non supporté. Utilise une vidéo ou un audio.' });
    }

    const jobId = crypto.randomBytes(8).toString('hex');
    const inputPath = uploaded.path;
    const audioForTranscription = path.join(WORK_DIR, `${jobId}-source.mp3`);
    const ttsPath = path.join(WORK_DIR, `${jobId}-voice.mp3`);
    const finalAudioPath = path.join(OUTPUT_DIR, `${jobId}-viralvoice-audio.mp3`);
    const finalVideoPath = path.join(OUTPUT_DIR, `${jobId}-viralvoice-video.mp4`);
    createdFiles.push(inputPath, audioForTranscription, ttsPath);

    if (isVideo) {
      await extractAudio(inputPath, audioForTranscription);
    } else {
      await convertAudio(inputPath, audioForTranscription);
    }

    const transcript = await transcribeAudio(audioForTranscription);
    if (!transcript) {
      throw new Error('Transcription vide. Essaie avec un audio plus clair.');
    }

    const translation = await translateText(transcript, targetLanguage);
    if (!translation) {
      throw new Error('Traduction vide. Réessaie avec un fichier plus court.');
    }

    await generateVoice(translation, voice, ttsPath);
    await normalizeVoice(ttsPath, finalAudioPath, voiceVolume);

    const responsePayload = {
      ok: true,
      transcript,
      translation,
      dubbedAudioUrl: `/outputs/${path.basename(finalAudioPath)}`
    };

    if (isVideo) {
      await muxVideoWithDub(inputPath, ttsPath, finalVideoPath, originalVolume, voiceVolume);
      responsePayload.dubbedVideoUrl = `/outputs/${path.basename(finalVideoPath)}`;
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('ViralVoice error:', error);
    res.status(500).json({ error: error.message || 'Erreur pendant le doublage.' });
  } finally {
    for (const filePath of createdFiles) {
      safeDelete(filePath);
    }
    if (uploaded && uploaded.path) safeDelete(uploaded.path);
  }
});

async function transcribeAudio(audioPath) {
  const result = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
    response_format: 'text'
  });

  return String(result || '').trim();
}

async function translateText(text, targetLanguage) {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Tu es un traducteur pour doublage vidéo. Réponds uniquement avec le texte traduit, sans explication. Garde un style oral naturel, clair et fluide.'
      },
      {
        role: 'user',
        content: `Traduis ce texte en ${targetLanguage}. Garde les phrases naturelles pour une voix off.\n\n${text}`
      }
    ]
  });

  return String(completion.choices?.[0]?.message?.content || '').trim();
}

async function generateVoice(text, voice, outputPath) {
  const mp3 = await openai.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    voice,
    input: text,
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
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(44100)
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
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(44100)
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
      .audioBitrate('160k')
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
        '-map 0:v:0',
        '-map [aout]',
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
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
  return String(value || '').trim().slice(0, 40);
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

setInterval(() => {
  const now = Date.now();
  for (const dir of [OUTPUT_DIR, WORK_DIR]) {
    fs.readdir(dir, (error, files) => {
      if (error) return;
      files.forEach(file => {
        const fullPath = path.join(dir, file);
        fs.stat(fullPath, (statError, stat) => {
          if (statError) return;
          if (now - stat.mtimeMs > CLEANUP_AFTER_MS) safeDelete(fullPath);
        });
      });
    });
  }
}, 15 * 60 * 1000);

app.use((error, req, res, next) => {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fichier trop lourd pour la V1.' });
  }
  res.status(500).json({ error: error.message || 'Erreur serveur.' });
});

app.listen(PORT, () => {
  console.log(`ViralVoice démarré sur le port ${PORT}`);
});
