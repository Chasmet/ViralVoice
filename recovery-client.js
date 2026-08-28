(() => {
  'use strict';

  if (window.__VIRALVOICE_RESULT_RECOVERY_V409) return;
  window.__VIRALVOICE_RESULT_RECOVERY_V409 = true;

  const previousFetch = window.fetch.bind(window);
  const RECOVERY_DELAY_MS = 60000;
  const RECOVERY_MAX_MS = 120000;
  const POLL_MS = 2500;

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

  function setRecoveryStatus(text) {
    const status = document.getElementById('statusText');
    if (status) status.textContent = text;
  }

  async function recover(baseUrl, token) {
    const startedAt = Date.now();
    setRecoveryStatus('Le serveur a peut-être fini. Récupération du résultat…');

    while (Date.now() - startedAt < RECOVERY_MAX_MS) {
      try {
        const response = await previousFetch(
          `${baseUrl}/api/recover-result?token=${encodeURIComponent(token)}&t=${Date.now()}`,
          { method: 'GET', cache: 'no-store' }
        );

        if (response.status === 200) {
          const data = await response.clone().json().catch(() => null);
          if (data?.ok) {
            setRecoveryStatus('Résultat récupéré. Affichage de la vidéo…');
            return new Response(JSON.stringify(data), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-ViralVoice-Recovered': '1'
              }
            });
          }
        }
      } catch {
        // La récupération est volontairement tolérante aux coupures réseau.
      }
      await sleep(POLL_MS);
    }

    throw new Error('Le serveur a fini ou la connexion a été interrompue, mais le résultat n’a pas pu être récupéré automatiquement.');
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

    const originalRequest = previousFetch(input, init);
    const delayedRecovery = (async () => {
      await sleep(RECOVERY_DELAY_MS);
      return recover(baseUrl, token);
    })();

    try {
      return await Promise.race([originalRequest, delayedRecovery]);
    } catch (error) {
      // Une vraie erreur réseau après l'envoi ne doit pas forcer l'utilisateur
      // à refaire la génération : on tente d'abord de récupérer le résultat.
      return recover(baseUrl, token).catch(() => { throw error; });
    }
  };
})();
