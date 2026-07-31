(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const VERSION = '20260731v330';
  const autoDownloadedUrls = new Set();
  let pendingLocalSync = null;

  removeLegacyLipSyncUi();
  renumberMixSection();
  refreshVisibleLimits();

  const legacyObserver = new MutationObserver(() => {
    removeLegacyLipSyncUi();
    renumberMixSection();
  });

  legacyObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.fetch = async (input, init = {}) => {
    const url = String(input || '');
    const body = init && init.body;

    if (url.includes('/api/dub-video') && body instanceof FormData) {
      const firstSpeakerRole = document.getElementById('firstSpeakerRole');
      const maleVoice = document.getElementById('maleVoice');
      const femaleVoice = document.getElementById('femaleVoice');

      body.set('firstSpeakerRole', firstSpeakerRole ? firstSpeakerRole.value : 'male');
      body.set('maleVoice', maleVoice ? maleVoice.value : 'cedar');
      body.set('femaleVoice', femaleVoice ? femaleVoice.value : 'coral');

      // Le moteur de bouche MuseTalk est définitivement désactivé dans l'application.
      body.set('lipSync', 'false');
      body.delete('lipSyncQuality');
      body.delete('lipSyncBboxShift');
      body.delete('lipSyncExtraMargin');
    }

    const response = await nativeFetch(input, init);

    if (url.includes('/api/dub-video') && response.ok) {
      response.clone().json().then(data => {
        updateResultLabel(data);
        startBestAvailableDownload(data, url);
      }).catch(() => {});
    }

    return response;
  };

  function startBestAvailableDownload(data, requestUrl) {
    const mediaFile = document.getElementById('mediaFile');
    const selectedFile = mediaFile && mediaFile.files ? mediaFile.files[0] : null;
    const isVideo = Boolean(selectedFile && selectedFile.type.startsWith('video/'));

    if (isVideo && data && data.dubbedAudioUrl && canUseAndroidLocalSync()) {
      let audioUrl;
      try {
        audioUrl = new URL(data.dubbedAudioUrl, requestUrl).toString();
      } catch {
        startAutomaticVideoDownload(data, requestUrl);
        return;
      }

      if (!audioUrl.startsWith('https://')) {
        startAutomaticVideoDownload(data, requestUrl);
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `ViralVoice-Synchronisee-${timestamp}.mp4`;
      pendingLocalSync = { data, requestUrl, fileName };

      try {
        const accepted = window.ViralVoiceAndroid.optimizeDub(audioUrl, fileName);
        if (accepted) {
          updateLocalSyncStatus('Traduction terminée. Le téléphone assemble maintenant la vidéo et la voix.');
          return;
        }
      } catch (error) {
        console.warn('Synchronisation locale Android indisponible', error);
      }
    }

    startAutomaticVideoDownload(data, requestUrl);
  }

  function canUseAndroidLocalSync() {
    return Boolean(
      window.ViralVoiceAndroid &&
      typeof window.ViralVoiceAndroid.optimizeDub === 'function'
    );
  }

  function startAutomaticVideoDownload(data, requestUrl) {
    if (!data || !data.dubbedVideoUrl) return;

    let videoUrl;
    try {
      videoUrl = new URL(data.dubbedVideoUrl, requestUrl).toString();
    } catch {
      return;
    }

    if (!videoUrl.startsWith('https://') || autoDownloadedUrls.has(videoUrl)) return;
    autoDownloadedUrls.add(videoUrl);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `ViralVoice-Doublee-${timestamp}.mp4`;

    try {
      if (window.ViralVoiceAndroid && typeof window.ViralVoiceAndroid.download === 'function') {
        window.ViralVoiceAndroid.download(videoUrl, fileName, 'video/mp4');
        return;
      }
    } catch (error) {
      console.warn('Pont Android de téléchargement indisponible', error);
    }

    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => link.remove(), 1000);
  }

  function updateResultLabel(data) {
    const speakerInfo = document.getElementById('speakerInfo');
    if (!speakerInfo) return;

    const speakers = Number(data?.speakersDetected || 1);
    const segments = Number(data?.synchronizedSegments || 0);
    speakerInfo.textContent =
      `Traduction terminée · ${speakers} intervenant(s) · ${segments} passage(s) recalés sur la timeline originale.`;
  }

  function updateLocalSyncStatus(message, type = 'loading') {
    const speakerInfo = document.getElementById('speakerInfo');
    const userStatus = document.getElementById('userStatus');

    if (speakerInfo) speakerInfo.textContent = message;
    if (userStatus) {
      userStatus.textContent = message;
      userStatus.classList.remove('hidden', 'error', 'success', 'warning', 'loading');
      userStatus.classList.add(type);
    }
  }

  window.ViralVoiceLocalSync = {
    onStart() {
      updateLocalSyncStatus(
        'Traduction terminée. Synchronisation audio/vidéo locale avec la puissance du téléphone…',
        'loading'
      );
    },

    onComplete(fileName) {
      updateLocalSyncStatus(
        `Vidéo synchronisée et enregistrée dans Téléchargements/ViralVoice : ${fileName}`,
        'success'
      );
      pendingLocalSync = null;
    },

    onError(message) {
      const fallback = pendingLocalSync;
      pendingLocalSync = null;
      updateLocalSyncStatus(
        `Montage local impossible (${message || 'erreur Android'}). Téléchargement de la version serveur…`,
        'warning'
      );
      if (fallback) startAutomaticVideoDownload(fallback.data, fallback.requestUrl);
    }
  };

  function removeLegacyLipSyncUi() {
    document.querySelectorAll(
      '.lip-sync-card, [data-lipsync-card], #lipSyncMode, #lipSyncBadge, #lipSyncHint'
    ).forEach(element => {
      const card = element.closest?.('.lip-sync-card, section.card') || element;
      if (card && (
        card.classList?.contains('lip-sync-card') ||
        /synchronisation des lèvres|lip-sync vidéo|musetalk/i.test(card.textContent || '')
      )) {
        card.remove();
      } else if (element.parentElement) {
        element.remove();
      }
    });

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

  function refreshVisibleLimits() {
    document.querySelectorAll('.hint, .file-zone small').forEach(node => {
      node.textContent = node.textContent
        .replace('Durée maximale par doublage : 120 secondes.', 'Durée maximale par doublage : 5 minutes.')
        .replace('maximum 120 secondes', 'maximum 5 minutes');
    });
  }

  window.VIRALVOICE_SYNC_VERSION = VERSION;
})();
