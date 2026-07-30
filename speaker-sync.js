(() => {
  const nativeFetch = window.fetch.bind(window);
  const VERSION = '20260730v310';
  let lastLipSyncHealth = null;

  injectLipSyncControls();

  window.fetch = async (input, init = {}) => {
    const url = String(input || '');
    const body = init && init.body;

    if (url.includes('/api/dub-video') && body instanceof FormData) {
      const firstSpeakerRole = document.getElementById('firstSpeakerRole');
      const maleVoice = document.getElementById('maleVoice');
      const femaleVoice = document.getElementById('femaleVoice');
      const lipSyncMode = document.getElementById('lipSyncMode');
      const lipSyncQuality = document.getElementById('lipSyncQuality');
      const lipSyncBboxShift = document.getElementById('lipSyncBboxShift');
      const lipSyncExtraMargin = document.getElementById('lipSyncExtraMargin');
      const lipSyncRequested = Boolean(lipSyncMode && lipSyncMode.checked);

      body.set('firstSpeakerRole', firstSpeakerRole ? firstSpeakerRole.value : 'male');
      body.set('maleVoice', maleVoice ? maleVoice.value : 'cedar');
      body.set('femaleVoice', femaleVoice ? femaleVoice.value : 'coral');
      body.set('lipSync', lipSyncRequested ? 'true' : 'false');
      body.set('lipSyncQuality', lipSyncQuality ? lipSyncQuality.value : 'balanced');
      body.set('lipSyncBboxShift', lipSyncBboxShift ? lipSyncBboxShift.value : '0');
      body.set('lipSyncExtraMargin', lipSyncExtraMargin ? lipSyncExtraMargin.value : '10');

      if (lipSyncRequested) {
        const health = await ensureLipSyncReady(url);
        if (!health.ready) {
          const detail = health.detail || 'Le moteur GPU MuseTalk n’est pas prêt.';
          return new Response(JSON.stringify({
            error: `Lip-sync indisponible : ${detail} Aucune minute n’a été débitée.`
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    const response = await nativeFetch(input, init);

    if (url.includes('/api/health')) {
      response.clone().json().then(updateLipSyncHealth).catch(() => {});
    }

    if (url.includes('/api/dub-video') && response.ok) {
      response.clone().json().then(updateResultLabel).catch(() => {});
    }

    return response;
  };

  async function ensureLipSyncReady(dubUrl) {
    try {
      const healthUrl = new URL('/api/health', dubUrl).toString();
      const response = await nativeFetch(`${healthUrl}?v=${VERSION}`, {
        method: 'GET',
        cache: 'no-store'
      });
      const data = await response.json();
      updateLipSyncHealth(data);
      return {
        ready: response.ok && data.lipSyncReady === true,
        detail: data.lipSyncDetail || (!data.lipSyncConfigured
          ? 'LIPSYNC_SERVICE_URL manque sur Render.'
          : 'Le service GPU ne répond pas.')
      };
    } catch (error) {
      return { ready: false, detail: error.message || 'Service GPU injoignable.' };
    }
  }

  function injectLipSyncControls() {
    if (document.getElementById('lipSyncMode')) return;
    const syncSection = document.getElementById('multiVoiceMode')?.closest('section');
    if (!syncSection) return;

    const section = document.createElement('section');
    section.className = 'card lip-sync-card';
    section.innerHTML = `
      <div class="section-title">
        <h2>5. Lip-sync vidéo</h2>
        <span id="lipSyncBadge" class="badge muted-badge">Vérification GPU</span>
      </div>
      <label class="switch-row" for="lipSyncMode">
        <input id="lipSyncMode" type="checkbox" checked />
        <span>
          <strong>Synchroniser réellement les lèvres</strong>
          <small>MuseTalk modifie la bouche image par image. Le mode est activé par défaut.</small>
        </span>
      </label>
      <div class="grid">
        <div>
          <label for="lipSyncQuality">Qualité</label>
          <select id="lipSyncQuality">
            <option value="fast">Rapide</option>
            <option value="balanced" selected>Équilibrée</option>
            <option value="quality">Qualité maximale</option>
          </select>
        </div>
        <div>
          <label for="lipSyncBboxShift">Position bouche</label>
          <input id="lipSyncBboxShift" type="number" min="-20" max="20" value="0" />
        </div>
        <div>
          <label for="lipSyncExtraMargin">Marge menton</label>
          <input id="lipSyncExtraMargin" type="number" min="0" max="40" value="10" />
        </div>
      </div>
      <p id="lipSyncHint" class="hint">Jusqu’à 5 minutes. Les longues vidéos sont traitées par blocs GPU de 45 secondes puis recollées.</p>
    `;
    syncSection.insertAdjacentElement('afterend', section);

    const mixTitle = [...document.querySelectorAll('section.card h2')]
      .find(node => node.textContent.trim().startsWith('5. Mixage'));
    if (mixTitle) mixTitle.textContent = '6. Mixage audio';
  }

  function updateLipSyncHealth(data) {
    lastLipSyncHealth = data;
    const badge = document.getElementById('lipSyncBadge');
    const hint = document.getElementById('lipSyncHint');
    if (!badge || !hint) return;

    badge.classList.remove('ok-badge');
    badge.classList.add('muted-badge');

    if (data.lipSyncReady) {
      badge.textContent = 'GPU prêt';
      badge.classList.add('ok-badge');
      badge.classList.remove('muted-badge');
      const limit = Number(data.lipSyncMaxDurationSeconds || 300);
      hint.textContent = `MuseTalk prêt${data.lipSyncGpu ? ` sur ${data.lipSyncGpu}` : ''} · limite ${Math.round(limit / 60)} min.`;
    } else if (data.lipSyncConfigured) {
      badge.textContent = 'GPU hors ligne';
      hint.textContent = data.lipSyncDetail || 'Le moteur est configuré mais ne répond pas.';
    } else {
      badge.textContent = 'GPU à configurer';
      hint.textContent = 'Ajoute LIPSYNC_SERVICE_URL dans Render. La génération lip-sync sera bloquée tant que le GPU n’est pas prêt.';
    }
  }

  function updateResultLabel(data) {
    const speakerInfo = document.getElementById('speakerInfo');
    if (!speakerInfo) return;
    if (data.lipSyncUsed) {
      speakerInfo.textContent = `Vrai lip-sync MuseTalk terminé · ${data.speakersDetected || 1} intervenant(s) · ${data.synchronizedSegments || 0} segment(s).`;
    } else if (data.lipSyncRequested) {
      speakerInfo.textContent = `Lip-sync non appliqué : ${data.lipSyncWarning || 'erreur inconnue'}`;
    }
  }

  window.VIRALVOICE_LIPSYNC_VERSION = VERSION;
  window.VIRALVOICE_LIPSYNC_HEALTH = () => lastLipSyncHealth;
})();
