(() => {
  'use strict';

  const mediaFile = document.getElementById('mediaFile');
  const projectCard = document.getElementById('projectCard');
  const sourcePreview = document.getElementById('sourcePreview');
  const sourceAudioPreview = document.getElementById('sourceAudioPreview');
  const statusCard = document.getElementById('statusCard');
  const statusText = document.getElementById('statusText');
  const resultCard = document.getElementById('resultCard');
  const outputText = document.getElementById('outputText');
  const copyTextBtn = document.getElementById('copyTextBtn');
  const newDubBtn = document.getElementById('newDubBtn');
  const dubBtn = document.getElementById('dubBtn');

  let resultWasVisible = false;

  removeLegacyLipSyncUi();
  renumberMixSection();
  hideSourcePreviews();
  syncBodyState();

  if (mediaFile) {
    mediaFile.addEventListener('change', () => {
      window.setTimeout(() => {
        hideSourcePreviews();
        syncBodyState();
      }, 0);
    });
  }

  if (dubBtn) {
    dubBtn.addEventListener('click', () => {
      document.body.classList.add('is-processing');
      updateProcessingStage();
    });
  }

  if (copyTextBtn) copyTextBtn.addEventListener('click', copyTranslation);
  if (newDubBtn) newDubBtn.addEventListener('click', startNewProject);

  const observer = new MutationObserver(() => {
    removeLegacyLipSyncUi();
    renumberMixSection();
    hideSourcePreviews();
    syncBodyState();
    updateProcessingStage();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  [statusCard, resultCard].filter(Boolean).forEach(element => {
    observer.observe(element, { attributes: true, attributeFilter: ['class'] });
  });

  if (statusText) {
    observer.observe(statusText, { childList: true, characterData: true, subtree: true });
  }

  function hideSourcePreviews() {
    [sourcePreview, sourceAudioPreview].filter(Boolean).forEach(media => {
      try {
        media.pause();
        media.removeAttribute('src');
        media.load();
      } catch (error) {
        console.debug('Aperçu source déjà neutralisé.', error);
      }
      media.classList.add('hidden', 'source-preview-hidden');
      media.setAttribute('aria-hidden', 'true');
    });
  }

  function removeLegacyLipSyncUi() {
    document.querySelectorAll('.lip-sync-card').forEach(card => card.remove());

    document.querySelectorAll('.notice, .status, [role="alert"]').forEach(element => {
      const text = String(element.textContent || '');
      if (/LIPSYNC_SERVICE_URL|lip-sync indisponible|musetalk|GPU à configurer/i.test(text)) {
        element.textContent = '';
        element.classList.add('hidden');
      }
    });
  }

  function renumberMixSection() {
    const mixTitle = document.getElementById('mixTitle');
    const mixCard = mixTitle?.closest('section.card');
    const marker = mixCard?.querySelector('.step-number');

    if (mixTitle) mixTitle.textContent = '4. Mixage audio';
    if (marker) marker.textContent = '4';
  }

  function syncBodyState() {
    const hasFile = Boolean(mediaFile && mediaFile.files && mediaFile.files.length);
    const processing = Boolean(statusCard && !statusCard.classList.contains('hidden'));
    const hasResult = Boolean(resultCard && !resultCard.classList.contains('hidden'));

    document.body.classList.toggle('has-file', hasFile);
    document.body.classList.toggle('is-processing', processing);
    document.body.classList.toggle('has-result', hasResult);

    if (projectCard) projectCard.classList.toggle('file-selected', hasFile);

    if (hasResult && !resultWasVisible) {
      resultWasVisible = true;
      window.setTimeout(() => {
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        resultCard.focus({ preventScroll: true });
      }, 180);
    }

    if (!hasResult) resultWasVisible = false;
  }

  function updateProcessingStage() {
    if (!statusText) return;

    const message = statusText.textContent.toLowerCase();
    const stages = Array.from(document.querySelectorAll('.processing-steps span'));
    let activeIndex = 0;

    if (message.includes('transcription') || message.includes('traduction')) activeIndex = 1;
    if (message.includes('voix ia') || message.includes('création de la voix')) activeIndex = 2;
    if (
      message.includes('final') ||
      message.includes('préparation du fichier') ||
      message.includes('synchronisation locale') ||
      message.includes('terminé')
    ) activeIndex = 3;

    stages.forEach((stage, index) => {
      stage.classList.toggle('done', index < activeIndex);
      stage.classList.toggle('active', index === activeIndex);
    });
  }

  async function copyTranslation() {
    const text = outputText ? outputText.value.trim() : '';

    if (!text) {
      setTemporaryButtonText(copyTextBtn, 'Aucun texte');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setTemporaryButtonText(copyTextBtn, 'Texte copié ✓');
    } catch (error) {
      outputText.focus();
      outputText.select();
      document.execCommand('copy');
      setTemporaryButtonText(copyTextBtn, 'Texte copié ✓');
    }
  }

  function startNewProject() {
    if (typeof window.resetResult === 'function') window.resetResult();

    if (mediaFile) {
      mediaFile.value = '';
      mediaFile.dispatchEvent(new Event('change', { bubbles: true }));
    }

    document.body.classList.remove('has-result', 'is-processing', 'has-file');
    resultWasVisible = false;

    window.setTimeout(() => {
      projectCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  }

  function setTemporaryButtonText(button, text) {
    if (!button) return;
    const original = button.dataset.originalText || button.textContent;
    button.dataset.originalText = original;
    button.textContent = text;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  }

  window.VIRALVOICE_UI_VERSION = '3.3.0';
})();
