(() => {
  'use strict';

  if (window.__VIRALVOICE_FILE_SELECTOR_FIX_V415) return;
  window.__VIRALVOICE_FILE_SELECTOR_FIX_V415 = true;

  function init() {
    const input = document.getElementById('mediaFile');
    const card = document.getElementById('projectCard');
    const fileInfo = document.getElementById('fileInfo');
    if (!input || !card) return;

    let button = document.getElementById('changeMediaFileBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'changeMediaFileBtn';
      button.type = 'button';
      button.className = 'secondary full change-media-btn';
      button.textContent = 'Changer de vidéo / audio';
      button.style.marginTop = '10px';
      button.style.display = 'none';

      const preview = document.getElementById('sourcePreview');
      const audioPreview = document.getElementById('sourceAudioPreview');
      const anchor = audioPreview || preview || fileInfo;
      if (anchor && anchor.parentNode === card) anchor.insertAdjacentElement('afterend', button);
      else card.appendChild(button);
    }

    const openPickerFresh = () => {
      try { input.value = ''; } catch {}
      input.disabled = false;
      input.click();
    };

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openPickerFresh();
    });

    const zone = card.querySelector('label.file-zone[for="mediaFile"]');
    if (zone) {
      zone.addEventListener('click', event => {
        // Empêche le comportement implicite du label, qui peut réutiliser la
        // même valeur de fichier sans déclencher l'événement change.
        event.preventDefault();
        openPickerFresh();
      }, true);
    }

    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      button.style.display = file ? '' : 'none';
      if (fileInfo && file) fileInfo.dataset.hasMedia = '1';
    });

    // Si une sélection existe déjà au moment où le correctif est injecté.
    if (input.files && input.files.length > 0) button.style.display = '';

    // Après un résultat terminé, le bouton reste disponible pour repartir
    // immédiatement sur une autre vidéo sans recharger l'application.
    window.addEventListener('viralvoice:result-ready', () => {
      button.style.display = '';
      input.disabled = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
