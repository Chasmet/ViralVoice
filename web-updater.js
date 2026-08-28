(() => {
  'use strict';

  const MANIFEST_URL = 'https://chasmet.github.io/ViralVoice/update.json';
  const ua = String(navigator.userAgent || '');
  const installedMatch = ua.match(/ViralVoiceAndroid\/(\d+\.\d+\.\d+)/i);
  const installedVersion = installedMatch ? installedMatch[1] : '';

  function compareVersions(a, b) {
    const aa = String(a || '').split('.').map(Number);
    const bb = String(b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
      const left = aa[i] || 0;
      const right = bb[i] || 0;
      if (left > right) return 1;
      if (left < right) return -1;
    }
    return 0;
  }

  async function fetchManifest() {
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`update manifest ${response.status}`);
    return response.json();
  }

  function launchUpdate(info) {
    try {
      if (window.ViralVoiceUpdater && typeof window.ViralVoiceUpdater.checkNow === 'function') {
        window.ViralVoiceUpdater.checkNow();
        return;
      }
    } catch {}

    if (info?.apkUrl) {
      window.location.href = info.apkUrl;
    }
  }

  function renderBanner(info) {
    if (document.getElementById('viralvoiceUpdateBanner')) return;
    const host = document.querySelector('.app') || document.body;
    const banner = document.createElement('section');
    banner.id = 'viralvoiceUpdateBanner';
    banner.style.cssText = [
      'position:sticky', 'top:0', 'z-index:9999', 'margin:10px 12px',
      'padding:14px', 'border-radius:18px', 'background:#10213a',
      'border:1px solid #34d8ff', 'box-shadow:0 8px 28px rgba(0,0,0,.35)',
      'color:white'
    ].join(';');
    banner.innerHTML = `
      <div style="font-weight:800;font-size:16px;margin-bottom:4px">Mise à jour ViralVoice ${escapeHtml(info.versionName)} disponible</div>
      <div style="font-size:13px;opacity:.85;margin-bottom:10px">Version installée : ${escapeHtml(installedVersion || 'ancienne')} · Tes données restent conservées.</div>
      <button id="viralvoiceUpdateNowBtn" type="button" style="width:100%;padding:12px;border:0;border-radius:14px;font-weight:800;background:linear-gradient(90deg,#34d8ff,#8a5cff);color:#07101e">Mettre à jour maintenant</button>
    `;
    host.prepend(banner);
    banner.querySelector('#viralvoiceUpdateNowBtn')?.addEventListener('click', () => launchUpdate(info));
  }

  function installAdminButton(info) {
    const admin = document.getElementById('adminPanel');
    if (!admin || document.getElementById('viralvoiceManualUpdateBtn')) return;
    const title = document.createElement('h3');
    title.className = 'admin-subtitle';
    title.textContent = 'Mises à jour';
    const button = document.createElement('button');
    button.id = 'viralvoiceManualUpdateBtn';
    button.className = 'secondary full';
    button.type = 'button';
    button.textContent = 'Vérifier les mises à jour maintenant';
    button.addEventListener('click', () => launchUpdate(info));
    admin.append(title, button);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function run() {
    if (!installedVersion) return;
    try {
      const info = await fetchManifest();
      installAdminButton(info);
      if (info?.versionName && compareVersions(info.versionName, installedVersion) > 0) {
        renderBanner(info);
      }
    } catch (error) {
      console.warn('ViralVoice web updater', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, 700), { once: true });
  } else {
    setTimeout(run, 700);
  }
})();
