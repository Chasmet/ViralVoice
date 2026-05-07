import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    app: 'ViralVoice API'
  });
});

app.post('/api/translate', upload.single('media'), async (req, res) => {
  try {
    const targetLanguage = req.body.targetLanguage || 'français';
    const styleMode = req.body.styleMode || 'naturel';

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier' });
    }

    const transcriptResponse = await client.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'gpt-4o-transcribe'
    });

    const transcript = transcriptResponse.text;

    const translationResponse = await client.responses.create({
      model: 'gpt-5.5-mini',
      input: `Traduis ce texte en ${targetLanguage} avec un style ${styleMode}. Garde un ton naturel et fluide.\n\n${transcript}`
    });

    const translation = translationResponse.output_text;

    const srt = generateFakeSrt(translation);

    fs.unlinkSync(req.file.path);

    res.json({
      transcript,
      translation,
      srt
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

function generateFakeSrt(text) {
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