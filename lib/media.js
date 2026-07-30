const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const { clamp } = require('./utils');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function getMediaInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) return reject(error);
      resolve({
        duration: Number(metadata?.format?.duration || 0),
        hasAudio: Array.isArray(metadata?.streams) &&
          metadata.streams.some(stream => stream.codec_type === 'audio')
      });
    });
  });
}

function extractAudio(inputPath, outputPath) {
  return transcodeAudio(inputPath, outputPath, true);
}

function convertAudio(inputPath, outputPath) {
  return transcodeAudio(inputPath, outputPath, false);
}

function transcodeAudio(inputPath, outputPath, noVideo) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);
    if (noVideo) command.noVideo();
    command
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(24000)
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function buildAtempoFilters(factor) {
  const filters = [];
  let remaining = clamp(Number(factor || 1), 0.0625, 16);
  while (remaining > 2) {
    filters.push('atempo=2.0');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(5)}`);
  return filters;
}

async function fitVoiceToDuration(inputPath, outputPath, targetDuration) {
  const { duration: sourceDuration } = await getMediaInfo(inputPath);
  const safeTarget = Math.max(0.25, targetDuration);
  const speedFactor = sourceDuration > 0 ? sourceDuration / safeTarget : 1;
  const filters = [
    ...buildAtempoFilters(speedFactor),
    `apad=pad_dur=${safeTarget.toFixed(3)}`,
    `atrim=0:${safeTarget.toFixed(3)}`,
    'aresample=48000'
  ];

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(filters)
      .audioCodec('pcm_s16le')
      .audioChannels(2)
      .audioFrequency(48000)
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function createSilentAudio(outputPath, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('anullsrc=r=48000:cl=stereo')
      .inputFormat('lavfi')
      .duration(duration)
      .audioCodec('pcm_s16le')
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function renderSpeakerTimeline(silentBedPath, segments, outputPath, totalDuration) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg().input(silentBedPath);
    segments.forEach(segment => command.input(segment.audioPath));

    const filters = ['[0:a]volume=0[base]'];
    const labels = ['[base]'];
    segments.forEach((segment, index) => {
      const delayMs = Math.max(0, Math.round(segment.start * 1000));
      const label = `seg${index}`;
      filters.push(`[${index + 1}:a]adelay=${delayMs}:all=1[${label}]`);
      labels.push(`[${label}]`);
    });
    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,` +
      `atrim=0:${totalDuration.toFixed(3)},aresample=48000[mix]`
    );

    command
      .complexFilter(filters)
      .outputOptions(['-threads 1', '-map [mix]', '-c:a libmp3lame', '-b:a 160k'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function normalizeVoice(inputPath, outputPath, voiceVolume) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(['loudnorm=I=-16:TP=-1.5:LRA=11', `volume=${voiceVolume}`])
      .audioCodec('libmp3lame')
      .audioBitrate('160k')
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function muxVideoWithDub({ videoPath, voicePath, outputPath, originalVolume, hasOriginalAudio }) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg().input(videoPath).input(voicePath);
    if (hasOriginalAudio) {
      command
        .complexFilter([
          `[0:a]volume=${originalVolume}[a0]`,
          '[1:a]volume=1[a1]',
          '[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]'
        ])
        .outputOptions([
          '-threads 1', '-map 0:v:0', '-map [aout]', '-c:v copy',
          '-c:a aac', '-b:a 160k', '-movflags +faststart', '-shortest'
        ]);
    } else {
      command.outputOptions([
        '-threads 1', '-map 0:v:0', '-map 1:a:0', '-c:v copy',
        '-c:a aac', '-b:a 160k', '-movflags +faststart', '-shortest'
      ]);
    }
    command.output(outputPath).on('end', resolve).on('error', reject).run();
  });
}

module.exports = {
  getMediaInfo,
  extractAudio,
  convertAudio,
  fitVoiceToDuration,
  createSilentAudio,
  renderSpeakerTimeline,
  normalizeVoice,
  muxVideoWithDub
};
