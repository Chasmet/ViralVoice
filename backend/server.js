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

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

if (!fs.existsSync('outputs')) {
  fs.mkdirSync('outputs');
}

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use('/outputs', express.static('outputs'));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    app: 'ViralVoice API',
    mode: 'AI Video Dubbing'
  });
});

app.post('/api/dub-video', upload.single('media'), async (req, res) => {
  try {
    const targetLanguage = req.body.targetLanguage || 'anglais';

    if (!req.file) {
      return res.status(400).json({
        error: 'Aucun fichier envoyé'
      });
    }

    const inputPath = req.file.path;

    const transcriptResponse = await client.audio.transcriptions.create({
      file: fs.createReadStream(inputPath),
      model: 'gpt-4o-transcribe'
    });

    const transcript = transcriptResponse.text;

    const translationResponse = await client.responses.create({
      model: 'gpt-5.5-mini',
      input: `Traduis ce texte en ${targetLanguage}. Garde un ton naturel et fluide.\n\n${transcript}`
    });

    const translation = translationResponse.output_text;

    const speechResponse = await client.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: translation
    });

    const audioBuffer = Buffer.from(await speechResponse.arrayBuffer());

    const audioPath = `outputs/${Date.now()}-dub.mp3`;

    fs.writeFileSync(audioPath, audioBuffer);

    const outputVideoPath = `outputs/${Date.now()}-video.mp4`;

    await execFileAsync(ffmpegPath, [
      '-i', inputPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-shortest',
      outputVideoPath
    ]);

    const srt = generateSrt(translation);

    fs.unlinkSync(inputPath);

    res.json({
      transcript,
      translation,
      srt,
      dubbedAudioUrl: `${req.protocol}://${req.get('host')}/${audioPath}`,
      dubbedVideoUrl: `${req.protocol}://${req.get('host')}/${outputVideoPath}`
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Erreur génération doublage vidéo'
    });
  }
});

function generateSrt(text) {
  const parts = text.match(/.{1,80}/g) || [];

  return parts.map((line, index) => {
    const start = index * 4;
    const end = start + 4;

    return `${index + 1}\n00:00:${String(start).padStart(2, '0')},000 --> 00:00:${String(end).padStart(2, '0')},000\n${line}\n`;
  }).join('\n');
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ViralVoice backend démarré sur ${PORT}`);
});