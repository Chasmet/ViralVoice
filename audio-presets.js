const AUDIO_PRESETS = {
  solo: {
    voice: 105,
    original: 0
  },
  balanced: {
    voice: 105,
    original: 10
  },
  original: {
    voice: 110,
    original: 25
  },
  power: {
    voice: 125,
    original: 0
  }
};

const presetRadios = document.querySelectorAll('input[name="audioPreset"]');

presetRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    applyAudioPreset(radio.value);
  });
});

applyAudioPreset(document.querySelector('input[name="audioPreset"]:checked')?.value || 'balanced');

function applyAudioPreset(presetName) {
  const preset = AUDIO_PRESETS[presetName] || AUDIO_PRESETS.balanced;

  if (voiceVolume) {
    voiceVolume.value = String(preset.voice);
    voiceVolumeValue.textContent = `${preset.voice}%`;
  }

  if (originalVolume) {
    originalVolume.value = String(preset.original);
    originalVolumeValue.textContent = `${preset.original}%`;
  }

  document.querySelectorAll('.preset-card').forEach(card => {
    const input = card.querySelector('input[name="audioPreset"]');
    card.classList.toggle('active', Boolean(input && input.value === presetName));
  });
}

// V4.0.5 : cache versionné. Le navigateur ne retélécharge plus ces scripts à
// chaque ouverture, mais une nouvelle version reste immédiatement récupérée
// dès que le numéro ?v= change.
(() => {
  const previous = document.getElementById('viralvoiceRuntime402');
  if (previous) previous.remove();

  const runtime = document.createElement('script');
  runtime.id = 'viralvoiceRuntime402';
  runtime.src = 'runtime-v402.js?v=405';
  runtime.async = false;
  document.head.appendChild(runtime);
})();

(() => {
  const previous = document.getElementById('viralvoiceAdminBudget403');
  if (previous) previous.remove();

  const counter = document.createElement('script');
  counter.id = 'viralvoiceAdminBudget403';
  counter.src = 'admin-budget-counter.js?v=405';
  counter.async = false;
  document.head.appendChild(counter);
})();

(() => {
  const previous = document.getElementById('viralvoiceMigrationBackup404');
  if (previous) previous.remove();

  const migration = document.createElement('script');
  migration.id = 'viralvoiceMigrationBackup404';
  migration.src = 'migration-backup.js?v=405';
  migration.async = false;
  document.head.appendChild(migration);
})();
