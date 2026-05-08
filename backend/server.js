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
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || '';

const uploadDir = 'uploads';
const outputDir = 'outputs';

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 120 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());
app.use('/outputs', express.static(outputDir));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => {
  res.json({ ok: true, app: 'ViralVoice API', mode: 'AI Video Dubbing', endpoints: ['/api/health', '/api/dub-video'] });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    openaiKey: Boolean(process.env.OPENAI_API_KEY),
    assemblyAiKey: Boolean(ASSEMBLYAI_API_KEY),
    ffmpeg: Boolean(ffmpegPath),
    transcriptionModel: TRANSCRIPTION_MODEL,
    translationModel: TRANSLATION_MODEL,
    ttsModel: TTS_MODEL
  });
});

app.post('/api/dub-video', upload.single('media'), async (req, res) => {
  const tempFiles = [];

  try {
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Clé OpenAI manquante dans Render' });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoyé' });

    const targetLanguage = req.body.targetLanguage || 'anglais';
    const requestedVoice = req.body.voice || 'alloy';
    const multiVoiceRequested = req.body.multiVoice === 'true';
    const originalName = req.file.originalname || 'media';
    const mimeType = req.file.mimetype || '';
    const inputPath = req.file.path;
    const isVideo = mimeType.startsWith('video/');

    tempFiles.push(inputPath);

    const safeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const extractedAudioPath = path.join(outputDir, `${safeId}-source.mp3`);
    const dubbedAudioPath = path.join(outputDir, `${safeId}-voice.mp3`);
    const outputVideoPath = path.join(outputDir, `${safeId}-dubbed.mp4`);

    tempFiles.push(extractedAudioPath);
    await extractAudioForTranscription(inputPath, extractedAudioPath);

    let transcript = '';
    let translation = '';
    let speakers = ['A'];
    let multiVoiceUsed = false;

    if (multiVoiceRequested && ASSEMBLYAI_API_KEY) {
      const diarized = await diarizeWithAssemblyAi(extractedAudioPath);
      const utterances = normalizeUtterances(diarized.utterances || []);

      if (utterances.length > 1) {
        const translatedUtterances = await translateUtterances(utterances, targetLanguage);
        transcript = utterances.map(item => `Speaker ${item.speaker}: ${item.text}`).join('\n');
        translation = translatedUtterances.map(item => `Speaker ${item.speaker}: ${item.text}`).join('\n');
        speakers = [...new Set(translatedUtterances.map(item => item.speaker))];
        await buildMultiVoiceAudio(translatedUtterances, dubbedAudioPath, safeId);
        multiVoiceUsed = true;
      }
    }

    if (!multiVoiceUsed) {
      const transcriptResponse = await client.audio.transcriptions.create({ file: fs.createReadStream(extractedAudioPath), model: TRANSCRIPTION_MODEL });
      transcript = transcriptResponse.text || '';
      if (!transcript.trim()) throw new Error('Aucune voix détectée dans le fichier');

      const translationResponse = await client.responses.create({
        model: TRANSLATION_MODEL,
        input: [
          { role: 'system', content: 'Tu es un traducteur spécialisé dans le doublage vidéo. Tu traduis naturellement, avec des phrases faciles à dire à voix haute. Tu ne rajoutes aucun commentaire.' },
          { role: 'user', content: `Traduis ce texte en ${targetLanguage}. Garde un ton naturel, fluide et oral. Texte :\n\n${transcript}` }
        ]
      });

      translation = cleanText(translationResponse.output_text || '');
      await createTtsMp3(translation, normalizeVoice(requestedVoice), dubbedAudioPath);
    }

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
      multiVoiceRequested,
      multiVoiceUsed,
      speakersDetected: speakers.length,
      speakers,
      transcript,
      translation,
      srt: generateSrt(translation),
      voice: normalizeVoice(requestedVoice),
      dubbedAudioUrl: buildPublicUrl(req, dubbedAudioPath),
      dubbedVideoUrl
    });
  } catch (error) {
    console.error('ViralVoice error:', error);
    for (const file of tempFiles) safeUnlink(file);
    res.status(500).json({ error: error.message || 'Erreur génération doublage vidéo' });
  }
});

