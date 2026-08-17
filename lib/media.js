const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const { clamp } = require('./utils');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

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

function convertToRealtimePcm(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(24000)
      .format('s16le')
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function convertRealtimePcmToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputFormat('s16le')
      .inputOptions(['-ar 24000', '-ac 1'])
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(24000)
      .outputOptions(['-threads 1'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function extractAudioSegment(inputPath, outputPath, start, duration) {
  const safeStart = Math.max(0, Number(start || 0));
  const safeDuration = clamp(Number(duration || 3), 1, 8);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(safeStart)
      .duration(safeDuration)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
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
  let remaining = clamp(Number(factor || 1), 0.015625, 64);
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
  const safeTarget = Math.max(0.25, Number(targetDuration || 0.25));
  const speedFactor = sourceDuration > 0 ? sourceDuration / safeTarget : 1;

  const primaryFilters = [
    ...buildAtempoFilters(speedFactor),
    'apad',
    'aresample=48000'
  ];

  try {
    await runVoiceFit(inputPath, outputPath, safeTarget, primaryFilters);
  } catch (primaryError) {
    console.warn('[FFMPEG FIT FALLBACK]', primaryError.message || primaryError);
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // Aucun fichier partiel à supprimer.
    }

    await runVoiceFit(
      inputPath,
      outputPath,
      safeTarget,
      ['apad', 'aresample=48000']
    );
  }
}

function runVoiceFit(inputPath, outputPath, safeTarget, filters) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters(filters)
      .duration(safeTarget)
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

async function renderSpeakerTimeline(silentBedPath, segments, outputPath, totalDuration) {
  const safeDuration = Math.max(0.25, Number(totalDuration || 0.25));

  try {
    await runTimelineMix({
      silentBedPath,
      segments,
      outputPath,
      totalDuration: safeDuration,
      includeResample: true
    });
  } catch (primaryError) {
    console.warn('[FFMPEG TIMELINE FALLBACK]', primaryError.message || primaryError);
    try {
      fs.unlinkSync(outputPath);
    } catch {
      // Aucun fichier partiel à supprimer.
    }

    await runTimelineMix({
      silentBedPath,
      segments,
      outputPath,
      totalDuration: safeDuration,
      includeResample: false
    });
  }
}

function runTimelineMix({
  silentBedPath,
  segments,
  outputPath,
  totalDuration,
  includeResample
}) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg().input(silentBedPath);
    segments.forEach(segment => command.input(segment.audioPath));

    const filters = [];
    const labels = ['[0:a]'];

    segments.forEach((segment, index) => {
      const delayMs = Math.max(0, Math.round(Number(segment.start || 0) * 1000));
      const label = `seg${index}`;
      filters.push(`[${index + 1}:a]adelay=${delayMs}|${delayMs}[${label}]`);
      labels.push(`[${label}]`);
    });

    const outputFilters = includeResample
      ? 'aresample=48000'
      : 'anull';

    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:duration=longest,` +
      `${outputFilters}[mix]`
    );

    command
      .complexFilter(filters)
      .duration(totalDuration)
      .outputOptions([
        '-threads 1',
        '-map [mix]',
        '-c:a libmp3lame',
        '-b:a 160k'
      ])
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
  convertToRealtimePcm,
  convertRealtimePcmToWav,
  extractAudioSegment,
  fitVoiceToDuration,
  createSilentAudio,
  renderSpeakerTimeline,
  normalizeVoice,
  muxVideoWithDub
};
