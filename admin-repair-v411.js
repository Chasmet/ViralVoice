(() => {
  'use strict';

  if (window.__VIRALVOICE_ADMIN_REPAIR_CURRENT) return;
  window.__VIRALVOICE_ADMIN_REPAIR_CURRENT = true;

  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
  const DEFAULT_BACKEND = 'https://viralvoice.onrender.com';

  const clean = value => String(value || '').trim();
  const normalizeEmail = value => clean(value).toLowerCase();

  function savedSecret() {
    try { return clean(localStorage.getItem(ADMIN_SECRET_KEY)); } catch { return ''; }
  }

  function currentClientEmail() {
    const field = document.getElementById('clientEmail');
    return normalizeEmail(field?.value || localStorage.getItem(CLIENT_EMAIL_KEY) || '');
  }

  function backendUrl() {
    const field = document.getElementById('backendUrl');
    const value = clean(field?.value || localStorage.getItem('viralvoice-backend-url'));
    return value.startsWith('https://') ? value.replace(/\/+$/, '') : DEFAULT_BACKEND;
  }

  function installedVersion() {
    try {
      if (window.ViralVoiceUpdater && typeof window.ViralVoiceUpdater.currentVersion === 'function') {
        const value = clean(window.ViralVoiceUpdater.currentVersion());
        if (value) return value;
      }
    } catch {}
    const match = String(navigator.userAgent || '').match(/ViralVoiceAndroid\/(\d+\.\d+\.\d+)/i);
    return match ? match[1] : '';
  }

  function isAdminReady() {
    return Boolean(savedSecret()) || document.body.classList.contains('admin-email-active');
  }

  function removeLegacyDuplicate() {
    document.getElementById('adminQuick411')?.remove();
    document.getElementById('adminQuick411Style')?.remove();
  }

  function ensureBudgetScript() {
    if (document.getElementById('apiBudgetCounter')) return;
    if (document.getElementById('viralvoiceBudgetCurrent')) return;
    const script = document.createElement('script');
    script.id = 'viralvoiceBudgetCurrent';
    script.src = `admin-budget-counter.js?v=414&t=${Date.now()}`;
    script.async = false;
    script.onload = () => window.setTimeout(syncAdminUi, 80);
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
    if (target && !target.value && currentClientEmail()) target.value = currentClientEmail();

    document.getElementById('apiBudgetCounter')?.classList.add('visible');
  }

  function installMinutesControls() {
    if (!isAdminReady()) return;
    const budget = document.getElementById('apiBudgetCounter');
    if (!budget || document.getElementById('apiBudgetMinutesAdmin')) return;

    const version = installedVersion();
    const box = document.createElement('details');
    box.id = 'apiBudgetMinutesAdmin';
    box.className = 'api-budget-minutes-admin';
    box.open = false;
    box.innerHTML = `
      <summary>Ajouter des minutes client${version ? ` · ViralVoice ${escapeHtml(version)}` : ''}</summary>
      <div class="api-budget-minutes-grid">
        <label>Email à créditer
          <input id="apiBudgetMinutesEmail" type="email" autocomplete="email" value="${escapeHtml(currentClientEmail())}" />
        </label>
        <label>Minutes
          <input id="apiBudgetMinutesValue" type="number" min="1" step="1" value="5" inputmode="numeric" />
        </label>
      </div>
      <button id="apiBudgetMinutesAdd" type="button">Ajouter les minutes</button>
      <div id="apiBudgetMinutesStatus" class="notice hidden"></div>
    `;
    budget.appendChild(box);

    if (!document.getElementById('api-budget-minutes-admin-style')) {
      const style = document.createElement('style');
      style.id = 'api-budget-minutes-admin-style';
      style.textContent = `
        .api-budget-minutes-admin{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}
        .api-budget-minutes-admin summary{cursor:pointer;color:#c7d2ec;font-size:.78rem;font-weight:800}
        .api-budget-minutes-grid{display:grid;grid-template-columns:1.7fr .65fr;gap:9px;margin-top:11px}
        .api-budget-minutes-grid label{font-size:.7rem;color:#9faecc;min-width:0}
        .api-budget-minutes-grid input{box-sizing:border-box;width:100%;min-width:0;margin-top:5px;padding:11px;border-radius:12px;border:1px solid rgba(141,165,225,.22);background:#090f22;color:#fff;font-size:.9rem}
        #apiBudgetMinutesAdd{width:100%;margin-top:9px;padding:11px;border:0;border-radius:13px;background:linear-gradient(90deg,#36d7ff,#765dff,#ef4eb8);color:white;font-weight:900}
        #apiBudgetMinutesStatus{margin-top:9px}
        @media(max-width:560px){.api-budget-minutes-grid{grid-template-columns:1fr 92px}}
      `;
      document.head.appendChild(style);
    }

    document.getElementById('apiBudgetMinutesAdd')?.addEventListener('click', addMinutes);
  }

  async function addMinutes() {
    const button = document.getElementById('apiBudgetMinutesAdd');
    const status = document.getElementById('apiBudgetMinutesStatus');
    const targetEmail = normalizeEmail(document.getElementById('apiBudgetMinutesEmail')?.value);
    const minutes = Math.floor(Number(document.getElementById('apiBudgetMinutesValue')?.value || 0));
    const secret = savedSecret();

    const show = (text, type = '') => {
      if (!status) return;
      status.textContent = text;
      status.className = `notice ${type}`.trim();
      status.classList.remove('hidden');
    };

    if (!secret) return show('Mot de passe admin manquant.', 'error');
    if (!targetEmail) return show('Entre un email valide.', 'error');
    if (!Number.isInteger(minutes) || minutes <= 0) return show('Entre un nombre de minutes supérieur à 0.', 'error');

    try {
      if (button) button.disabled = true;
      show('Ajout des minutes…', 'loading');
      const response = await fetch(`${backendUrl()}/api/admin/add-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret
        },
        body: JSON.stringify({
          email: targetEmail,
          tokens: minutes,
          packName: 'Ajout admin intégré',
          amountEur: 0
        })
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

  function syncVersion() {
    const version = installedVersion();
    if (!version) return;
    document.querySelectorAll('.version-pill').forEach(node => { node.textContent = version; });
    const footer = document.querySelector('.app-footer strong');
    if (footer) footer.textContent = `ViralVoice Pro ${version}`;
  }

  function syncAdminUi() {
    removeLegacyDuplicate();
    syncVersion();
    if (!isAdminReady()) return;
    restoreAdminPanel();
    ensureBudgetScript();
    document.getElementById('apiBudgetCounter')?.classList.add('visible');
    installMinutesControls();
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[char]));
  }

  const start = () => {
    syncAdminUi();
    document.addEventListener('click', () => window.setTimeout(syncAdminUi, 60), true);
    document.getElementById('adminSecretInput')?.addEventListener('input', () => window.setTimeout(syncAdminUi, 60));

    const observer = new MutationObserver(() => syncAdminUi());
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
