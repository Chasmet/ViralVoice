(() => {
  'use strict';

  if (window.__VIRALVOICE_ADMIN_REPAIR_V411) return;
  window.__VIRALVOICE_ADMIN_REPAIR_V411 = true;

  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const BUDGET_KEY = 'viralvoice-admin-api-budget-v403';
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';
  const DEFAULT_BACKEND = 'https://viralvoice.onrender.com';

  const clean = value => String(value || '').trim();
  const email = value => clean(value).toLowerCase();

  function savedSecret() {
    try { return clean(localStorage.getItem(ADMIN_SECRET_KEY)); } catch { return ''; }
  }

  function currentClientEmail() {
    const field = document.getElementById('clientEmail');
    return email(field?.value || localStorage.getItem(CLIENT_EMAIL_KEY) || ADMIN_EMAIL);
  }

  function backendUrl() {
    const field = document.getElementById('backendUrl');
    const value = clean(field?.value || localStorage.getItem('viralvoice-backend-url'));
    return value.startsWith('https://') ? value.replace(/\/+$/, '') : DEFAULT_BACKEND;
  }

  function isAdminReady() {
    return Boolean(savedSecret()) || document.body.classList.contains('admin-email-active');
  }

  function ensureBudgetScript() {
    if (document.getElementById('apiBudgetCounter')) return;
    if (document.getElementById('viralvoiceBudget411')) return;
    const script = document.createElement('script');
    script.id = 'viralvoiceBudget411';
    script.src = `admin-budget-counter.js?v=411&t=${Date.now()}`;
    script.async = false;
    script.onload = () => window.setTimeout(syncAdminUi, 100);
    document.head.appendChild(script);
  }

  function restoreAdminPanel() {
    if (!isAdminReady()) return;
    document.body.classList.add('admin-email-active');

    const panel = document.getElementById('adminPanel');
    if (panel) panel.classList.remove('hidden');

    const secretField = document.getElementById('adminSecretInput');
    if (secretField && !secretField.value && savedSecret()) secretField.value = savedSecret();

    const target = document.getElementById('adminClientEmail');
    if (target && !target.value) target.value = currentClientEmail() || ADMIN_EMAIL;

    const budget = document.getElementById('apiBudgetCounter');
    if (budget) budget.classList.add('visible');
  }

  function budgetState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}');
      return {
        credit: Number(parsed.apiCreditUsd || 10),
        spent: Number(parsed.spentApiUsd || 0),
        videos: Number(parsed.videos || 0),
        minutes: Number(parsed.minutes || 0)
      };
    } catch {
      return { credit: 10, spent: 0, videos: 0, minutes: 0 };
    }
  }

  function money(value) {
    return `${Math.max(0, Number(value || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  }

  function installQuickAdminCard() {
    if (!isAdminReady() || document.getElementById('adminQuick411')) return;
    const app = document.querySelector('main.app');
    if (!app) return;

    const state = budgetState();
    const remaining = Math.max(0, state.credit - state.spent);
    const section = document.createElement('section');
    section.id = 'adminQuick411';
    section.className = 'card admin-quick-411';
    section.innerHTML = `
      <div class="aq-head">
        <div><p class="section-kicker">PRIVÉ ADMIN</p><h2>Minutes & budget API</h2></div>
        <span class="badge ok-badge">4.0.11</span>
      </div>
      <div class="aq-stats">
        <div><small>Reste API</small><strong id="aqRemaining">${money(remaining)}</strong></div>
        <div><small>Dépensé</small><strong id="aqSpent">${money(state.spent)}</strong></div>
        <div><small>Vidéos</small><strong id="aqVideos">${Math.round(state.videos)}</strong></div>
        <div><small>Minutes</small><strong id="aqMinutes">${Number(state.minutes).toFixed(1)}</strong></div>
      </div>
      <div class="aq-add">
        <label>Email à créditer<input id="aqEmail" type="email" value="${escapeHtml(currentClientEmail() || ADMIN_EMAIL)}" /></label>
        <label>Minutes<input id="aqMinutesInput" type="number" min="1" step="1" value="5" /></label>
        <button id="aqAddBtn" type="button" class="primary">Ajouter les minutes</button>
      </div>
      <div id="aqStatus" class="notice hidden"></div>
      <button id="aqOpenAdmin" type="button" class="secondary full">Ouvrir tous les réglages admin</button>
    `;

    const hero = app.querySelector('.hero');
    if (hero) app.insertBefore(section, hero);
    else app.prepend(section);

    const style = document.createElement('style');
    style.id = 'adminQuick411Style';
    style.textContent = `
      .admin-quick-411{margin:10px 0 18px;border:1px solid rgba(65,220,255,.3);background:linear-gradient(145deg,rgba(12,24,48,.98),rgba(8,13,29,.98))}
      .aq-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.aq-head h2{margin:2px 0 0}
      .aq-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.aq-stats>div{padding:11px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(125,155,225,.15)}
      .aq-stats small{display:block;color:#9aa8c8;font-size:.68rem}.aq-stats strong{display:block;margin-top:4px;color:#fff;font-size:1.02rem}
      .aq-add{display:grid;grid-template-columns:1.6fr .7fr 1fr;gap:8px;align-items:end;margin:10px 0}.aq-add label{font-size:.72rem;color:#9faecc}.aq-add input{width:100%;box-sizing:border-box;margin-top:5px}
      #aqAddBtn{min-height:48px}.admin-quick-411 .notice{margin:10px 0}
      @media(max-width:620px){.aq-stats{grid-template-columns:1fr 1fr}.aq-add{grid-template-columns:1fr 110px}.aq-add #aqAddBtn{grid-column:1/-1}}
    `;
    document.head.appendChild(style);

    document.getElementById('aqOpenAdmin')?.addEventListener('click', () => {
      restoreAdminPanel();
      document.getElementById('adminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('aqAddBtn')?.addEventListener('click', addMinutesQuick);
  }

  async function addMinutesQuick() {
    const button = document.getElementById('aqAddBtn');
    const status = document.getElementById('aqStatus');
    const targetEmail = email(document.getElementById('aqEmail')?.value);
    const minutes = Math.floor(Number(document.getElementById('aqMinutesInput')?.value || 0));
    const secret = savedSecret();

    const show = (text, type) => {
      if (!status) return;
      status.textContent = text;
      status.className = `notice ${type || ''}`.trim();
      status.classList.remove('hidden');
    };

    if (!secret) return show('Mot de passe admin manquant. Ouvre les réglages admin et sauvegarde-le.', 'error');
    if (!targetEmail) return show('Entre un email valide.', 'error');
    if (!Number.isInteger(minutes) || minutes <= 0) return show('Entre un nombre de minutes supérieur à 0.', 'error');

    try {
      if (button) button.disabled = true;
      show('Ajout des minutes…', 'loading');
      const response = await fetch(`${backendUrl()}/api/admin/add-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ email: targetEmail, tokens: minutes, packName: 'Ajout rapide admin', amountEur: 0 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || 'Impossible d’ajouter les minutes.');

      const balance = Number(data.wallet?.token_balance || 0);
      show(`${minutes} minute(s) ajoutée(s). Nouveau solde : ${balance} min.`, 'success');

      if (targetEmail === currentClientEmail()) {
        const badge = document.getElementById('walletBadge');
        if (badge) {
          badge.textContent = `${balance} min`;
          badge.classList.toggle('ok-badge', balance > 0);
          badge.classList.toggle('muted-badge', balance <= 0);
        }
      }

      const oldTarget = document.getElementById('adminClientEmail');
      const oldMinutes = document.getElementById('adminTokens');
      if (oldTarget) oldTarget.value = targetEmail;
      if (oldMinutes) oldMinutes.value = String(minutes);
    } catch (error) {
      show(error.message || 'Erreur ajout de minutes.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function syncBudgetVisibility() {
    if (!isAdminReady()) return;
    const budget = document.getElementById('apiBudgetCounter');
    if (budget) budget.classList.add('visible');
  }

  function syncVersion() {
    document.querySelectorAll('.version-pill').forEach(node => { node.textContent = '4.0.11'; });
    const footer = document.querySelector('.app-footer strong');
    if (footer) footer.textContent = 'ViralVoice Pro 4.0.11';
  }

  function syncAdminUi() {
    if (!isAdminReady()) return;
    restoreAdminPanel();
    ensureBudgetScript();
    syncBudgetVisibility();
    installQuickAdminCard();
    syncVersion();
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }

  const start = () => {
    syncVersion();
    syncAdminUi();
    document.addEventListener('click', () => window.setTimeout(syncAdminUi, 50), true);
    document.getElementById('adminSecretInput')?.addEventListener('input', () => window.setTimeout(syncAdminUi, 50));
    window.setInterval(syncAdminUi, 1200);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
