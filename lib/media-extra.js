const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

function extractAudioSegmentExact(inputPath, outputPath, start, duration) {
  const safeStart = Math.max(0, Number(start || 0));
  const safeDuration = Math.max(0.25, Math.min(20, Number(duration || 1)));

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

module.exports = {
  extractAudioSegmentExact
};
