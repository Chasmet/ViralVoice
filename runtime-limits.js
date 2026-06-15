const DEFAULT_MAX_DURATION_SECONDS = 120;

const currentMaxDuration = Number(process.env.MAX_DURATION_SECONDS || 0);

if (!Number.isFinite(currentMaxDuration) || currentMaxDuration < DEFAULT_MAX_DURATION_SECONDS) {
  process.env.MAX_DURATION_SECONDS = String(DEFAULT_MAX_DURATION_SECONDS);
}

const currentMaxFileSize = Number(process.env.MAX_FILE_SIZE || 0);
const defaultMaxFileSize = 80 * 1024 * 1024;

if (!Number.isFinite(currentMaxFileSize) || currentMaxFileSize < defaultMaxFileSize) {
  process.env.MAX_FILE_SIZE = String(defaultMaxFileSize);
}
