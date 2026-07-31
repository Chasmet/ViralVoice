const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const media = require('../lib/media');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function createTone(outputPath, frequency, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`sine=frequency=${frequency}:duration=${duration}`)
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

async function assertDuration(filePath, expected, tolerance, label) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1000) {
    throw new Error(`${label} absent ou vide.`);
  }

  const info = await media.getMediaInfo(filePath);
  const difference = Math.abs(info.duration - expected);
  if (!Number.isFinite(info.duration) || difference > tolerance) {
    throw new Error(
      `${label} : durée ${info.duration}s au lieu de ${expected}s.`
    );
  }

  return info;
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viralvoice-media-'));
  const sourceA = path.join(workDir, 'source-a.wav');
  const sourceB = path.join(workDir, 'source-b.wav');
  const fittedA = path.join(workDir, 'fitted-a.wav');
  const fittedB = path.join(workDir, 'fitted-b.wav');
  const silentBed = path.join(workDir, 'silent.wav');
  const timeline = path.join(workDir, 'timeline.mp3');
  const totalDuration = 4.5;

  try {
    await createTone(sourceA, 440, 1.4);
    await createTone(sourceB, 660, 0.9);

    await media.fitVoiceToDuration(sourceA, fittedA, 1.8);
    await media.fitVoiceToDuration(sourceB, fittedB, 1.1);

    await assertDuration(fittedA, 1.8, 0.12, 'Premier segment recalé');
    await assertDuration(fittedB, 1.1, 0.12, 'Second segment recalé');

    await media.createSilentAudio(silentBed, totalDuration);
    await media.renderSpeakerTimeline(
      silentBed,
      [
        { start: 0.25, audioPath: fittedA },
        { start: 1.55, audioPath: fittedB },
        { start: 2.75, audioPath: fittedA }
      ],
      timeline,
      totalDuration
    );

    const timelineInfo = await assertDuration(
      timeline,
      totalDuration,
      0.16,
      'Timeline multi-voix'
    );

    console.log(
      `FFmpeg multi-voix OK: ${timelineInfo.duration.toFixed(3)}s, ` +
      `${fs.statSync(timeline).size} octets.`
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
