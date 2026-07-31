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

  prepareLipSyncCard();
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

  if (copyTextBtn) {
    copyTextBtn.addEventListener('click', copyTranslation);
  }

  if (newDubBtn) {
    newDubBtn.addEventListener('click', startNewProject);
  }

  const observer = new MutationObserver(() => {
    hideSourcePreviews();
    syncBodyState();
    updateProcessingStage();
  });

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

  function syncBodyState() {
    const hasFile = Boolean(mediaFile && mediaFile.files && mediaFile.files.length);
    const processing = Boolean(statusCard && !statusCard.classList.contains('hidden'));
    const hasResult = Boolean(resultCard && !resultCard.classList.contains('hidden'));

    document.body.classList.toggle('has-file', hasFile);
    document.body.classList.toggle('is-processing', processing);
    document.body.classList.toggle('has-result', hasResult);

    if (projectCard) {
      projectCard.classList.toggle('file-selected', hasFile);
    }

    if (hasResult && !resultWasVisible) {
      resultWasVisible = true;
      window.setTimeout(() => {
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        resultCard.focus({ preventScroll: true });
      }, 180);
    }

    if (!hasResult) {
      resultWasVisible = false;
    }
  }

  function updateProcessingStage() {
    if (!statusText) return;

    const message = statusText.textContent.toLowerCase();
    const stages = Array.from(document.querySelectorAll('.processing-steps span'));
    let activeIndex = 0;

    if (message.includes('transcription') || message.includes('traduction')) activeIndex = 1;
    if (message.includes('voix ia') || message.includes('création de la voix')) activeIndex = 2;
    if (message.includes('final') || message.includes('préparation du fichier') || message.includes('terminé')) activeIndex = 3;

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
    if (typeof window.resetResult === 'function') {
      window.resetResult();
    }

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

  function prepareLipSyncCard() {
    const card = document.querySelector('.lip-sync-card');
    if (!card || card.dataset.refonteReady === 'true') return;

    card.dataset.refonteReady = 'true';
    card.classList.add('workflow-card');

    const title = card.querySelector('h2');
    if (title) title.textContent = '4. Synchronisation des lèvres';

    const sectionTitle = card.querySelector('.section-title');
    if (sectionTitle && !sectionTitle.querySelector('.step-number')) {
      const marker = document.createElement('span');
      marker.className = 'step-number';
      marker.textContent = '4';
      sectionTitle.prepend(marker);
    }

    const grid = card.querySelector('.grid');
    const hint = card.querySelector('#lipSyncHint');

    if (grid) {
      const details = document.createElement('details');
      details.className = 'inline-details lip-advanced-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Réglages avancés du lip-sync';
      details.appendChild(summary);
      details.appendChild(grid);
      if (hint) details.appendChild(hint);
      card.appendChild(details);
    }

    const mixTitle = document.getElementById('mixTitle');
    if (mixTitle) mixTitle.textContent = '5. Mixage audio';
  }

  window.VIRALVOICE_UI_VERSION = '3.2.0';
})();
