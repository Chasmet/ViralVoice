const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calculateFinalizeTimeoutMs } = require('../lib/fast-finalize');

const normal85 = calculateFinalizeTimeoutMs(85, 22, false);
const light85 = calculateFinalizeTimeoutMs(85, 22, true);

assert(normal85 >= 50000, `Timeout normal 85s/22 segments trop court: ${normal85}ms`);
assert(light85 >= 40000, `Timeout léger 85s/22 segments trop court: ${light85}ms`);
assert(normal85 <= 120000, 'Timeout normal dépasse la limite de sécurité');
assert(light85 <= 75000, 'Timeout léger dépasse la limite de sécurité');

const translationPatch = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'translation-compat-patch.js'),
  'utf8'
);
assert(!translationPatch.includes("reasoning_effort: 'minimal'"), 'Le reasoning_effort minimal interdit est revenu');
assert(/JSON valide/i.test(translationPatch), 'Les prompts JSON explicites sont absents');
assert(/TARGET LANGUAGE/.test(translationPatch), 'Le log de langue cible est absent');

console.log(
  `long-video-smoke OK normal=${Math.round(normal85 / 1000)}s ` +
  `light=${Math.round(light85 / 1000)}s`
);
