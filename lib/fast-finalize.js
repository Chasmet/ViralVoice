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

function calculateFinalizeTimeoutMs(totalDuration, segmentCount, lightweight) {
  const safeDuration = Math.max(0.25, Number(totalDuration || 0.25));
  const safeSegments = Math.max(1, Number(segmentCount || 1));

  // Une vidéo longue avec beaucoup de segments demande nettement plus de temps CPU
  // qu'un clip court. L'ancien minimum fixe de 20 s faisait échouer les vidéos
  // d'environ 1 min 25 avec 20+ répliques alors que FFmpeg travaillait normalement.
  const durationBudget = safeDuration * (lightweight ? 300 : 400);
  const segmentBudget = safeSegments * (lightweight ? 400 : 600);
  const baseBudget = lightweight ? 8000 : 10000;
  const calculated = baseBudget + durationBudget + segmentBudget;

  return Math.round(
    Math.max(
      lightweight ? 30000 : 35000,
      Math.min(lightweight ? 75000 : 120000, calculated)
    )
  );
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
  const outputGain = clamp(safeVoiceVolume * 2.0, 1.2, 2.6);
  const timeoutMs = calculateFinalizeTimeoutMs(safeDuration, segments.length, lightweight);

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
      ? `volume=${outputGain.toFixed(3)},alimiter=limit=0.95,aresample=48000`
      : `acompressor=threshold=-22dB:ratio=2.5:attack=5:release=80,` +
        `volume=${outputGain.toFixed(3)},alimiter=limit=0.95,aresample=48000`;

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
      reject(new Error(
        `Finalisation audio trop longue (> ${Math.round(timeoutMs / 1000)} s, ` +
        `${Math.round(safeDuration)} s de média, ${segments.length} segments).`
      ));
    }, timeoutMs);

    console.log(
      `[FINALIZE] mode=${lightweight ? 'ultra-light' : 'light'} ` +
      `duration=${safeDuration.toFixed(1)}s segments=${segments.length} timeout=${Math.round(timeoutMs / 1000)}s`
    );

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
  runSinglePassMix,
  calculateFinalizeTimeoutMs
};