async function extractAudioForTranscription(inputPath, outputPath) {
  await execFileAsync(ffmpegPath, ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', outputPath]);
}

async function replaceVideoAudio(videoPath, audioPath, outputPath) {
  await execFileAsync(ffmpegPath, ['-y', '-i', videoPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', outputPath]);
}

async function diarizeWithAssemblyAi(audioPath) {
  const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: ASSEMBLYAI_API_KEY },
    body: fs.readFileSync(audioPath)
  });

  if (!uploadResponse.ok) throw new Error('Erreur upload AssemblyAI');
  const uploadData = await uploadResponse.json();

  const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { authorization: ASSEMBLYAI_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: uploadData.upload_url, language_detection: true, speaker_labels: true })
  });

  if (!transcriptResponse.ok) throw new Error('Erreur lancement diarisation AssemblyAI');
  const transcriptData = await transcriptResponse.json();
  const transcriptId = transcriptData.id;

  for (let attempt = 0; attempt < 60; attempt++) {
    await wait(3000);
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, { headers: { authorization: ASSEMBLYAI_API_KEY } });
    const pollData = await pollResponse.json();
    if (pollData.status === 'completed') return pollData;
    if (pollData.status === 'error') throw new Error(pollData.error || 'Erreur diarisation AssemblyAI');
  }

  throw new Error('Diarisation trop longue. Essaie une vidéo plus courte.');
}

function normalizeUtterances(utterances) {
  return utterances
    .filter(item => item.text && item.text.trim())
    .slice(0, 40)
    .map(item => ({ speaker: String(item.speaker || 'A').replace('Speaker ', ''), text: item.text.trim() }));
}

async function translateUtterances(utterances, targetLanguage) {
  const source = JSON.stringify(utterances.map((item, index) => ({ index, speaker: item.speaker, text: item.text })));

  const response = await client.responses.create({
    model: TRANSLATION_MODEL,
    input: [
      { role: 'system', content: 'Tu traduis des dialogues pour doublage vidéo. Retourne uniquement un JSON valide, sans markdown, sous forme de tableau. Garde index et speaker identiques. Traduis seulement text.' },
      { role: 'user', content: `Langue cible : ${targetLanguage}\nJSON source : ${source}` }
    ]
  });

  try {
    const parsed = JSON.parse(cleanJson(response.output_text || '[]'));
    return parsed.map(item => ({ speaker: String(item.speaker || 'A'), text: cleanText(String(item.text || '')) })).filter(item => item.text);
  } catch {
    throw new Error('Erreur traduction multi-voix');
  }
}

async function buildMultiVoiceAudio(utterances, outputPath, safeId) {
  const segmentFiles = [];
  const listPath = path.join(outputDir, `${safeId}-concat.txt`);

  for (let index = 0; index < utterances.length; index++) {
    const item = utterances[index];
    const segmentPath = path.join(outputDir, `${safeId}-seg-${index}.mp3`);
    await createTtsMp3(item.text, voiceForSpeaker(item.speaker), segmentPath);
    segmentFiles.push(segmentPath);
  }

  const listContent = segmentFiles.map(file => `file '${path.resolve(file).replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, listContent);
  await execFileAsync(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'libmp3lame', '-b:a', '160k', outputPath]);

  for (const file of segmentFiles) safeUnlink(file);
  safeUnlink(listPath);
}

async function createTtsMp3(text, voice, outputPath) {
  const speechResponse = await client.audio.speech.create({ model: TTS_MODEL, voice: normalizeVoice(voice), input: truncateForTts(text), response_format: 'mp3' });
  const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());
  fs.writeFileSync(outputPath, audioBuffer);
}

function voiceForSpeaker(speaker) {
  const voices = ['alloy', 'coral', 'onyx', 'sage', 'ash', 'nova', 'echo', 'shimmer'];
  const code = String(speaker || 'A').toUpperCase().charCodeAt(0);
  return voices[Math.max(0, code - 65) % voices.length];
}

function normalizeVoice(voice) {
  const allowed = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
  return allowed.has(voice) ? voice : 'alloy';
}

function cleanText(text) {
  return String(text).replace(/^\s*["“”]+|["“”]+\s*$/g, '').trim();
}

function cleanJson(text) {
  return String(text).replace(/```json|```/g, '').trim();
}

function truncateForTts(text) {
  const limit = 3900;
  return text.length <= limit ? text : text.slice(0, limit);
}

function buildPublicUrl(req, filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const host = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${host}/${normalizedPath}`;
}

function safeUnlink(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

function generateSrt(text) {
  const cleaned = String(text).replace(/Speaker [A-Z]:/g, '').replace(/\s+/g, ' ').trim();
  const parts = cleaned.match(/.{1,70}(?:\s|$)/g) || [];
  return parts.map((line, index) => `${index + 1}\n${formatSrtTime(index * 4)} --> ${formatSrtTime(index * 4 + 4)}\n${line.trim()}\n`).join('\n');
}

function formatSrtTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.listen(PORT, () => {
  console.log(`ViralVoice backend démarré sur ${PORT}`);
});
