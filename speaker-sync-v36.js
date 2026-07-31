(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const VERSION = '20260731v364';
  const AUTO_SAVE_KEY = 'viralvoiceAutoSave';
  const autoDownloadedUrls = new Set();

  removeLegacyLipSyncUi();
  installAutoSaveOption();

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
          <small>L’APK écrit directement la vidéo dans Films/ViralVoice, sans dépendre du gestionnaire de téléchargement.</small>
        </span>
      `;

      const checkbox = row.querySelector('input');
      const stored = localStorage.getItem(AUTO_SAVE_KEY);
      checkbox.checked = stored === null ? true : stored === 'true';
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

  function isAutoSaveEnabled() {
    const checkbox = document.getElementById('autoSaveMedia');
    return checkbox ? checkbox.checked : true;
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

  function startAutomaticDownload(data, requestUrl) {
    if (!isAutoSaveEnabled()) return;

    const resultUrl = data?.dubbedVideoUrl || data?.dubbedAudioUrl;
    if (!resultUrl) return;

    let mediaUrl;
    try {
      mediaUrl = new URL(resultUrl, requestUrl).toString();
    } catch {
      return;
    }

    if (!mediaUrl.startsWith('https://') || autoDownloadedUrls.has(mediaUrl)) return;

    const isVideo = Boolean(data?.dubbedVideoUrl);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = isVideo
      ? `ViralVoice-Premium-${timestamp}.mp4`
      : `ViralVoice-Premium-${timestamp}.mp3`;
    const mimeType = isVideo ? 'video/mp4' : 'audio/mpeg';

    if (launchNativeSave(mediaUrl, fileName, mimeType)) {
      autoDownloadedUrls.add(mediaUrl);
      announceAutomaticSave(isVideo);
      return;
    }

    if (launchBrowserDownload(mediaUrl, fileName)) {
      autoDownloadedUrls.add(mediaUrl);
      announceAutomaticSave(isVideo);
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
