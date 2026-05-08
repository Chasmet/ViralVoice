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
