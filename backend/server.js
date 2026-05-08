import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';

const execFileAsync = promisify(execFile);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const TRANSLATION_MODEL = process.env.TRANSLATION_MODEL || 'gpt-4o-mini';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
const TTS_MODEL = process.env.TTS_MODEL || 'gpt-4o-mini-tts';

const uploadDir = 'uploads';
const outputDir = 'outputs';

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 120 * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json());
app.use('/outputs', express.static(outputDir));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    app: 'ViralVoice API',
    mode: 'AI Video Dubbing',
    endpoints: ['/api/health', '/api/dub-video']
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    openaiKey: Boolean(process.env.OPENAI_API_KEY),
    ffmpeg: Boolean(ffmpegPath),
    transcriptionModel: TRANSCRIPTION_MODEL,
    translationModel: TRANSLATION_MODEL,
    ttsModel: TTS_MODEL
  });
});

app.post('/api/dub-video', upload.single('media'), async (req, res) => {
  const createdFiles = [];

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'Clé OpenAI manquante dans Render'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Aucun fichier envoyé'
      });
    }

    const targetLanguage = req.body.targetLanguage || 'anglais';
    const requestedVoice = req.body.voice || 'alloy';
    const voice = normalizeVoice(requestedVoice);
    const originalName = req.file.originalname || 'media';
    const mimeType = req.file.mimetype || '';
    const inputPath = req.file.path;
    const isVideo = mimeType.startsWith('video/');

    createdFiles.push(inputPath);

    const safeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const extractedAudioPath = path.join(outputDir, `${safeId}-source.mp3`);
    const dubbedAudioPath = path.join(outputDir, `${safeId}-voice.mp3`);
    const outputVideoPath = path.join(outputDir, `${safeId}-dubbed.mp4`);

    createdFiles.push(extractedAudioPath);

    await extractAudioForTranscription(inputPath, extractedAudioPath);

    const transcriptResponse = await client.audio.transcriptions.create({
      file: fs.createReadStream(extractedAudioPath),
      model: TRANSCRIPTION_MODEL
    });

    const transcript = transcriptResponse.text || '';

    if (!transcript.trim()) {
      throw new Error('Aucune voix détectée dans le fichier');
    }

    const translationResponse = await client.responses.create({
      model: TRANSLATION_MODEL,
      input: [
        {
          role: 'system',
          content: 'Tu es un traducteur spécialisé dans le doublage vidéo. Tu traduis naturellement, avec des phrases faciles à dire à voix haute. Tu ne rajoutes aucun commentaire.'
        },
        {
          role: 'user',
          content: `Traduis ce texte en ${targetLanguage}. Garde un ton naturel, fluide et oral. Texte :\n\n${transcript}`
        }
      ]
    });

    const translation = cleanText(translationResponse.output_text || '');

    const speechResponse = await client.audio.speech.create({
      model: TTS_MODEL,
      voice,
      input: truncateForTts(translation),
      response_format: 'mp3'
    });

    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
    fs.writeFileSync(dubbedAudioPath, audioBuffer);

    let dubbedVideoUrl = null;

    if (isVideo) {
      await replaceVideoAudio(inputPath, dubbedAudioPath, outputVideoPath);
      dubbedVideoUrl = buildPublicUrl(req, outputVideoPath);
    }

    safeUnlink(inputPath);
    safeUnlink(extractedAudioPath);

    res.json({
      ok: true,
      originalName,
      mode: isVideo ? 'video' : 'audio',
      transcript,
      translation,
      srt: generateSrt(translation),
      voice,
      dubbedAudioUrl: buildPublicUrl(req, dubbedAudioPath),
      dubbedVideoUrl
    });
  } catch (error) {
    console.error('ViralVoice error:', error);

    for (const file of createdFiles) {
      safeUnlink(file);
    }

    res.status(500).json({
      error: error.message || 'Erreur génération doublage vidéo'
    });
  }
});

async function extractAudioForTranscription(inputPath, outputPath) {
  await execFileAsync(ffmpegPath, [
    '-y',
    '-i', inputPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-b:a', '64k',
    outputPath
  ]);
}

async function replaceVideoAudio(videoPath, audioPath, outputPath) {
  await execFileAsync(ffmpegPath, [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '24',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    '-shortest',
    outputPath
  ]);
}

function normalizeVoice(voice) {
  const allowed = new Set([
    'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'
  ]);

  return allowed.has(voice) ? voice : 'alloy';
}

function cleanText(text) {
  return text
    .replace(/^\s*["“”]+|["“”]+\s*$/g, '')
    .trim();
}

function truncateForTts(text) {
  const limit = 3900;

  if (text.length <= limit) return text;

  return text.slice(0, limit) + '\n\n[Texte coupé pour ce premier test. Version longue à ajouter ensuite.]';
}

function buildPublicUrl(req, filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const host = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

  return `${host}/${normalizedPath}`;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn('Impossible de supprimer le fichier:', filePath);
  }
}

function generateSrt(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const parts = cleaned.match(/.{1,70}(?:\s|$)/g) || [];

  return parts.map((line, index) => {
    const start = index * 4;
    const end = start + 4;

    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${line.trim()}\n`;
  }).join('\n');
}

function formatSrtTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`;
}

app.listen(PORT, () => {
  console.log(`ViralVoice backend démarré sur ${PORT}`);
});
