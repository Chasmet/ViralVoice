(() => {
  'use strict';

  const ADMIN_EMAIL = 'skypieachannel@gmail.com';
  const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
  const BACKEND_URL = 'https://viralvoice.onrender.com';
  const RESTORED_KEY = 'viralvoice-stable-signature-migration-v404-restored';
  const LAST_BACKUP_KEY = 'viralvoice-stable-signature-migration-last-backup';
  const MIN_BACKUP_INTERVAL_MS = 20000;
  const SENSITIVE_KEYS = new Set([
    ADMIN_SECRET_KEY,
    RESTORED_KEY,
    LAST_BACKUP_KEY
  ]);

  let busy = false;

  function appRuntimeVersion() {
    try {
      const raw = new URLSearchParams(window.location.search).get('app') || '0';
      return Number(raw) || 0;
    } catch {
      return 0;
    }
  }

  function isAdmin() {
    const field = document.getElementById('clientEmail');
    const email = String(
      field?.value || localStorage.getItem('viralvoice-client-email') || ''
    ).trim().toLowerCase();
    return email === ADMIN_EMAIL || document.body.classList.contains('admin-email-active');
  }

  function adminSecret() {
    return String(localStorage.getItem(ADMIN_SECRET_KEY) || '').trim();
  }

  function collectStorage() {
    const storage = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith('viralvoice') || SENSITIVE_KEYS.has(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }
    return storage;
  }

  function applyStorage(storage) {
    if (!storage || typeof storage !== 'object' || Array.isArray(storage)) return 0;
    let restored = 0;
    Object.entries(storage).forEach(([key, value]) => {
      if (!String(key).startsWith('viralvoice') || SENSITIVE_KEYS.has(key)) return;
      if (typeof value !== 'string') return;
      localStorage.setItem(key, value);
      restored += 1;
    });
    return restored;
  }

  function showStatus(text, kind = 'ok') {
    let node = document.getElementById('viralvoiceMigrationStatus');
    if (!node) {
      node = document.createElement('div');
      node.id = 'viralvoiceMigrationStatus';
      node.style.cssText = [
        'display:none',
        'margin-top:9px',
        'padding:8px 10px',
        'border-radius:12px',
        'font-size:.72rem',
        'font-weight:700',
        'line-height:1.35'
      ].join(';');

      const counter = document.getElementById('apiBudgetCounter');
      const adminPanel = document.getElementById('adminPanel');
      if (counter) counter.appendChild(node);
      else if (adminPanel) adminPanel.prepend(node);
      else return;
    }

    node.textContent = text;
    node.style.display = isAdmin() ? 'block' : 'none';
    node.style.color = kind === 'error' ? '#ffd2d2' : '#bfffe6';
    node.style.background = kind === 'error'
      ? 'rgba(255,82,82,.08)'
      : 'rgba(56,230,174,.08)';
    node.style.border = kind === 'error'
      ? '1px solid rgba(255,82,82,.22)'
      : '1px solid rgba(56,230,174,.22)';
  }

  async function uploadCurrentDevice() {
    if (busy || !isAdmin()) return;
    const secret = adminSecret();
    if (!secret) return;

    const last = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
    if (Date.now() - last < MIN_BACKUP_INTERVAL_MS) return;

    busy = true;
    try {
      const storage = collectStorage();
      const response = await fetch(`${BACKEND_URL}/api/admin/device-backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret
        },
        body: JSON.stringify({
          payload: {
            schema: 1,
            sourceRuntime: appRuntimeVersion(),
            savedAt: new Date().toISOString(),
            storage
          }
        }),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Sauvegarde refusée.');
      }
      localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
      showStatus('Sauvegarde migration prête · compteur et réglages protégés.', 'ok');
    } catch (error) {
      showStatus('Sauvegarde migration en attente de connexion.', 'error');
    } finally {
      busy = false;
    }
  }

  async function restoreOnStableVersion() {
    if (busy || !isAdmin()) return;
    if (localStorage.getItem(RESTORED_KEY) === 'true') return;
    const secret = adminSecret();
    if (!secret) {
      showStatus('Après installation 4.0.4, saisis une fois ton mot de passe admin pour restaurer tes données.', 'ok');
      return;
    }

    busy = true;
    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/device-backup?t=${Date.now()}`, {
        method: 'GET',
        headers: { 'x-admin-secret': secret },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Restauration refusée.');
      }
      if (!data.exists || !data.payload?.storage) {
        showStatus('Aucune sauvegarde de migration trouvée.', 'error');
        return;
      }

      const restored = applyStorage(data.payload.storage);
      localStorage.setItem(RESTORED_KEY, 'true');
      showStatus(`${restored} réglage(s) restauré(s). Rechargement…`, 'ok');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      showStatus('Restauration en attente de connexion.', 'error');
    } finally {
      busy = false;
    }
  }

  function tick() {
    if (!isAdmin()) {
      const node = document.getElementById('viralvoiceMigrationStatus');
      if (node) node.style.display = 'none';
      return;
    }

    if (appRuntimeVersion() >= 404) {
      restoreOnStableVersion();
    } else {
      uploadCurrentDevice();
    }
  }

  window.setTimeout(tick, 700);
  window.setInterval(tick, 3000);
})();
