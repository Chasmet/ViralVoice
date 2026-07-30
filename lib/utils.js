const fs = require('fs');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 120);
}

function cleanText(value) {
  return String(value || '').trim().slice(0, 80);
}

function cleanVoice(value) {
  const allowed = new Set([
    'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx',
    'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'
  ]);
  return allowed.has(value) ? value : 'alloy';
}

function cleanSpeakerRole(value) {
  return value === 'female' ? 'female' : 'male';
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeDelete(filePath) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
}

function logMemory(jobId) {
  const memory = process.memoryUsage();
  console.log(
    `[${jobId}] MEMORY rss=${Math.round(memory.rss / 1024 / 1024)}MB ` +
    `heap=${Math.round(memory.heapUsed / 1024 / 1024)}MB`
  );
}

module.exports = {
  normalizeEmail,
  cleanText,
  cleanVoice,
  cleanSpeakerRole,
  clamp,
  safeDelete,
  logMemory
};
