const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const media = require('../lib/media');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function createTone(outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('sine=frequency=440:duration=1.4')
      .inputFormat('lavfi')
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(24000)
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viralvoice-fit-'));
  const sourcePath = path.join(workDir, 'source.wav');
  const fittedPath = path.join(workDir, 'fitted.wav');
  const targetDuration = 2.2;

  try {
    await createTone(sourcePath);
    await media.fitVoiceToDuration(sourcePath, fittedPath, targetDuration);

    if (!fs.existsSync(fittedPath) || fs.statSync(fittedPath).size < 1000) {
      throw new Error('Le fichier audio recalé est absent ou vide.');
    }

    const info = await media.getMediaInfo(fittedPath);
    const difference = Math.abs(info.duration - targetDuration);
    if (!Number.isFinite(info.duration) || difference > 0.12) {
      throw new Error(
        `Durée incorrecte : ${info.duration}s au lieu de ${targetDuration}s.`
      );
    }

    console.log(
      `FFmpeg media-fit OK: ${info.duration.toFixed(3)}s, ` +
      `${fs.statSync(fittedPath).size} octets.`
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
