(() => {
  'use strict';

  if (window.__VIRALVOICE_RESULT_RECOVERY_V414) return;
  window.__VIRALVOICE_RESULT_RECOVERY_V414 = true;

  const previousFetch = window.fetch.bind(window);
  const ACTIVE_KEY = 'viralvoice-active-result-recovery';
  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const POLL_START_DELAY_MS = 5000;
  const POLL_MS = 2000;
  const ADMIN_FALLBACK_DELAY_MS = 12000;
  const RECOVERY_MAX_MS = 20 * 60 * 1000;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function makeToken() {
    try {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    } catch {
      return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    }
  }

  function readClientEmail() {
    const input = document.getElementById('clientEmail');
    return String(input?.value || localStorage.getItem(CLIENT_EMAIL_KEY) || '').trim().toLowerCase();
  }

  function readAdminSecret() {
    try {
      return String(localStorage.getItem(ADMIN_SECRET_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function saveActive(baseUrl, token) {
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({
        baseUrl,
        token,
        clientEmail: readClientEmail(),
        startedAt: Date.now()
      }));
    } catch {
      // Le doublage continue même si le stockage local est indisponible.
    }
  }

  function readActive() {
    try {
      const value = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
      if (!value?.token || !value?.baseUrl || !value?.startedAt) return null;
      if (Date.now() - Number(value.startedAt) > RECOVERY_MAX_MS) {
        localStorage.removeItem(ACTIVE_KEY);
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  function clearActive(token = '') {
    try {
      const current = readActive();
      if (!token || !current || current.token === token) {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch {
      // Rien à faire.
    }
  }

  function setRecoveryStatus(text) {
    const card = document.getElementById('statusCard');
    const status = document.getElementById('statusText');
    if (card) card.classList.remove('hidden');
    if (status) status.textContent = text;
  }

  function absoluteUrl(baseUrl, value) {
    if (!value) return '';
    try {
      return new URL(value, `${String(baseUrl || '').replace(/\/$/, '')}/`).href;
    } catch {
      return value;
    }
  }

  function applyRecoveredResult(data, baseUrl) {
    if (!data?.ok) return false;

    const outputText = document.getElementById('outputText');
    const speakerInfo = document.getElementById('speakerInfo');
    const finalVideo = document.getElementById('finalVideo');
    const finalAudio = document.getElementById('finalAudio');
    const downloadVideoBtn = document.getElementById('downloadVideoBtn');
    const downloadAudioBtn = document.getElementById('downloadAudioBtn');
    const resultCard = document.getElementById('resultCard');
    const statusCard = document.getElementById('statusCard');
    const statusText = document.getElementById('statusText');
    const userStatus = document.getElementById('userStatus');
    const walletBadge = document.getElementById('walletBadge');
    const dubBtn = document.getElementById('dubBtn');

    if (outputText && data.translation) outputText.value = data.translation;

    if (speakerInfo) {
      if (data.adminFreeMode) {
        speakerInfo.textContent = 'Mode admin : doublage gratuit généré.';
      } else if (data.wallet) {
        speakerInfo.textContent = `Doublage terminé. Minute(s) restante(s) : ${Number(data.wallet.token_balance || 0)}.`;
      } else {
        speakerInfo.textContent = 'Doublage terminé et récupéré automatiquement.';
      }
    }

    if (walletBadge && data.wallet && !data.adminFreeMode) {
      const balance = Number(data.wallet.token_balance || 0);
      walletBadge.textContent = `${balance} min`;
      walletBadge.classList.toggle('ok-badge', balance > 0);
      walletBadge.classList.toggle('muted-badge', balance <= 0);
    }

    if (data.dubbedVideoUrl && finalVideo) {
      const videoUrl = absoluteUrl(baseUrl, data.dubbedVideoUrl);
      finalVideo.src = videoUrl;
      finalVideo.classList.remove('hidden');
      finalVideo.load();
      if (downloadVideoBtn) {
        downloadVideoBtn.href = videoUrl;
        downloadVideoBtn.classList.remove('hidden');
        downloadVideoBtn.setAttribute('download', 'viralvoice-video-doublee.mp4');
      }
    }

    if (data.dubbedAudioUrl && finalAudio) {
      const audioUrl = absoluteUrl(baseUrl, data.dubbedAudioUrl);
      finalAudio.src = audioUrl;
      finalAudio.classList.remove('hidden');
      finalAudio.load();
      if (downloadAudioBtn) {
        downloadAudioBtn.href = audioUrl;
        downloadAudioBtn.classList.remove('hidden');
        downloadAudioBtn.setAttribute('download', 'viralvoice-voix-traduite.mp3');
      }
    }

    if (resultCard) {
      resultCard.classList.remove('hidden');
      setTimeout(() => {
        try {
          resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          // Scroll facultatif.
        }
      }, 150);
    }

    if (statusText) statusText.textContent = 'Terminé';
    if (statusCard) statusCard.classList.add('hidden');

    if (userStatus) {
      userStatus.textContent = 'Doublage terminé et récupéré automatiquement.';
      userStatus.className = 'notice user-status success';
      userStatus.classList.remove('hidden');
    }

    if (dubBtn) {
      dubBtn.disabled = false;
      dubBtn.textContent = '⚡ Créer mon doublage';
    }

    try {
      window.dispatchEvent(new CustomEvent('viralvoice:result-ready', {
        detail: { ...data, recovered: true, baseUrl }
      }));
    } catch {
      // Compatibilité anciens WebView.
    }

    return true;
  }

  async function recoverLatestAdmin(baseUrl, startedAt, emailHint = '') {
    const secret = readAdminSecret();
    const email = String(emailHint || readClientEmail()).trim().toLowerCase();
    if (!secret || !email) return null;

    try {
      const url = `${baseUrl}/api/admin/recover-latest?email=${encodeURIComponent(email)}` +
        `&startedAt=${encodeURIComponent(String(startedAt || 0))}` +
        `&maxAgeMs=${30 * 60 * 1000}&t=${Date.now()}`;
      const response = await previousFetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'x-admin-secret': secret,
          'Cache-Control': 'no-cache, no-store, max-age=0',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      return data?.ok ? data : null;
    } catch {
      return null;
    }
  }

  async function pollResult(baseUrl, token, state = {}) {
    const startedAt = Number(state.startedAt || Date.now());
    const emailHint = String(state.clientEmail || '').trim().toLowerCase();
    let lastAdminAttemptAt = 0;
    setRecoveryStatus('Récupération automatique du résultat en cours…');

    while (!state.cancelled && Date.now() - startedAt < RECOVERY_MAX_MS) {
      try {
        const response = await previousFetch(
          `${baseUrl}/api/recover-result?token=${encodeURIComponent(token)}&t=${Date.now()}`,
          {
            method: 'GET',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, max-age=0',
              'Pragma': 'no-cache'
            }
          }
        );

        if (response.status === 200) {
          const data = await response.json().catch(() => null);
          if (data?.ok) return data;
        }
      } catch {
        // Une coupure temporaire ne doit jamais relancer OpenAI.
      }

      const elapsed = Date.now() - startedAt;
      if (
        elapsed >= ADMIN_FALLBACK_DELAY_MS &&
        Date.now() - lastAdminAttemptAt >= 5000
      ) {
        lastAdminAttemptAt = Date.now();
        const latest = await recoverLatestAdmin(baseUrl, startedAt, emailHint);
        if (latest?.ok) return latest;
      }

      if (!state.cancelled) await sleep(POLL_MS);
    }

    if (state.cancelled) return null;
    throw new Error('Le résultat n’a pas pu être récupéré automatiquement dans le délai prévu.');
  }

  function responseFromRecovered(data) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-ViralVoice-Recovered': '1'
      }
    });
  }

  async function resumePendingResult() {
    const active = readActive();
    if (!active) return;

    const state = {
      startedAt: Number(active.startedAt),
      clientEmail: String(active.clientEmail || ''),
      cancelled: false
    };
    try {
      const data = await pollResult(active.baseUrl, active.token, state);
      if (data?.ok) {
        clearActive(active.token);
        applyRecoveredResult(data, active.baseUrl);
      }
    } catch {
      // On conserve le jeton jusqu'à expiration pour une prochaine ouverture.
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const body = init?.body;

    if (!url.includes('/api/dub-video') || !(body instanceof FormData)) {
      return previousFetch(input, init);
    }

    const token = makeToken();
    body.set('recoveryToken', token);

    let baseUrl = '';
    try {
      baseUrl = new URL(url, location.href).origin;
    } catch {
      baseUrl = 'https://viralvoice.onrender.com';
    }

    saveActive(baseUrl, token);
    const active = readActive();
    const state = {
      startedAt: Number(active?.startedAt || Date.now()),
      clientEmail: String(active?.clientEmail || readClientEmail()),
      cancelled: false
    };

    const originalRequest = previousFetch(input, init).then(
      response => ({ kind: 'original', response }),
      error => ({ kind: 'original-error', error })
    );

    const recoveryRequest = (async () => {
      await sleep(POLL_START_DELAY_MS);
      const data = await pollResult(baseUrl, token, state);
      if (!data) return { kind: 'cancelled' };
      return { kind: 'recovered', data };
    })().catch(error => ({ kind: 'recovery-error', error }));

    const first = await Promise.race([originalRequest, recoveryRequest]);

    if (first.kind === 'original') {
      state.cancelled = true;
      clearActive(token);
      return first.response;
    }

    if (first.kind === 'recovered') {
      state.cancelled = true;
      clearActive(token);
      setRecoveryStatus('Résultat récupéré. Affichage de la vidéo…');
      return responseFromRecovered(first.data);
    }

    if (first.kind === 'original-error') {
      const recovered = await recoveryRequest;
      if (recovered.kind === 'recovered') {
        state.cancelled = true;
        clearActive(token);
        return responseFromRecovered(recovered.data);
      }
      throw first.error;
    }

    const original = await originalRequest;
    if (original.kind === 'original') {
      state.cancelled = true;
      clearActive(token);
      return original.response;
    }
    throw original.error || first.error || new Error('Erreur de récupération du doublage.');
  };

  setTimeout(resumePendingResult, 1200);
  window.addEventListener('pageshow', () => setTimeout(resumePendingResult, 500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(resumePendingResult, 500);
    }
  });
})();
