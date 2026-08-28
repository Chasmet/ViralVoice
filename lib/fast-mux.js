const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const { clamp } = require('./utils');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

async function muxVideoFast({
  videoPath,
  voicePath,
  outputPath,
  originalVolume,
  hasOriginalAudio,
  durationSeconds,
  jobId
}) {
  const startedAt = Date.now();
  const safeDuration = Math.max(1, Number(durationSeconds || 1));
  const timeoutMs = Math.max(25000, Math.min(70000, safeDuration * 160));

  try {
    await runMux({
      videoPath,
      voicePath,
      outputPath,
      originalVolume,
      hasOriginalAudio,
      timeoutMs
    });
    console.log(`[${jobId}] FAST VIDEO MUX ${((Date.now() - startedAt) / 1000).toFixed(2)}s ambience=${hasOriginalAudio && originalVolume > 0 ? 'yes' : 'no'}`);
    return { mode: 'fast-mix' };
  } catch (error) {
    console.warn(`[${jobId}] FAST VIDEO MUX FALLBACK`, error.message || error);
    safeDelete(outputPath);

    // Secours prioritaire à la vitesse : on conserve la vidéo sans réencodage
    // et on remplace simplement la piste audio par la voix IA.
    await runMux({
      videoPath,
      voicePath,
      outputPath,
      originalVolume: 0,
      hasOriginalAudio: false,
      timeoutMs: Math.max(20000, Math.min(50000, safeDuration * 120))
    });
    console.log(`[${jobId}] FAST VIDEO MUX VOICE-ONLY ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
    return { mode: 'voice-only-fallback', warning: 'Ambiance originale désactivée pour terminer rapidement le rendu.' };
  }
}

function runMux({
  videoPath,
  voicePath,
  outputPath,
  originalVolume,
  hasOriginalAudio,
  timeoutMs
}) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg().input(videoPath).input(voicePath);
    const safeOriginalVolume = clamp(Number(originalVolume || 0), 0, 0.6);

    if (hasOriginalAudio && safeOriginalVolume > 0.001) {
      command
        .complexFilter([
          `[0:a]volume=${safeOriginalVolume}[a0]`,
          '[1:a]volume=1[a1]',
          '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0,' +
            'volume=2,alimiter=limit=0.95[aout]'
        ])
        .outputOptions([
          '-threads 1',
          '-map 0:v:0',
          '-map [aout]',
          '-c:v copy',
          '-c:a aac',
          '-b:a 128k',
          '-shortest'
        ]);
    } else {
      command.outputOptions([
        '-threads 1',
        '-map 0:v:0',
        '-map 1:a:0',
        '-c:v copy',
        '-c:a aac',
        '-b:a 128k',
        '-shortest'
      ]);
    }

    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { command.kill('SIGKILL'); } catch {}
      reject(new Error(`Mux vidéo trop long (> ${Math.round(timeoutMs / 1000)} s).`));
    }, timeoutMs);

    command
      .output(outputPath)
      .on('end', finish(resolve))
      .on('error', finish(reject))
      .run();
  });
}

function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Nettoyage non bloquant.
  }
}

module.exports = { muxVideoFast };
