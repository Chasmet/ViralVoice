const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  PUBLIC_DIR: ROOT_DIR,
  WORK_DIR: path.join(ROOT_DIR, 'tmp'),
  OUTPUT_DIR: path.join(ROOT_DIR, 'outputs'),
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || 80 * 1024 * 1024),
  MAX_DURATION_SECONDS: Number(process.env.MAX_DURATION_SECONDS || 120),
  CLEANUP_AFTER_MS: Number(process.env.CLEANUP_AFTER_MS || 30 * 60 * 1000),
  MAX_SYNC_SEGMENTS: Number(process.env.MAX_SYNC_SEGMENTS || 60),
  TRANSCRIBE_MODEL: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
  DIARIZE_MODEL: process.env.OPENAI_DIARIZE_MODEL || 'gpt-4o-transcribe-diarize',
  TEXT_MODEL: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
  TTS_MODEL: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  ADMIN_SECRET: process.env.ADMIN_SECRET || ''
};
