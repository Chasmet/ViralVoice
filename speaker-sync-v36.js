(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const VERSION = '20260817v400';
  const AUTO_SAVE_KEY = 'viralvoiceAutoSave400';
  const PAYMENT_LINKS_KEY = 'viralvoice-payment-links';
  const PAYMENT_REQUESTS_KEY = 'viralvoice-payment-requests';
  const autoDownloadedUrls = new Set();
  let latestMedia = null;

  const DEFAULT_PAYMENT_LINKS = {
    decouverte: 'https://checkout.revolut.com/pay/1f3ed21f-2b5a-428e-98ce-92195da91bc6',
    createur: 'https://checkout.revolut.com/pay/664e7390-9e23-4772-beae-4cbe18ad228a',
    viral: 'https://checkout.revolut.com/pay/9249340c-529d-4fd5-ae94-8f250a7db43c',
    pro: 'https://checkout.revolut.com/pay/4ff81a0e-d5b1-41e5-8ece-1b9890bb1ac3'
  };

  const PACKS = {
    decouverte: { label: 'Découverte', minutes: 5, price: '1,99 €' },
    createur: { label: 'Créateur', minutes: 30, price: '6,99 €' },
    viral: { label: 'Viral', minutes: 60, price: '11,99 €' },
    pro: { label: 'Pro', minutes: 180, price: '29,99 €' }
  };

  removeLegacyLipSyncUi();
  installAutoSaveOption();
  installSaveAsControls();
  installCommerceFix();
  installMinuteLabels();
  updateVersionLabels();

  window.fetch = async (input, init = {}) => {
    const url = String(input || '');
    const body = init && init.body;

    if (url.includes('/api/dub-video') && body instanceof FormData) {
      const firstSpeakerRole = document.getElementById('firstSpeakerRole');
      const maleVoice = document.getElementById('maleVoice');
      const femaleVoice = document.getElementById('femaleVoice');

      body.set('multiVoice', 'true');
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

  function installCommerceFix() {
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('.buy-btn');
      if (!button) return;

      const planId = button.dataset.plan;
      const pack = PACKS[planId];
      if (!pack) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const emailInput = document.getElementById('clientEmail');
      const email = String(emailInput?.value || '').trim().toLowerCase();
      const paymentStatus = document.getElementById('paymentStatus');

      if (!email) {
        showPaymentStatus(paymentStatus, 'Entre ton email avant de payer.', 'error');
        emailInput?.focus();
        return;
      }

      const links = readPaymentLinks();
      const url = links[planId];
      if (!url) {
        showPaymentStatus(paymentStatus, 'Lien de paiement non configuré pour ce pack.', 'warning');
        return;
      }

      const requests = readPaymentRequests();
      requests.unshift({
        id: Date.now(),
        clientEmail: email,
        planId,
        planLabel: pack.label,
        credits: pack.minutes,
        minutes: pack.minutes,
        price: pack.price,
        status: 'paiement ouvert',
        date: new Date().toLocaleString()
      });
      localStorage.setItem(PAYMENT_REQUESTS_KEY, JSON.stringify(requests.slice(0, 50)));
      renderPaymentRequests(requests.slice(0, 50));

      showPaymentStatus(
        paymentStatus,
        `${pack.label} · ${pack.minutes} minutes · paiement ouvert.`,
        'success'
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    }, true);
  }

  function readPaymentLinks() {
    try {
      const saved = JSON.parse(localStorage.getItem(PAYMENT_LINKS_KEY) || '{}');
      return { ...DEFAULT_PAYMENT_LINKS, ...saved };
    } catch {
      return { ...DEFAULT_PAYMENT_LINKS };
    }
  }

  function readPaymentRequests() {
    try {
      return JSON.parse(localStorage.getItem(PAYMENT_REQUESTS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function renderPaymentRequests(requests) {
    const list = document.getElementById('paymentRequestsList');
    if (!list) return;
    if (!requests.length) {
      list.innerHTML = '<p class="hint">Aucune demande enregistrée sur ce téléphone.</p>';
      return;
    }

    list.innerHTML = requests.map(item => `
      <div class="payment-request">
        <strong>${escapeHtml(item.clientEmail || '')} - ${escapeHtml(item.planLabel || '')}</strong>
        <small>${escapeHtml(item.price || '')} - ${Number(item.minutes || item.credits || 0)} minute(s) - ${escapeHtml(item.date || '')}</small>
        <span>${escapeHtml(item.status || '')}</span>
      </div>
    `).join('');
  }

  function showPaymentStatus(element, text, type) {
    if (!element) return;
    element.textContent = text;
    element.className = `notice ${type || ''}`.trim();
    element.classList.remove('hidden');
  }

  function installMinuteLabels() {
    const install = () => {
      const badge = document.getElementById('walletBadge');
      const walletStatus = document.getElementById('walletStatus');
      const adminTokensLabel = document.querySelector('label[for="adminTokens"]');

      if (adminTokensLabel) adminTokensLabel.textContent = 'Nombre de minutes';

      const normalize = element => {
        if (!element) return;
        element.textContent = element.textContent
          .replace(/crédits?/gi, 'minutes')
          .replace(/crédit\(s\)/gi, 'minute(s)');
      };

      normalize(badge);
      normalize(walletStatus);

      [badge, walletStatus].filter(Boolean).forEach(element => {
        const observer = new MutationObserver(() => normalize(element));
        observer.observe(element, { childList: true, characterData: true, subtree: true });
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
      install();
    }
  }

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
          <small>Optionnel. « Enregistrer dans… » permet de choisir exactement le dossier.</small>
        </span>
      `;

      const checkbox = row.querySelector('input');
      checkbox.checked = localStorage.getItem(AUTO_SAVE_KEY) === 'true';
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
        saveAsButton.textContent = 'Enregistrer dans…';
        actions.prepend(saveAsButton);
      }

      let saveAsHint = document.getElementById('saveAsHint');
      if (!saveAsHint) {
        saveAsHint = document.createElement('p');
        saveAsHint.id = 'saveAsHint';
        saveAsHint.className = 'hint hidden';
        saveAsHint.style.gridColumn = '1 / -1';
        saveAsHint.textContent =
          'Le gestionnaire de fichiers Android va s’ouvrir : choisis le dossier puis Enregistrer.';
        actions.appendChild(saveAsHint);
      }

      saveAsButton.addEventListener('click', () => saveLatestMediaAs(saveAsButton));

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
        ? `ViralVoice-4-${timestamp}.mp4`
        : `ViralVoice-4-${timestamp}.mp3`,
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

    const speakers = Number(data?.speakersDetected || 1);
    const synchronized = Number(data?.synchronizedSegments || 0);
    const engineLabel = data?.autoEngineLabel || 'Traitement automatique';
    const remaining = Number(data?.wallet?.token_balance ?? 0);
    const fallback = data?.autoFallbackReason
      ? ' · secours automatique utilisé'
      : '';

    speakerInfo.textContent =
      `ViralVoice Auto · ${speakers} intervenant${speakers > 1 ? 's' : ''} · ` +
      `${engineLabel} · ${synchronized} passage${synchronized > 1 ? 's' : ''} synchronisé${synchronized > 1 ? 's' : ''}` +
      `${data?.adminFreeMode ? ' · mode admin' : ` · ${remaining} min restante${remaining > 1 ? 's' : ''}`}` +
      fallback;
  }

  function startAutomaticDownload(mediaResult) {
    if (!isAutoSaveEnabled() || !mediaResult) return;
    if (autoDownloadedUrls.has(mediaResult.url)) return;

    if (launchNativeSave(mediaResult.url, mediaResult.fileName, mediaResult.mimeType)) {
      autoDownloadedUrls.add(mediaResult.url);
      announceAutomaticSave(mediaResult.isVideo);
      return;
    }

    if (launchBrowserDownload(mediaResult.url, mediaResult.fileName)) {
      autoDownloadedUrls.add(mediaResult.url);
      announceAutomaticSave(mediaResult.isVideo);
    }
  }

  function hasNativeSaveAs() {
    return Boolean(
      window.ViralVoiceAndroid &&
      typeof window.ViralVoiceAndroid.saveMediaAs === 'function'
    );
  }

  function launchNativeSaveAs(mediaResult) {
    try {
      if (!hasNativeSaveAs()) return false;
      const accepted = window.ViralVoiceAndroid.saveMediaAs(
        mediaResult.url,
        mediaResult.fileName,
        mediaResult.mimeType
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
        element.textContent = '4.0';
      });
      document.querySelectorAll('.app-footer strong').forEach(element => {
        element.textContent = 'ViralVoice 4.0';
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

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  window.VIRALVOICE_SYNC_VERSION = VERSION;
})();
