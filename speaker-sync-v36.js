(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const VERSION = '20260731v365';
  const AUTO_SAVE_KEY = 'viralvoiceAutoSave365';
  const autoDownloadedUrls = new Set();
  let latestMedia = null;

  removeLegacyLipSyncUi();
  installAutoSaveOption();
  installSaveAsControls();
  updateVersionLabels();

  window.fetch = async (input, init = {}) => {
    const url = String(input || '');
    const body = init && init.body;

    if (url.includes('/api/dub-video') && body instanceof FormData) {
      const firstSpeakerRole = document.getElementById('firstSpeakerRole');
      const maleVoice = document.getElementById('maleVoice');
      const femaleVoice = document.getElementById('femaleVoice');

      body.set('firstSpeakerRole', firstSpeakerRole ? firstSpeakerRole.value : 'auto');
      body.set('maleVoice', maleVoice ? maleVoice.value : 'cedar');
      body.set('femaleVoice', femaleVoice ? femaleVoice.value : 'coral');
      body.set('lipSync', 'false');
      body.delete('lipSyncQuality');
      body.delete('lipSyncBboxShift');
      body.delete('lipSyncExtraMargin');
    }

    const response = await nativeFetch(input, init);

    if (url.includes('/api/dub-video') && response.ok) {
      response.clone().json().then(data => {
        updateResultLabel(data);
        latestMedia = buildMediaResult(data, url);
        revealSaveAsControls();
        startAutomaticDownload(latestMedia);
      }).catch(() => {});
    }

    return response;
  };

  function installAutoSaveOption() {
    const install = () => {
      if (document.getElementById('autoSaveMedia')) return;
      const dock = document.querySelector('.action-dock');
      if (!dock) return;

      const row = document.createElement('label');
      row.className = 'switch-row main-switch auto-save-row';
      row.htmlFor = 'autoSaveMedia';
      row.innerHTML = `
        <input id="autoSaveMedia" type="checkbox" />
        <span>
          <strong>Enregistrer automatiquement sur mon téléphone</strong>
          <small>Optionnel. Le bouton « Enregistrer dans… » reste la méthode recommandée pour choisir exactement le dossier.</small>
        </span>
      `;

      const checkbox = row.querySelector('input');
      const stored = localStorage.getItem(AUTO_SAVE_KEY);
      checkbox.checked = stored === 'true';
      checkbox.addEventListener('change', () => {
        localStorage.setItem(AUTO_SAVE_KEY, String(checkbox.checked));
      });

      dock.parentNode.insertBefore(row, dock);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  }

  function installSaveAsControls() {
    const install = () => {
      const actions = document.querySelector('.result-actions');
      if (!actions) return;

      let saveAsButton = document.getElementById('saveAsBtn');
      if (!saveAsButton) {
        saveAsButton = document.createElement('button');
        saveAsButton.id = 'saveAsBtn';
        saveAsButton.type = 'button';
        saveAsButton.className = 'download primary-download hidden';
        saveAsButton.style.gridColumn = '1 / -1';
        saveAsButton.textContent = '📁 Enregistrer dans…';
        actions.prepend(saveAsButton);
      }

      let saveAsHint = document.getElementById('saveAsHint');
      if (!saveAsHint) {
        saveAsHint = document.createElement('p');
        saveAsHint.id = 'saveAsHint';
        saveAsHint.className = 'hint hidden';
        saveAsHint.style.gridColumn = '1 / -1';
        saveAsHint.textContent =
          'Le gestionnaire de fichiers Android va s’ouvrir : choisis le dossier, puis appuie sur Enregistrer.';
        actions.appendChild(saveAsHint);
      }

      saveAsButton.addEventListener('click', () => {
        saveLatestMediaAs(saveAsButton);
      });

      ['downloadVideoBtn', 'downloadAudioBtn'].forEach(id => {
        const anchor = document.getElementById(id);
        anchor?.addEventListener('click', event => {
          if (!latestMedia || !hasNativeSaveAs()) return;
          event.preventDefault();
          event.stopPropagation();
          saveLatestMediaAs(saveAsButton);
        }, true);
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  }

  function revealSaveAsControls() {
    if (!latestMedia) return;
    document.getElementById('saveAsBtn')?.classList.remove('hidden');
    document.getElementById('saveAsHint')?.classList.remove('hidden');
  }

  function saveLatestMediaAs(button) {
    if (!latestMedia) {
      setTemporaryButtonText(button, 'Aucun fichier prêt');
      return;
    }

    if (launchNativeSaveAs(latestMedia)) {
      setTemporaryButtonText(button, 'Gestionnaire ouvert ✓');
      announceSaveAs();
      return;
    }

    if (launchBrowserDownload(latestMedia.url, latestMedia.fileName)) {
      setTemporaryButtonText(button, 'Téléchargement lancé');
      return;
    }

    setTemporaryButtonText(button, 'Enregistrement impossible');
  }

  function buildMediaResult(data, requestUrl) {
    const resultUrl = data?.dubbedVideoUrl || data?.dubbedAudioUrl;
    if (!resultUrl) return null;

    let mediaUrl;
    try {
      mediaUrl = new URL(resultUrl, requestUrl).toString();
    } catch {
      return null;
    }

    if (!mediaUrl.startsWith('https://')) return null;

    const isVideo = Boolean(data?.dubbedVideoUrl);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      url: mediaUrl,
      fileName: isVideo
        ? `ViralVoice-Premium-${timestamp}.mp4`
        : `ViralVoice-Premium-${timestamp}.mp3`,
      mimeType: isVideo ? 'video/mp4' : 'audio/mpeg',
      isVideo
    };
  }

  function isAutoSaveEnabled() {
    const checkbox = document.getElementById('autoSaveMedia');
    return checkbox ? checkbox.checked : false;
  }

  function updateResultLabel(data) {
    const speakerInfo = document.getElementById('speakerInfo');
    if (!speakerInfo) return;

    const profiles = Object.values(data?.speakerProfiles || {});
    const feminine = profiles.filter(item => item?.profile === 'feminine').length;
    const masculine = profiles.filter(item => item?.profile === 'masculine').length;
    const neutral = profiles.filter(item => item?.profile === 'neutral').length;
    const synchronized = Number(data?.synchronizedSegments || 0);
    const adapted = Number(data?.durationAdaptedSegments || 0);
    const fallbacks = Number(data?.voiceFallbackSegments || 0);
    const details = [];

    if (feminine) details.push(`${feminine} voix féminine${feminine > 1 ? 's' : ''}`);
    if (masculine) details.push(`${masculine} voix masculine${masculine > 1 ? 's' : ''}`);
    if (neutral) details.push(`${neutral} voix à confirmer`);

    const quality = fallbacks > 0
      ? `${fallbacks} passage(s) en voix de secours`
      : 'voix premium complète';

    speakerInfo.textContent =
      `Doublage premium terminé · ${Number(data?.speakersDetected || 1)} intervenant(s) · ` +
      `${adapted}/${synchronized} passage(s) adaptés à leur durée · ${quality}` +
      (details.length ? ` · ${details.join(', ')}` : '');
  }

  function startAutomaticDownload(media) {
    if (!isAutoSaveEnabled() || !media) return;
    if (autoDownloadedUrls.has(media.url)) return;

    if (launchNativeSave(media.url, media.fileName, media.mimeType)) {
      autoDownloadedUrls.add(media.url);
      announceAutomaticSave(media.isVideo);
      return;
    }

    if (launchBrowserDownload(media.url, media.fileName)) {
      autoDownloadedUrls.add(media.url);
      announceAutomaticSave(media.isVideo);
    }
  }

  function hasNativeSaveAs() {
    return Boolean(
      window.ViralVoiceAndroid &&
      typeof window.ViralVoiceAndroid.saveMediaAs === 'function'
    );
  }

  function launchNativeSaveAs(media) {
    try {
      if (!hasNativeSaveAs()) return false;
      const accepted = window.ViralVoiceAndroid.saveMediaAs(
        media.url,
        media.fileName,
        media.mimeType
      );
      return accepted === true || accepted === 'true' || accepted === 1;
    } catch (error) {
      console.warn('Sélecteur Android indisponible', error);
      return false;
    }
  }

  function launchNativeSave(mediaUrl, fileName, mimeType) {
    try {
      if (!window.ViralVoiceAndroid) return false;

      const method = typeof window.ViralVoiceAndroid.saveMedia === 'function'
        ? window.ViralVoiceAndroid.saveMedia.bind(window.ViralVoiceAndroid)
        : typeof window.ViralVoiceAndroid.download === 'function'
        ? window.ViralVoiceAndroid.download.bind(window.ViralVoiceAndroid)
        : null;

      if (!method) return false;

      const accepted = method(mediaUrl, fileName, mimeType);
      return accepted === true || accepted === 'true' || accepted === 1;
    } catch (error) {
      console.warn('Sauvegarde Android indisponible', error);
      return false;
    }
  }

  function launchBrowserDownload(mediaUrl, fileName) {
    try {
      const link = document.createElement('a');
      link.href = mediaUrl;
      link.download = fileName;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => link.remove(), 1500);
      return true;
    } catch (error) {
      console.warn('Téléchargement navigateur indisponible', error);
      return false;
    }
  }

  function announceAutomaticSave(isVideo) {
    const speakerInfo = document.getElementById('speakerInfo');
    if (!speakerInfo) return;

    const message = isVideo
      ? 'Enregistrement automatique lancé dans Films/ViralVoice.'
      : 'Enregistrement automatique lancé dans Musique/ViralVoice.';
    if (!speakerInfo.textContent.includes(message)) {
      speakerInfo.textContent = `${speakerInfo.textContent} · ${message}`;
    }
  }

  function announceSaveAs() {
    const speakerInfo = document.getElementById('speakerInfo');
    if (!speakerInfo) return;
    const message = 'Choisis maintenant le dossier dans le gestionnaire de fichiers.';
    if (!speakerInfo.textContent.includes(message)) {
      speakerInfo.textContent = `${speakerInfo.textContent} · ${message}`;
    }
  }

  function updateVersionLabels() {
    const update = () => {
      document.querySelectorAll('.version-pill').forEach(element => {
        element.textContent = '3.6.5';
      });
      document.querySelectorAll('.app-footer strong').forEach(element => {
        element.textContent = 'ViralVoice Pro 3.6.5';
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', update, { once: true });
    } else {
      update();
    }
  }

  function setTemporaryButtonText(button, text) {
    if (!button) return;
    const original = button.dataset.originalText || button.textContent;
    button.dataset.originalText = original;
    button.textContent = text;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1800);
  }

  function removeLegacyLipSyncUi() {
    document.querySelectorAll(
      '.lip-sync-card, [data-lipsync-card], #lipSyncMode, #lipSyncBadge, #lipSyncHint'
    ).forEach(element => {
      const card = element.closest?.('.lip-sync-card, section.card') || element;
      if (
        card.classList?.contains('lip-sync-card') ||
        /synchronisation des lèvres|lip-sync vidéo|musetalk/i.test(card.textContent || '')
      ) {
        card.remove();
      } else {
        element.remove();
      }
    });
  }

  window.VIRALVOICE_SYNC_VERSION = VERSION;
})();
