const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { pipeline } = require('stream/promises');
const config = require('./config');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function isConfigured() {
  return Boolean(config.LIPSYNC_SERVICE_URL);
}

function authHeaders() {
  return config.LIPSYNC_SERVICE_TOKEN
    ? { Authorization: `Bearer ${config.LIPSYNC_SERVICE_TOKEN}` }
    : {};
}

async function getHealth() {
  if (!isConfigured()) {
    return { configured: false, ready: false, engine: null };
  }

  try {
    const response = await axios.get(`${config.LIPSYNC_SERVICE_URL}/health`, {
      headers: authHeaders(),
      timeout: 8000,
      validateStatus: () => true
    });
    return {
      configured: true,
      ready: response.status >= 200 && response.status < 300 && Boolean(response.data?.ready),
      engine: response.data?.engine || 'musetalk-v1.5',
      gpu: response.data?.gpu || null,
      detail: response.data?.detail || null
    };
  } catch (error) {
    return {
      configured: true,
      ready: false,
      engine: 'musetalk-v1.5',
      detail: error.message || 'Service lip-sync indisponible.'
    };
  }
}

async function generateLipSync({
  videoPath,
  audioPath,
  outputPath,
  quality = 'balanced',
  bboxShift = 0,
  extraMargin = 10,
  originalVolume = 0.1
}) {
  if (!isConfigured()) {
    throw new Error('Moteur lip-sync non configuré sur le serveur.');
  }

  const rawOutputPath = `${outputPath}.raw.mp4`;
  const form = new FormData();
  form.append('video', fs.createReadStream(videoPath), {
    filename: 'source.mp4',
    contentType: 'video/mp4'
  });
  form.append('audio', fs.createReadStream(audioPath), {
    filename: 'dubbed.mp3',
    contentType: 'audio/mpeg'
  });
  form.append('quality', normalizeQuality(quality));
  form.append('bbox_shift', String(clampInteger(bboxShift, -20, 20)));
  form.append('extra_margin', String(clampInteger(extraMargin, 0, 40)));

  try {
    const response = await axios.post(
      `${config.LIPSYNC_SERVICE_URL}/v1/lipsync`,
      form,
      {
        headers: { ...form.getHeaders(), ...authHeaders() },
        responseType: 'stream',
        timeout: config.LIPSYNC_TIMEOUT_MS,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true
      }
    );

    if (response.status < 200 || response.status >= 300) {
      const message = await readErrorStream(response.data);
      throw new Error(`Lip-sync GPU refusé (${response.status}) : ${message || 'erreur inconnue'}`);
    }

    await pipeline(response.data, fs.createWriteStream(rawOutputPath));
    const stat = await fs.promises.stat(rawOutputPath);
    if (stat.size < 1024) {
      throw new Error('Le moteur lip-sync a renvoyé une vidéo vide.');
    }

    try {
      await mixOriginalAmbience({
        rawVideoPath: rawOutputPath,
        originalVideoPath: videoPath,
        voicePath: audioPath,
        outputPath,
        originalVolume
      });
    } catch (mixError) {
      console.warn('Mixage ambiance impossible, utilisation de la voix seule.', mixError.message);
      await attachVoiceOnly({ rawVideoPath: rawOutputPath, voicePath: audioPath, outputPath });
    }

    return outputPath;
  } finally {
    fs.promises.unlink(rawOutputPath).catch(() => {});
  }
}

function mixOriginalAmbience({ rawVideoPath, originalVideoPath, voicePath, outputPath, originalVolume }) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(rawVideoPath)
      .input(originalVideoPath)
      .input(voicePath)
      .complexFilter([
        `[1:a]volume=${clampNumber(originalVolume, 0, 0.6)}[a0]`,
        '[2:a]volume=1[a1]',
        '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]'
      ])
      .outputOptions([
        '-threads 1', '-map 0:v:0', '-map [aout]', '-c:v copy',
        '-c:a aac', '-b:a 160k', '-movflags +faststart', '-shortest'
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function attachVoiceOnly({ rawVideoPath, voicePath, outputPath }) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(rawVideoPath)
      .input(voicePath)
      .outputOptions([
        '-threads 1', '-map 0:v:0', '-map 1:a:0', '-c:v copy',
        '-c:a aac', '-b:a 160k', '-movflags +faststart', '-shortest'
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function normalizeQuality(value) {
  return ['fast', 'balanced', 'quality'].includes(value) ? value : 'balanced';
}

function clampInteger(value, min, max) {
  const numeric = Math.round(Number(value || 0));
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : 0));
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : min));
}

async function readErrorStream(stream) {
  if (!stream) return '';
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').slice(0, 1000);
}

module.exports = { isConfigured, getHealth, generateLipSync };
