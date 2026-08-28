'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = message => {
  console.error(`UI STABILITY FAIL: ${message}`);
  process.exit(1);
};
const requireText = (value, needle, label) => {
  if (!value.includes(needle)) fail(`${label} doit contenir ${needle}`);
};
const forbidText = (value, needle, label) => {
  if (value.includes(needle)) fail(`${label} ne doit plus contenir ${needle}`);
};

const index = read('index.html');
const app = read('app-v410.js');
const css = read('stable-v410.css');
const launcher = read('android/app/src/main/java/com/chasmet/viralvoice/LauncherActivity.java');
const gradle = read('android/app/build.gradle');

requireText(index, 'stable-v410.css?v=410', 'index.html');
requireText(index, 'app-v410.js?v=410', 'index.html');
requireText(index, 'id="chooseFileBtn"', 'index.html');
requireText(index, 'id="changeFileBtn"', 'index.html');
requireText(index, 'id="apiBudgetCounter"', 'index.html');
requireText(index, 'id="adminPanel"', 'index.html');

[
  'script.js?v=',
  'speaker-sync-v36.js',
  'pro-v36.js',
  'audio-presets.js',
  'admin-access.js',
  'runtime-v402.js',
  'admin-budget-counter.js',
  'migration-backup.js',
  'web-updater.js',
  'recovery-client.js',
  'admin-repair-v411.js',
  'file-selector-fix.js',
  'performance-v35.css',
  'premium-ui.css',
  'refonte-v32.css',
  'style.css?v='
].forEach(legacy => forbidText(index, legacy, 'index.html'));

forbidText(app, 'MutationObserver', 'app-v410.js');
forbidText(app, 'setInterval(', 'app-v410.js');
forbidText(app, 'window.fetch =', 'app-v410.js');
forbidText(app, 'document.body.innerHTML', 'app-v410.js');
requireText(app, "mediaInput.value = '';", 'app-v410.js');
requireText(app, "formData.append('recoveryToken', token)", 'app-v410.js');
requireText(app, '/api/recover-result?token=', 'app-v410.js');

requireText(css, 'overflow-y:auto', 'stable-v410.css');
requireText(css, 'touch-action:pan-y pinch-zoom', 'stable-v410.css');
forbidText(css, 'content-visibility:auto', 'stable-v410.css');
forbidText(css, 'position:sticky', 'stable-v410.css');

forbidText(launcher, 'injectNativeRuntime', 'LauncherActivity.java');
forbidText(launcher, "load('native", 'LauncherActivity.java');
requireText(launcher, 'new UpdateBridge()', 'LauncherActivity.java');

requireText(gradle, "versionName '4.1.0'", 'android/app/build.gradle');
requireText(gradle, 'versionCode 29', 'android/app/build.gradle');

console.log('UI STABILITY OK: une seule couche UI, navigation libre et aucun patch legacy exécuté.');
