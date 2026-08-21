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

// V4.0.2 : charge un correctif réseau avec une URL unique afin de ne jamais
// réutiliser le JavaScript 3.6 mis en cache par la WebView/GitHub Pages.
(() => {
  const previous = document.getElementById('viralvoiceRuntime402');
  if (previous) previous.remove();

  const runtime = document.createElement('script');
  runtime.id = 'viralvoiceRuntime402';
  runtime.src = `runtime-v402.js?v=402&t=${Date.now()}`;
  runtime.async = false;
  document.head.appendChild(runtime);
})();

// V4.0.3 : compteur privé du budget API OpenAI. Le fichier est chargé avec
// un cache-buster afin que l'APK récupère toujours la dernière version.
(() => {
  const previous = document.getElementById('viralvoiceAdminBudget403');
  if (previous) previous.remove();

  const counter = document.createElement('script');
  counter.id = 'viralvoiceAdminBudget403';
  counter.src = `admin-budget-counter.js?v=403&t=${Date.now()}`;
  counter.async = false;
  document.head.appendChild(counter);
})();
