(() => {
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';

  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const ADMIN_FREE_MODE_KEY = 'viralvoice-admin-free-mode';
  const ADMIN_COST_LOG_KEY = 'viralvoice-admin-api-cost-log-v1';
  const MAX_COST_LOGS = 50;

  const clientEmail = document.getElementById('clientEmail');
  const adminPanel = document.getElementById('adminPanel');
  const adminClientEmail = document.getElementById('adminClientEmail');
  const walletStatus = document.getElementById('walletStatus');
  const walletBadge = document.getElementById('walletBadge');
  const adminSecretInput = document.getElementById('adminSecretInput');
  const adminFreeMode = document.getElementById('adminFreeMode');
  const dubBtn = document.getElementById('dubBtn');

  function cleanEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function cleanSecret(value) {
    return String(value || '').trim();
  }

  function showMessage(message, type = 'success') {
    if (!walletStatus) return;

    walletStatus.textContent = message;
    walletStatus.className = 'notice';
    walletStatus.classList.add(type);
    walletStatus.classList.remove('hidden');
  }

  function isAdminEmail() {
    return cleanEmail(clientEmail?.value) === ADMIN_EMAIL;
  }

  function restoreAdminSecretInput() {
    if (!adminSecretInput) return;

    const savedSecret = cleanSecret(localStorage.getItem(ADMIN_SECRET_KEY));

    if (savedSecret && !adminSecretInput.value) {
      adminSecretInput.value = savedSecret;
    }
  }

  function restoreAdminFreeMode() {
    if (!adminFreeMode) return;

    const isFreeMode = localStorage.getItem(ADMIN_FREE_MODE_KEY) === 'true';
    adminFreeMode.checked = isFreeMode;

    document.body.classList.toggle('admin-free-active', isFreeMode);

    if (dubBtn) {
      dubBtn.textContent = isFreeMode
        ? '⚡ Créer gratuitement en admin'
        : '⚡ Créer mon doublage';
    }
  }

  function saveCurrentAdminSecret() {
    if (!adminSecretInput) return '';

    const secret = cleanSecret(adminSecretInput.value);

    if (secret) {
      localStorage.setItem(ADMIN_SECRET_KEY, secret);
    }

    return secret;
  }

  function openAdminPanel() {
    if (!adminPanel || !isAdminEmail()) return;

    adminPanel.classList.remove('hidden');
    document.body.classList.add('admin-email-active');

    if (adminClientEmail && !adminClientEmail.value) {
      adminClientEmail.value = ADMIN_EMAIL;
    }

    restoreAdminSecretInput();
    restoreAdminFreeMode();
    renderAdminCostLogs();

    showMessage('Admin détecté. Mode admin visible.', 'success');
  }

  function closeAdminPanel(options = {}) {
    const { clearSecret = false } = options;

    if (adminPanel) {
      adminPanel.classList.add('hidden');
    }

    document.body.classList.remove('admin-email-active');
    document.body.classList.remove('admin-free-active');

    if (adminFreeMode) {
      adminFreeMode.checked = false;
    }

    if (dubBtn) {
      dubBtn.textContent = '⚡ Créer mon doublage';
    }

    localStorage.removeItem(ADMIN_FREE_MODE_KEY);

    if (clearSecret) {
      localStorage.removeItem(ADMIN_SECRET_KEY);

      if (adminSecretInput) {
        adminSecretInput.value = '';
      }
    }
  }

  function logoutUser() {
    if (clientEmail) {
      clientEmail.value = '';
    }

    localStorage.removeItem(CLIENT_EMAIL_KEY);

    if (walletBadge) {
      walletBadge.textContent = '0 min';
      walletBadge.classList.remove('ok-badge');
      walletBadge.classList.add('muted-badge');
    }

    closeAdminPanel({ clearSecret: false });
    showMessage('Utilisateur déconnecté.', 'warning');
  }

  function logoutAdmin() {
    closeAdminPanel({ clearSecret: false });
    showMessage('Admin déconnecté. Mot de passe admin conservé sur ce téléphone.', 'warning');
  }

  function addLogoutButtons() {
    const accountCard = document.querySelector('.account-card');
    const accountActions = accountCard?.querySelector('.actions.two');

    if (accountActions && !document.getElementById('logoutUserBtn')) {
      const userButton = document.createElement('button');
      userButton.id = 'logoutUserBtn';
      userButton.type = 'button';
      userButton.className = 'secondary full';
      userButton.textContent = 'Déconnexion utilisateur';
      userButton.addEventListener('click', logoutUser);

      accountActions.insertAdjacentElement('afterend', userButton);
    }

    if (adminPanel && !document.getElementById('logoutAdminBtn')) {
      const adminButton = document.createElement('button');
      adminButton.id = 'logoutAdminBtn';
      adminButton.type = 'button';
      adminButton.className = 'secondary full';
      adminButton.textContent = 'Déconnexion admin';
      adminButton.addEventListener('click', logoutAdmin);

      const firstHint = adminPanel.querySelector('.hint');

      if (firstHint) {
        firstHint.insertAdjacentElement('afterend', adminButton);
      } else {
        adminPanel.prepend(adminButton);
      }
    }
  }

  function applyMinuteLabels() {
    const pricesTitle = document.querySelector('.prices h2');
    const pricesHint = document.querySelector('.prices .hint');
    const accountHint = document.querySelector('.account-card .hint');
    const checkWalletBtn = document.getElementById('checkWalletBtn');
    const adminTokensLabel = document.querySelector('label[for="adminTokens"]');
    const adminAddTokensBtn = document.getElementById('adminAddTokensBtn');
    const adminFreeSmall = document.querySelector('label[for="adminFreeMode"] small');

    if (pricesTitle) pricesTitle.textContent = 'Acheter des minutes';
    if (pricesHint) pricesHint.textContent = 'Tes minutes sont consommées selon la durée du fichier.';
    if (accountHint) accountHint.textContent = 'Utilise le même email après paiement pour retrouver tes minutes.';
    if (checkWalletBtn) checkWalletBtn.textContent = 'Vérifier mes minutes';
    if (adminTokensLabel) adminTokensLabel.textContent = 'Nombre de minutes';
    if (adminAddTokensBtn) adminAddTokensBtn.textContent = 'Ajouter les minutes';
    if (adminFreeSmall) {
      adminFreeSmall.textContent = 'Quand ce mode est actif, tes doublages sont illimités et ne consomment aucune minute.';
    }

    const subtitles = Array.from(document.querySelectorAll('.admin-subtitle'));
    const addTitle = subtitles.find(item => item.textContent.toLowerCase().includes('ajouter'));
    if (addTitle) addTitle.textContent = 'Ajouter des minutes à un client';

    const plans = {
      decouverte: { price: '1,99 €', minutes: '5 minutes' },
      createur: { price: '6,99 €', minutes: '30 minutes' },
      viral: { price: '11,99 €', minutes: '60 minutes' },
      pro: { price: '29,99 €', minutes: '180 minutes' }
    };

    document.querySelectorAll('.buy-btn').forEach(button => {
      const plan = plans[button.dataset.plan];
      const planCard = button.closest('.plan');
      if (!plan || !planCard) return;

      const priceText = planCard.querySelector('strong');
      const minuteText = planCard.querySelector('p');
      if (priceText) priceText.textContent = plan.price;
      if (minuteText) minuteText.textContent = plan.minutes;
    });

    if (walletBadge && walletBadge.textContent.toLowerCase().includes('crédit')) {
      walletBadge.textContent = '0 min';
    }
  }

  function handleClientEmailInput() {
    if (!clientEmail) return;

    const email = cleanEmail(clientEmail.value);
    localStorage.setItem(CLIENT_EMAIL_KEY, email);

    if (email === ADMIN_EMAIL) openAdminPanel();
  }

  function bindAdminSecretProtection() {
    if (adminSecretInput) {
      adminSecretInput.addEventListener('input', () => saveCurrentAdminSecret());
    }

    if (adminFreeMode) {
      adminFreeMode.addEventListener('change', () => {
        const isFreeMode = adminFreeMode.checked;
        localStorage.setItem(ADMIN_FREE_MODE_KEY, isFreeMode ? 'true' : 'false');
        if (isFreeMode) saveCurrentAdminSecret();
        restoreAdminFreeMode();
      });
    }

    if (dubBtn) {
      dubBtn.addEventListener('click', () => {
        const isFreeMode = localStorage.getItem(ADMIN_FREE_MODE_KEY) === 'true';
        if (isFreeMode) {
          const secret = saveCurrentAdminSecret();
          if (!secret) restoreAdminSecretInput();
        }
      }, true);
    }
  }

  function addAdminCostPanel() {
    if (!adminPanel || document.getElementById('adminCostPanel')) return;

    const section = document.createElement('div');
    section.id = 'adminCostPanel';
    section.innerHTML = `
      <h3 class="admin-subtitle">Coût API OpenAI</h3>
      <div class="admin-cost-summary">
        <div><small>Dernière génération</small><strong id="adminLastCost">—</strong></div>
        <div><small>Moyenne / min</small><strong id="adminAverageCost">—</strong></div>
        <div><small>Cumul journal</small><strong id="adminTotalCost">—</strong></div>
      </div>
      <p class="hint">Estimation privée basée sur le moteur réellement utilisé. La facture OpenAI finale peut varier légèrement.</p>
      <div id="adminCostLogs" class="admin-cost-logs"><p class="hint">Aucune génération mesurée.</p></div>
      <button id="clearAdminCostLogs" class="secondary full" type="button">Vider le journal de coûts</button>
    `;

    const backendTitle = Array.from(adminPanel.querySelectorAll('.admin-subtitle'))
      .find(item => item.textContent.toLowerCase().includes('backend'));

    if (backendTitle) backendTitle.insertAdjacentElement('beforebegin', section);
    else adminPanel.appendChild(section);

    const style = document.createElement('style');
    style.id = 'viralvoice-admin-cost-style';
    style.textContent = `
      .admin-cost-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
      .admin-cost-summary>div{padding:12px;border-radius:14px;background:rgba(53,220,255,.06);border:1px solid rgba(80,190,255,.18)}
      .admin-cost-summary small{display:block;color:#9aa8c8;font-size:.68rem;margin-bottom:5px}
      .admin-cost-summary strong{font-size:1.05rem;color:#e9fbff}
      .admin-cost-logs{display:grid;gap:8px;margin:10px 0 12px}
      .admin-cost-row{padding:11px 12px;border-radius:13px;background:#0b1022;border:1px solid rgba(129,158,230,.16)}
      .admin-cost-row-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .admin-cost-row strong{color:#fff}.admin-cost-row .cost{color:#66e3ff;font-size:1.02rem}
      .admin-cost-row small{display:block;color:#929fbd;margin-top:4px;line-height:1.35}
      @media(max-width:560px){.admin-cost-summary{grid-template-columns:1fr 1fr}.admin-cost-summary>div:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);

    document.getElementById('clearAdminCostLogs')?.addEventListener('click', () => {
      localStorage.removeItem(ADMIN_COST_LOG_KEY);
      renderAdminCostLogs();
    });
  }

  function estimateGenerationCost(data) {
    const durationSeconds = Math.max(1, Number(data?.durationSeconds || 60));
    const durationMinutes = durationSeconds / 60;
    const route = String(data?.autoEngine || data?.voiceStyle || 'unknown');
    const speakers = Math.max(1, Number(data?.speakersDetected || 1));
    const segments = Math.max(1, Number(data?.synchronizedSegments || 1));
    const realtime = route.startsWith('realtime-');
    const breakdown = [];
    let totalUsd = 0;

    // Diarisation initiale : estimation conservatrice, car l'API facture aux tokens audio.
    const diarization = durationMinutes * 0.006;
    totalUsd += diarization;
    breakdown.push({ label: 'Diarisation', usd: diarization });

    if (realtime) {
      // Le moteur ajoute environ 0,8 s de silence de fin par segment pour clôturer la phrase.
      const realtimeSeconds = durationSeconds + Math.min(segments * 0.8, durationSeconds * 0.35);
      const realtimeMinutes = realtimeSeconds / 60;
      const translate = realtimeMinutes * 0.034;
      const whisper = realtimeMinutes * 0.017;
      totalUsd += translate + whisper;
      breakdown.push({ label: 'Realtime Translate', usd: translate });
      breakdown.push({ label: 'Realtime Whisper', usd: whisper });
    } else {
      // Chemin premium segmenté : estimation à partir du tarif audio gpt-audio-1.5.
      const luna = durationMinutes * 0.003;
      const profiles = Math.min(speakers, 4) * 0.0015;
      const premiumAudio = durationMinutes * 0.088;
      const segmentOverhead = Math.min(0.012, segments * 0.00025);
      totalUsd += luna + profiles + premiumAudio + segmentOverhead;
      breakdown.push({ label: 'GPT-5.6 Luna', usd: luna });
      breakdown.push({ label: 'Profils vocaux', usd: profiles });
      breakdown.push({ label: 'gpt-audio-1.5', usd: premiumAudio });
      breakdown.push({ label: 'Segments', usd: segmentOverhead });
    }

    const perMinuteUsd = totalUsd / durationMinutes;
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      durationSeconds,
      route,
      speakers,
      segments,
      estimatedUsd: roundCost(totalUsd),
      estimatedCents: roundDisplay(totalUsd * 100),
      perMinuteUsd: roundCost(perMinuteUsd),
      perMinuteCents: roundDisplay(perMinuteUsd * 100),
      adminFreeMode: Boolean(data?.adminFreeMode),
      breakdown
    };
  }

  function getAdminCostLogs() {
    try {
      const logs = JSON.parse(localStorage.getItem(ADMIN_COST_LOG_KEY) || '[]');
      return Array.isArray(logs) ? logs : [];
    } catch {
      return [];
    }
  }

  function saveAdminCostLog(log) {
    const logs = getAdminCostLogs();
    logs.unshift(log);
    localStorage.setItem(ADMIN_COST_LOG_KEY, JSON.stringify(logs.slice(0, MAX_COST_LOGS)));
    renderAdminCostLogs();
  }

  function renderAdminCostLogs() {
    const list = document.getElementById('adminCostLogs');
    if (!list) return;

    const logs = getAdminCostLogs();
    const last = logs[0];
    const totalUsd = logs.reduce((sum, item) => sum + Number(item.estimatedUsd || 0), 0);
    const totalMinutes = logs.reduce((sum, item) => sum + Number(item.durationSeconds || 0) / 60, 0);
    const averagePerMinute = totalMinutes > 0 ? totalUsd / totalMinutes : 0;

    const lastNode = document.getElementById('adminLastCost');
    const averageNode = document.getElementById('adminAverageCost');
    const totalNode = document.getElementById('adminTotalCost');
    if (lastNode) lastNode.textContent = last ? `${Number(last.estimatedCents).toFixed(1)} ¢` : '—';
    if (averageNode) averageNode.textContent = logs.length ? `${(averagePerMinute * 100).toFixed(1)} ¢` : '—';
    if (totalNode) totalNode.textContent = logs.length ? `${(totalUsd * 100).toFixed(1)} ¢` : '—';

    if (!logs.length) {
      list.innerHTML = '<p class="hint">Aucune génération mesurée sur ce téléphone.</p>';
      return;
    }

    list.innerHTML = logs.slice(0, 12).map(item => {
      const date = new Date(item.createdAt).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      const duration = formatDuration(item.durationSeconds);
      const routeLabel = item.route.startsWith('realtime-')
        ? 'Realtime OpenAI'
        : 'Premium segmenté';
      return `
        <div class="admin-cost-row">
          <div class="admin-cost-row-top">
            <strong>${escapeCostHtml(duration)} · ${escapeCostHtml(routeLabel)}</strong>
            <strong class="cost">≈ ${Number(item.estimatedCents).toFixed(1)} ¢</strong>
          </div>
          <small>${escapeCostHtml(date)} · ${Number(item.perMinuteCents).toFixed(1)} ¢/min · ${Number(item.speakers || 1)} voix · ${Number(item.segments || 1)} segments</small>
        </div>`;
    }).join('');
  }

  function installCostFetchLogger() {
    if (window.__VIRALVOICE_COST_FETCH_INSTALLED) return;
    window.__VIRALVOICE_COST_FETCH_INSTALLED = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const requestUrl = typeof args[0] === 'string' ? args[0] : String(args[0]?.url || '');
        if (response.ok && requestUrl.includes('/api/dub-video')) {
          response.clone().json().then(data => {
            if (!data?.ok) return;
            if (!isAdminEmail() && localStorage.getItem(ADMIN_FREE_MODE_KEY) !== 'true') return;
            saveAdminCostLog(estimateGenerationCost(data));
          }).catch(() => {});
        }
      } catch {
        // Le journal ne doit jamais bloquer une génération.
      }
      return response;
    };
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds || 0)));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes} min ${String(rest).padStart(2, '0')} s`;
  }

  function escapeCostHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function roundCost(value) {
    return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
  }

  function roundDisplay(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function init() {
    addLogoutButtons();
    applyMinuteLabels();
    bindAdminSecretProtection();
    restoreAdminSecretInput();
    restoreAdminFreeMode();
    addAdminCostPanel();
    installCostFetchLogger();
    renderAdminCostLogs();

    if (clientEmail) {
      clientEmail.addEventListener('input', handleClientEmailInput);
      handleClientEmailInput();
    }
  }

  init();
})();