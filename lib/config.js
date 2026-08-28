const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  PUBLIC_DIR: ROOT_DIR,
  WORK_DIR: path.join(ROOT_DIR, 'tmp'),
  OUTPUT_DIR: path.join(ROOT_DIR, 'outputs'),
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || 300 * 1024 * 1024),
  MAX_DURATION_SECONDS: Number(process.env.MAX_DURATION_SECONDS || 300),
  CLEANUP_AFTER_MS: Number(process.env.CLEANUP_AFTER_MS || 60 * 60 * 1000),
  MAX_SYNC_SEGMENTS: Number(process.env.MAX_SYNC_SEGMENTS || 180),
  MAX_PROFILE_SPEAKERS: Number(process.env.MAX_PROFILE_SPEAKERS || 4),
  VOICE_SEGMENT_CONCURRENCY: Math.max(
    1,
    Math.min(4, Number(process.env.VOICE_SEGMENT_CONCURRENCY || 3))
  ),
  TRANSCRIBE_MODEL: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
  DIARIZE_MODEL: process.env.OPENAI_DIARIZE_MODEL || 'gpt-4o-transcribe-diarize',
  TEXT_MODEL: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-luna',
  TEXT_FALLBACK_MODEL: process.env.OPENAI_TEXT_FALLBACK_MODEL || 'gpt-5.6-luna',
  TEXT_LEGACY_FALLBACK_MODEL:
    process.env.OPENAI_TEXT_LEGACY_FALLBACK_MODEL || 'gpt-4o-mini',
  TEXT_REASONING_EFFORT: process.env.OPENAI_TEXT_REASONING_EFFORT || 'low',
  AUDIO_DUB_MODEL: process.env.OPENAI_AUDIO_DUB_MODEL || 'gpt-audio-1.5',
  TTS_FALLBACK_MODEL:
    process.env.OPENAI_TTS_FALLBACK_MODEL || 'gpt-4o-mini-tts-2025-12-15',
  VOICE_PROFILE_MODEL: process.env.OPENAI_VOICE_PROFILE_MODEL || 'gpt-audio-1.5',
  REALTIME_TRANSLATE_MODEL:
    process.env.OPENAI_REALTIME_TRANSLATE_MODEL || 'gpt-realtime-translate',
  REALTIME_TRANSCRIBE_MODEL:
    process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL || 'gpt-realtime-whisper',
  REALTIME_TRANSLATE_TIMEOUT_MS:
    Number(process.env.REALTIME_TRANSLATE_TIMEOUT_MS || 30000),
  REALTIME_TRANSLATE_IDLE_MS:
    Number(process.env.REALTIME_TRANSLATE_IDLE_MS || 1400),
  ADMIN_SECRET: process.env.ADMIN_SECRET || ''
};
