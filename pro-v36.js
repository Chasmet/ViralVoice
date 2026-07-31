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

  hideSourcePreviews();
  syncBodyState();

  mediaFile?.addEventListener('change', () => {
    window.setTimeout(() => {
      hideSourcePreviews();
      syncBodyState();
    }, 0);
  });

  dubBtn?.addEventListener('click', () => {
    document.body.classList.add('is-processing');
    updateProcessingStage();
  });

  copyTextBtn?.addEventListener('click', copyTranslation);
  newDubBtn?.addEventListener('click', startNewProject);

  const classObserver = new MutationObserver(() => {
    syncBodyState();
    updateProcessingStage();
  });

  [statusCard, resultCard].filter(Boolean).forEach(element => {
    classObserver.observe(element, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  if (statusText) {
    classObserver.observe(statusText, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function hideSourcePreviews() {
    [sourcePreview, sourceAudioPreview].filter(Boolean).forEach(media => {
      try {
        media.pause();
        media.removeAttribute('src');
        media.load();
      } catch {
        // L'aperçu est déjà vide.
      }
      media.classList.add('hidden', 'source-preview-hidden');
      media.setAttribute('aria-hidden', 'true');
    });
  }

  function syncBodyState() {
    const hasFile = Boolean(mediaFile?.files?.length);
    const processing = Boolean(statusCard && !statusCard.classList.contains('hidden'));
    const hasResult = Boolean(resultCard && !resultCard.classList.contains('hidden'));

    document.body.classList.toggle('has-file', hasFile);
    document.body.classList.toggle('is-processing', processing);
    document.body.classList.toggle('has-result', hasResult);
    projectCard?.classList.toggle('file-selected', hasFile);

    if (hasResult && !resultWasVisible) {
      resultWasVisible = true;
      window.setTimeout(() => {
        resultCard.scrollIntoView({ behavior: 'auto', block: 'start' });
        resultCard.focus({ preventScroll: true });
      }, 80);
    }

    if (!hasResult) resultWasVisible = false;
  }

  function updateProcessingStage() {
    if (!statusText) return;

    const message = statusText.textContent.toLowerCase();
    const stages = Array.from(document.querySelectorAll('.processing-steps span'));
    let activeIndex = 0;

    if (
      message.includes('transcription') ||
      message.includes('traduction') ||
      message.includes('adaptation')
    ) activeIndex = 1;
    if (
      message.includes('voix ia') ||
      message.includes('création de la voix') ||
      message.includes('profil vocal') ||
      message.includes('doublage premium')
    ) activeIndex = 2;
    if (
      message.includes('final') ||
      message.includes('préparation du fichier') ||
      message.includes('terminé')
    ) activeIndex = 3;

    stages.forEach((stage, index) => {
      stage.classList.toggle('done', index < activeIndex);
      stage.classList.toggle('active', index === activeIndex);
    });
  }

  async function copyTranslation() {
    const text = outputText?.value?.trim() || '';
    if (!text) {
      setTemporaryButtonText(copyTextBtn, 'Aucun texte');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setTemporaryButtonText(copyTextBtn, 'Texte copié ✓');
    } catch {
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
      projectCard?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }, 20);
  }

  function setTemporaryButtonText(button, text) {
    if (!button) return;
    const original = button.dataset.originalText || button.textContent;
    button.dataset.originalText = original;
    button.textContent = text;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1400);
  }

  window.VIRALVOICE_UI_VERSION = '3.6.0';
})();
