(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const VERSION = '20260731v360';
  const autoDownloadedUrls = new Set();

  removeLegacyLipSyncUi();

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
        startAutomaticDownload(data, url);
      }).catch(() => {});
    }

    return response;
  };

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

  function startAutomaticDownload(data, requestUrl) {
    const resultUrl = data?.dubbedVideoUrl || data?.dubbedAudioUrl;
    if (!resultUrl) return;

    let mediaUrl;
    try {
      mediaUrl = new URL(resultUrl, requestUrl).toString();
    } catch {
      return;
    }

    if (!mediaUrl.startsWith('https://') || autoDownloadedUrls.has(mediaUrl)) return;
    autoDownloadedUrls.add(mediaUrl);

    const isVideo = Boolean(data?.dubbedVideoUrl);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = isVideo
      ? `ViralVoice-Premium-${timestamp}.mp4`
      : `ViralVoice-Premium-${timestamp}.mp3`;
    const mimeType = isVideo ? 'video/mp4' : 'audio/mpeg';

    try {
      if (
        window.ViralVoiceAndroid &&
        typeof window.ViralVoiceAndroid.download === 'function'
      ) {
        window.ViralVoiceAndroid.download(mediaUrl, fileName, mimeType);
        return;
      }
    } catch (error) {
      console.warn('Pont Android indisponible', error);
    }

    const link = document.createElement('a');
    link.href = mediaUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => link.remove(), 1000);
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
