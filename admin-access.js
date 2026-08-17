(() => {
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';
  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const ADMIN_FREE_MODE_KEY = 'viralvoice-admin-free-mode';
  const DEFAULT_BACKEND_URL = 'https://viralvoice.onrender.com';

  const clientEmail = document.getElementById('clientEmail');
  const adminPanel = document.getElementById('adminPanel');
  const adminClientEmail = document.getElementById('adminClientEmail');
  const walletStatus = document.getElementById('walletStatus');
  const walletBadge = document.getElementById('walletBadge');
  const adminSecretInput = document.getElementById('adminSecretInput');
  const adminFreeMode = document.getElementById('adminFreeMode');
  const dubBtn = document.getElementById('dubBtn');

  let costRows = [];
  let costSummary = null;

  function cleanEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function cleanSecret(value) {
    return String(value || '').trim();
  }

  function isAdminEmail() {
    return cleanEmail(clientEmail?.value) === ADMIN_EMAIL;
  }

  function showMessage(message, type = 'success') {
    if (!walletStatus) return;
    walletStatus.textContent = message;
    walletStatus.className = 'notice';
    walletStatus.classList.add(type);
    walletStatus.classList.remove('hidden');
  }

  function restoreAdminSecretInput() {
    if (!adminSecretInput) return;
    const savedSecret = cleanSecret(localStorage.getItem(ADMIN_SECRET_KEY));
    if (savedSecret && !adminSecretInput.value) adminSecretInput.value = savedSecret;
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
    if (secret) localStorage.setItem(ADMIN_SECRET_KEY, secret);
    return secret;
  }

  function currentBackend() {
    const field = document.getElementById('backendUrl');
    const value = String(field?.value || localStorage.getItem('viralvoice-backend-url') || '')
      .trim().replace(/\/+$/, '');
    return value.startsWith('https://') ? value : DEFAULT_BACKEND_URL;
  }

  function openAdminPanel() {
    if (!adminPanel || !isAdminEmail()) return;
    adminPanel.classList.remove('hidden');
    document.body.classList.add('admin-email-active');
    if (adminClientEmail && !adminClientEmail.value) adminClientEmail.value = ADMIN_EMAIL;
    restoreAdminSecretInput();
    restoreAdminFreeMode();
    loadAdminCostLogs();
    showMessage('Admin détecté. Mode admin visible.', 'success');
  }

  function closeAdminPanel(options = {}) {
    const { clearSecret = false } = options;
    adminPanel?.classList.add('hidden');
    document.body.classList.remove('admin-email-active', 'admin-free-active');
    if (adminFreeMode) adminFreeMode.checked = false;
    if (dubBtn) dubBtn.textContent = '⚡ Créer mon doublage';
    localStorage.removeItem(ADMIN_FREE_MODE_KEY);
    if (clearSecret) {
      localStorage.removeItem(ADMIN_SECRET_KEY);
      if (adminSecretInput) adminSecretInput.value = '';
    }
  }

  function logoutUser() {
    if (clientEmail) clientEmail.value = '';
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
    const accountActions = document.querySelector('.account-card .actions.two');
    if (accountActions && !document.getElementById('logoutUserBtn')) {
      const button = document.createElement('button');
      button.id = 'logoutUserBtn';
      button.type = 'button';
      button.className = 'secondary full';
      button.textContent = 'Déconnexion utilisateur';
      button.addEventListener('click', logoutUser);
      accountActions.insertAdjacentElement('afterend', button);
    }

    if (adminPanel && !document.getElementById('logoutAdminBtn')) {
      const button = document.createElement('button');
      button.id = 'logoutAdminBtn';
      button.type = 'button';
      button.className = 'secondary full';
      button.textContent = 'Déconnexion admin';
      button.addEventListener('click', logoutAdmin);
      const firstHint = adminPanel.querySelector('.hint');
      if (firstHint) firstHint.insertAdjacentElement('afterend', button);
      else adminPanel.prepend(button);
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

    const addTitle = Array.from(document.querySelectorAll('.admin-subtitle'))
      .find(item => item.textContent.toLowerCase().includes('ajouter'));
    if (addTitle) addTitle.textContent = 'Ajouter des minutes à un client';

    const plans = {
      decouverte: ['1,99 €', '5 minutes'],
      createur: ['6,99 €', '30 minutes'],
      viral: ['11,99 €', '60 minutes'],
      pro: ['29,99 €', '180 minutes']
    };
    document.querySelectorAll('.buy-btn').forEach(button => {
      const values = plans[button.dataset.plan];
      const card = button.closest('.plan');
      if (!values || !card) return;
      const price = card.querySelector('strong');
      const minutes = card.querySelector('p');
      if (price) price.textContent = values[0];
      if (minutes) minutes.textContent = values[1];
    });

    if (walletBadge && walletBadge.textContent.toLowerCase().includes('crédit')) {
      walletBadge.textContent = '0 min';
    }
  }

  function bindAdminSecretProtection() {
    adminSecretInput?.addEventListener('input', () => saveCurrentAdminSecret());
    adminFreeMode?.addEventListener('change', () => {
      const active = adminFreeMode.checked;
      localStorage.setItem(ADMIN_FREE_MODE_KEY, active ? 'true' : 'false');
      if (active) saveCurrentAdminSecret();
      restoreAdminFreeMode();
    });

    const saveButton = document.getElementById('saveAdminSecretBtn');
    saveButton?.addEventListener('click', () => {
      window.setTimeout(loadAdminCostLogs, 100);
    });
  }

  function addAdminCostPanel() {
    if (!adminPanel || document.getElementById('adminCostPanel')) return;

    const section = document.createElement('div');
    section.id = 'adminCostPanel';
    section.innerHTML = `
      <h3 class="admin-subtitle">Coût API OpenAI</h3>
      <div class="admin-cost-summary">
        <div><small>Dernière génération</small><strong id="adminLastCost">—</strong></div>
        <div><small>Moyenne / minute</small><strong id="adminAverageCost">—</strong></div>
        <div><small>Dépensé aujourd'hui</small><strong id="adminTodayCost">—</strong></div>
      </div>
      <div class="actions two admin-cost-actions">
        <button id="refreshAdminCostLogs" class="secondary" type="button">Actualiser les coûts</button>
        <span id="adminCostStatus" class="hint">Estimation API privée</span>
      </div>
      <p class="hint">Toutes les générations clients sont enregistrées ici. Les montants sont des estimations de coût API, pas la facture finale OpenAI.</p>
      <div id="adminCostLogs" class="admin-cost-logs"><p class="hint">Aucune génération mesurée.</p></div>
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
      .admin-cost-actions{align-items:center;margin:8px 0 12px}
      .admin-cost-logs{display:grid;gap:8px;margin:10px 0 12px}
      .admin-cost-row{padding:11px 12px;border-radius:13px;background:#0b1022;border:1px solid rgba(129,158,230,.16)}
      .admin-cost-row-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .admin-cost-row strong{color:#fff}.admin-cost-row .cost{color:#66e3ff;font-size:1.02rem}
      .admin-cost-row small{display:block;color:#929fbd;margin-top:4px;line-height:1.35}
      @media(max-width:560px){.admin-cost-summary{grid-template-columns:1fr 1fr}.admin-cost-summary>div:last-child{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
    document.getElementById('refreshAdminCostLogs')?.addEventListener('click', loadAdminCostLogs);
  }

  async function loadAdminCostLogs() {
    const list = document.getElementById('adminCostLogs');
    const status = document.getElementById('adminCostStatus');
    if (!list || !isAdminEmail()) return;

    const secret = cleanSecret(localStorage.getItem(ADMIN_SECRET_KEY) || adminSecretInput?.value);
    if (!secret) {
      if (status) status.textContent = 'Mot de passe admin requis';
      list.innerHTML = '<p class="hint">Sauvegarde ton mot de passe admin pour afficher les coûts.</p>';
      return;
    }

    if (status) status.textContent = 'Chargement…';
    try {
      const response = await fetch(`${currentBackend()}/api/admin/cost-log?limit=50&t=${Date.now()}`, {
        method: 'GET',
        headers: { 'x-admin-secret': secret },
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Journal indisponible.');
      costRows = Array.isArray(data.rows) ? data.rows : [];
      costSummary = data.summary || {};
      renderAdminCostLogs();
      if (status) status.textContent = `${costRows.length} génération(s) suivie(s)`;
    } catch (error) {
      if (status) status.textContent = 'Erreur journal';
      list.innerHTML = `<p class="hint">${escapeHtml(error.message || 'Impossible de charger les coûts.')}</p>`;
    }
  }

  function renderAdminCostLogs() {
    const list = document.getElementById('adminCostLogs');
    if (!list) return;

    const last = document.getElementById('adminLastCost');
    const average = document.getElementById('adminAverageCost');
    const today = document.getElementById('adminTodayCost');
    if (last) last.textContent = costSummary ? formatCents(costSummary.lastCostUsd) : '—';
    if (average) average.textContent = costSummary ? `${formatCents(costSummary.averageCostPerMinuteUsd)}/min` : '—';
    if (today) today.textContent = costSummary ? formatCents(costSummary.totalUsdToday) : '—';

    if (!costRows.length) {
      list.innerHTML = '<p class="hint">Aucune génération mesurée depuis l’activation du journal.</p>';
      return;
    }

    list.innerHTML = costRows.slice(0, 20).map(row => {
      const relation = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      const email = relation?.email || 'client';
      const route = String(row.model_route || row.voice_style || 'auto');
      const routeLabel = route.startsWith('realtime-') ? 'Realtime OpenAI' : 'Premium segmenté';
      const duration = formatDuration(row.duration_seconds);
      const date = new Date(row.created_at).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      return `
        <div class="admin-cost-row">
          <div class="admin-cost-row-top">
            <strong>${escapeHtml(duration)} · ${escapeHtml(routeLabel)}</strong>
            <strong class="cost">≈ ${formatCents(row.api_cost_estimate_usd)}</strong>
          </div>
          <small>${escapeHtml(email)} · ${escapeHtml(date)} · ${formatCents(row.api_cost_per_minute_usd)}/min</small>
        </div>`;
    }).join('');
  }

  function installCostRefreshHook() {
    if (window.__VIRALVOICE_ADMIN_COST_HOOK) return;
    window.__VIRALVOICE_ADMIN_COST_HOOK = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : String(args[0]?.url || '');
        if (response.ok && url.includes('/api/dub-video') && isAdminEmail()) {
          window.setTimeout(loadAdminCostLogs, 300);
        }
      } catch {
        // Le suivi de coût ne doit jamais bloquer ViralVoice.
      }
      return response;
    };
  }

  function handleClientEmailInput() {
    if (!clientEmail) return;
    const email = cleanEmail(clientEmail.value);
    localStorage.setItem(CLIENT_EMAIL_KEY, email);
    if (email === ADMIN_EMAIL) openAdminPanel();
  }

  function formatCents(usd) {
    return `${(Math.max(0, Number(usd || 0)) * 100).toFixed(1)} ¢`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds || 0)));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes} min ${String(rest).padStart(2, '0')} s`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function init() {
    addLogoutButtons();
    applyMinuteLabels();
    bindAdminSecretProtection();
    restoreAdminSecretInput();
    restoreAdminFreeMode();
    addAdminCostPanel();
    installCostRefreshHook();

    if (clientEmail) {
      clientEmail.addEventListener('input', handleClientEmailInput);
      handleClientEmailInput();
    }
  }

  init();
})();