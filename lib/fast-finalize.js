const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const media = require('./media');
const { clamp } = require('./utils');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

async function finalizeTimeline({
  segments,
  outputPath,
  totalDuration,
  voiceVolume,
  silentPath,
  timelinePath,
  jobId
}) {
  const startedAt = Date.now();
  try {
    await runSinglePassMix({
      segments,
      outputPath,
      totalDuration,
      voiceVolume
    });
    console.log(
      `[${jobId}] FAST FINALIZE ${(Date.now() - startedAt) / 1000}s ` +
      `segments=${segments.length}`
    );
    return { mode: 'single-pass-fast' };
  } catch (error) {
    console.warn(`[${jobId}] FAST FINALIZE FALLBACK`, error.message || error);
    await media.createSilentAudio(silentPath, totalDuration);
    await media.renderSpeakerTimeline(
      silentPath,
      segments,
      timelinePath,
      totalDuration
    );
    await media.normalizeVoice(timelinePath, outputPath, voiceVolume);
    return { mode: 'legacy-safe-fallback' };
  }
}

function runSinglePassMix({ segments, outputPath, totalDuration, voiceVolume }) {
  const safeDuration = Math.max(0.25, Number(totalDuration || 0.25));
  const safeVoiceVolume = clamp(Number(voiceVolume || 1), 0.6, 1.3);

  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input('anullsrc=r=48000:cl=stereo')
      .inputFormat('lavfi');

    segments.forEach(segment => command.input(segment.audioPath));

    const filters = [];
    const labels = ['[0:a]'];

    segments.forEach((segment, index) => {
      const delayMs = Math.max(
        0,
        Math.round(Number(segment.start || 0) * 1000)
      );
      const label = `fastseg${index}`;
      filters.push(
        `[${index + 1}:a]adelay=${delayMs}|${delayMs}[${label}]`
      );
      labels.push(`[${label}]`);
    });

    const mixGain = Math.max(1, labels.length);
    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:duration=longest:` +
      `dropout_transition=0,volume=${mixGain},` +
      'acompressor=threshold=-20dB:ratio=3:attack=5:release=100,' +
      'loudnorm=I=-16:TP=-1.5:LRA=7,' +
      `volume=${safeVoiceVolume},alimiter=limit=0.95,` +
      'aresample=48000[final]'
    );

    command
      .complexFilter(filters)
      .duration(safeDuration)
      .outputOptions([
        '-map [final]',
        '-c:a libmp3lame',
        '-b:a 160k'
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

module.exports = {
  finalizeTimeline,
  runSinglePassMix
};
