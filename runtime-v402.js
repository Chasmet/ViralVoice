(() => {
  const OFFICIAL_BACKEND = 'https://viralvoice.onrender.com';
  const RUNTIME_VERSION = '4.0.2';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 18000) {
    if (typeof AbortController === 'undefined') {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Délai de connexion dépassé.')), timeoutMs))
      ]);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function forceOfficialBackend() {
    try {
      localStorage.setItem('viralvoice-backend-url', OFFICIAL_BACKEND);
    } catch {
      // Le stockage local peut être désactivé, l'URL officielle reste utilisée.
    }

    const field = document.getElementById('backendUrl');
    if (field) field.value = OFFICIAL_BACKEND;
  }

  forceOfficialBackend();

  try {
    getBackendUrl = function () {
      forceOfficialBackend();
      return OFFICIAL_BACKEND;
    };
  } catch {
    // L'ancien script peut ne pas encore avoir exposé la fonction.
  }

  try {
    pingBackend = async function () {
      const status = document.getElementById('statusText');
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (status) {
          status.textContent = attempt === 1
            ? 'Connexion au moteur ViralVoice...'
            : `Connexion au moteur ViralVoice — tentative ${attempt}/3...`;
        }

        try {
          const response = await fetchWithTimeout(
            `${OFFICIAL_BACKEND}/api/health?v=${encodeURIComponent(RUNTIME_VERSION)}&t=${Date.now()}`,
            { method: 'GET', cache: 'no-store' },
            18000
          );

          const text = await response.text();
          let data = {};
          try {
            data = JSON.parse(text);
          } catch {
            throw new Error('Réponse du serveur illisible.');
          }

          if (!response.ok || !data.ok) {
            throw new Error(data.error || `Serveur indisponible (${response.status}).`);
          }

          if (!data.openaiKey) {
            throw new Error('Clé OpenAI manquante sur le serveur.');
          }

          if (!data.supabase) {
            throw new Error('Base clients indisponible sur le serveur.');
          }

          if (status) status.textContent = 'Serveur connecté. Préparation du doublage...';

          // Le backend /api/dub-video vérifie et débite lui-même les minutes.
          // On évite donc le second appel /api/wallet avant chaque génération,
          // qui pouvait laisser l'interface bloquée alors que Render était déjà réveillé.
          return { ...data, supabase: false, serverSupabase: true, backendUrl: OFFICIAL_BACKEND };
        } catch (error) {
          lastError = error;
          if (attempt < 3) await sleep(1200);
        }
      }

      throw new Error(
        lastError?.name === 'AbortError'
          ? 'Le serveur met trop de temps à répondre. Réessaie dans quelques secondes.'
          : (lastError?.message || 'Connexion au serveur impossible.')
      );
    };
  } catch {
    // L'ancien script peut ne pas encore avoir exposé la fonction.
  }

  try {
    if (typeof PLANS !== 'undefined') {
      PLANS.decouverte.credits = 5;
      PLANS.createur.credits = 30;
      PLANS.viral.credits = 60;
      PLANS.pro.credits = 180;
    }
  } catch {
    // Correction commerciale non bloquante.
  }

  try {
    setWalletBadge = function (balance) {
      const value = Number(balance || 0);
      const badge = document.getElementById('walletBadge');
      if (!badge) return;
      badge.textContent = `${value} min`;
      badge.classList.toggle('ok-badge', value > 0);
      badge.classList.toggle('muted-badge', value <= 0);
    };
  } catch {
    // Correction d'affichage non bloquante.
  }

  const versionPill = document.querySelector('.version-pill');
  if (versionPill) versionPill.textContent = '4.0.2';

  const footerStrong = document.querySelector('.app-footer strong');
  if (footerStrong) footerStrong.textContent = 'ViralVoice Pro 4.0.2';

  window.VIRALVOICE_RUNTIME_VERSION = RUNTIME_VERSION;
  window.VIRALVOICE_OFFICIAL_BACKEND = OFFICIAL_BACKEND;
})();
