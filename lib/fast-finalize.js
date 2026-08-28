const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const { clamp } = require('./utils');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

async function finalizeTimeline({
  segments,
  outputPath,
  totalDuration,
  voiceVolume,
  jobId
}) {
  const startedAt = Date.now();
  try {
    await runSinglePassMix({
      segments,
      outputPath,
      totalDuration,
      voiceVolume,
      lightweight: false
    });
    const seconds = (Date.now() - startedAt) / 1000;
    console.log(`[${jobId}] FAST FINALIZE ${seconds.toFixed(2)}s segments=${segments.length}`);
    return { mode: 'single-pass-light' };
  } catch (error) {
    console.warn(`[${jobId}] FAST FINALIZE LIGHT FALLBACK`, error.message || error);
    await runSinglePassMix({
      segments,
      outputPath,
      totalDuration,
      voiceVolume,
      lightweight: true
    });
    const seconds = (Date.now() - startedAt) / 1000;
    console.log(`[${jobId}] ULTRA FAST FINALIZE ${seconds.toFixed(2)}s segments=${segments.length}`);
    return { mode: 'single-pass-ultra-light' };
  }
}

function runSinglePassMix({
  segments,
  outputPath,
  totalDuration,
  voiceVolume,
  lightweight
}) {
  const safeDuration = Math.max(0.25, Number(totalDuration || 0.25));
  const safeVoiceVolume = clamp(Number(voiceVolume || 1), 0.6, 1.3);
  const timeoutMs = Math.max(20000, Math.min(65000, safeDuration * 180));

  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input('anullsrc=r=48000:cl=stereo')
      .inputFormat('lavfi');

    segments.forEach(segment => command.input(segment.audioPath));

    const filters = [];
    const labels = ['[0:a]'];

    segments.forEach((segment, index) => {
      const delayMs = Math.max(0, Math.round(Number(segment.start || 0) * 1000));
      const label = `fastseg${index}`;
      filters.push(`[${index + 1}:a]adelay=${delayMs}|${delayMs}[${label}]`);
      labels.push(`[${label}]`);
    });

    const mixGain = Math.max(1, labels.length);
    const postMix = lightweight
      ? `volume=${safeVoiceVolume},alimiter=limit=0.95,aresample=48000`
      : `acompressor=threshold=-22dB:ratio=2.5:attack=5:release=80,` +
        `volume=${safeVoiceVolume},alimiter=limit=0.95,aresample=48000`;

    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:duration=longest:` +
      `dropout_transition=0,volume=${mixGain},${postMix}[final]`
    );

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
      reject(new Error(`Finalisation audio trop longue (> ${Math.round(timeoutMs / 1000)} s).`));
    }, timeoutMs);

    command
      .complexFilter(filters)
      .duration(safeDuration)
      .outputOptions([
        '-threads 1',
        '-map [final]',
        '-c:a libmp3lame',
        '-b:a 128k'
      ])
      .output(outputPath)
      .on('end', finish(resolve))
      .on('error', finish(reject))
      .run();
  });
}

module.exports = {
  finalizeTimeline,
  runSinglePassMix
};
