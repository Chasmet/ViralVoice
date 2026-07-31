(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const VERSION = '20260731v340';
  const autoDownloadedUrls = new Set();

  cleanLegacyLipSyncUi();
  refreshVisibleLimits();

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
      body.set('lipSync', 'false');
      body.delete('lipSyncQuality');
      body.delete('lipSyncBboxShift');
      body.delete('lipSyncExtraMargin');
    }

    const response = await nativeFetch(input, init);

    if (url.includes('/api/dub-video') && response.ok) {
      response.clone().json().then(data => {
        updateResultLabel(data);
        startAutomaticDownload(data, url);
      }).catch(() => {});
    }

    return response;
  };

  function startAutomaticDownload(data, requestUrl) {
    const relativeUrl = data && (data.dubbedVideoUrl || data.dubbedAudioUrl);
    if (!relativeUrl) return;

    let mediaUrl;
    try {
      mediaUrl = new URL(relativeUrl, requestUrl).toString();
    } catch {
      return;
    }

    if (!mediaUrl.startsWith('https://') || autoDownloadedUrls.has(mediaUrl)) return;
    autoDownloadedUrls.add(mediaUrl);

    const isVideo = Boolean(data.dubbedVideoUrl);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = isVideo
      ? `ViralVoice-Doublee-${timestamp}.mp4`
      : `ViralVoice-Audio-${timestamp}.mp3`;
    const mimeType = isVideo ? 'video/mp4' : 'audio/mpeg';

    try {
      if (window.ViralVoiceAndroid && typeof window.ViralVoiceAndroid.download === 'function') {
        window.ViralVoiceAndroid.download(mediaUrl, fileName, mimeType);
        return;
      }
    } catch (error) {
      console.warn('Téléchargement Android indisponible', error);
    }

    const link = document.createElement('a');
    link.href = mediaUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => link.remove(), 500);
  }

  function updateResultLabel(data) {
    const speakerInfo = document.getElementById('speakerInfo');
    if (!speakerInfo) return;

    const speakers = Number(data?.speakersDetected || 1);
    const segments = Number(data?.synchronizedSegments || 0);
    speakerInfo.textContent =
      `Traduction terminée · ${speakers} intervenant(s) · ${segments} passage(s) replacés sur la timeline originale.`;
  }

  function cleanLegacyLipSyncUi() {
    document.querySelectorAll('.lip-sync-card, [data-lipsync-card]').forEach(card => card.remove());

    document.querySelectorAll('.notice, .status, [role="alert"]').forEach(element => {
      const text = String(element.textContent || '');
      if (/LIPSYNC_SERVICE_URL|lip-sync indisponible|musetalk|GPU à configurer/i.test(text)) {
        element.textContent = '';
        element.classList.add('hidden');
      }
    });
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
