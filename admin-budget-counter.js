(() => {
  'use strict';

  const STORAGE_KEY = 'viralvoice-admin-api-budget-v403';
  const HISTORY_KEY = 'viralvoice-admin-api-budget-history-v403';
  const DEFAULT_API_CREDIT = 10;
  const DEFAULT_PAID_AMOUNT = 12;
  const MAX_HISTORY = 100;
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';

  let state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        return normalizeState(saved);
      }
    } catch {
      // Repart sur les valeurs par défaut.
    }
    return normalizeState({
      apiCreditUsd: DEFAULT_API_CREDIT,
      paidAmountUsd: DEFAULT_PAID_AMOUNT,
      spentApiUsd: 0,
      videos: 0,
      minutes: 0,
      cycleStartedAt: new Date().toISOString()
    });
  }

  function normalizeState(value) {
    return {
      apiCreditUsd: positiveNumber(value.apiCreditUsd, DEFAULT_API_CREDIT),
      paidAmountUsd: positiveNumber(value.paidAmountUsd, DEFAULT_PAID_AMOUNT),
      spentApiUsd: Math.max(0, number(value.spentApiUsd)),
      videos: Math.max(0, Math.round(number(value.videos))),
      minutes: Math.max(0, number(value.minutes)),
      cycleStartedAt: value.cycleStartedAt || new Date().toISOString(),
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveHistory(item) {
    const history = loadHistory();
    history.unshift(item);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  }

  function isAdminVisible() {
    const emailField = document.getElementById('clientEmail');
    const email = String(emailField?.value || localStorage.getItem('viralvoice-client-email') || '')
      .trim().toLowerCase();
    return email === ADMIN_EMAIL || document.body.classList.contains('admin-email-active');
  }

  function installCard() {
    if (document.getElementById('apiBudgetCounter')) return;
    const app = document.querySelector('main.app');
    if (!app) return;

    const section = document.createElement('section');
    section.id = 'apiBudgetCounter';
    section.className = 'api-budget-counter';
    section.setAttribute('aria-label', 'Compteur privé du budget API OpenAI');
    section.innerHTML = `
      <div class="api-budget-head">
        <div>
          <span class="api-budget-kicker">PRIVÉ ADMIN · OPENAI</span>
          <h2>Suivi de mes <span id="apiBudgetTitleCredit">10,00 $</span></h2>
        </div>
        <span id="apiBudgetPaidBadge" class="api-budget-paid">Payé 12,00 $ TTC</span>
      </div>

      <div class="api-budget-grid">
        <div class="api-budget-metric primary-metric">
          <small>Reste API</small>
          <strong id="apiBudgetRemaining">10,00 $</strong>
        </div>
        <div class="api-budget-metric">
          <small>Dépensé API</small>
          <strong id="apiBudgetSpent">0,00 $</strong>
        </div>
        <div class="api-budget-metric">
          <small>Vidéos faites</small>
          <strong id="apiBudgetVideos">0</strong>
        </div>
        <div class="api-budget-metric">
          <small>Minutes</small>
          <strong id="apiBudgetMinutes">0,0</strong>
        </div>
      </div>

      <div class="api-budget-progress" aria-hidden="true"><span id="apiBudgetProgress"></span></div>
      <div id="apiBudgetDetail" class="api-budget-detail">Aucune génération comptabilisée.</div>
      <div id="apiBudgetLast" class="api-budget-last hidden"></div>

      <details class="api-budget-settings">
        <summary>Régler / recharger mon compteur</summary>
        <div class="api-budget-settings-grid">
          <label>Crédit ajouté chez OpenAI ($)
            <input id="apiBudgetCreditInput" type="number" min="0.01" step="0.01" value="10" inputmode="decimal" />
          </label>
          <label>Montant réellement débité TTC ($)
            <input id="apiBudgetPaidInput" type="number" min="0.01" step="0.01" value="12" inputmode="decimal" />
          </label>
        </div>
        <div class="api-budget-actions">
          <button id="apiBudgetNewCycle" type="button">Nouveau cycle</button>
          <button id="apiBudgetAddCredit" type="button">Ajouter cette recharge</button>
        </div>
        <small>« Nouveau cycle » remet vidéos, minutes et dépenses à zéro. « Ajouter » conserve l’historique et augmente le crédit disponible.</small>
      </details>
    `;

    const hero = app.querySelector('.hero');
    if (hero) app.insertBefore(section, hero);
    else app.prepend(section);

    installStyle();
    bindSettings();
    syncVisibility();
    render();
  }

  function installStyle() {
    if (document.getElementById('api-budget-counter-style')) return;
    const style = document.createElement('style');
    style.id = 'api-budget-counter-style';
    style.textContent = `
      .api-budget-counter{display:none;margin:12px 0 18px;padding:18px;border-radius:24px;background:linear-gradient(145deg,rgba(15,25,52,.98),rgba(8,13,30,.98));border:1px solid rgba(80,206,255,.28);box-shadow:0 16px 40px rgba(0,0,0,.28),0 0 28px rgba(54,214,255,.07);color:#f6fbff}
      .api-budget-counter.visible{display:block}
      .api-budget-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .api-budget-head h2{margin:3px 0 0;font-size:1.28rem;letter-spacing:-.02em}
      .api-budget-kicker{font-size:.68rem;font-weight:900;letter-spacing:.12em;color:#55ddff}
      .api-budget-paid{flex:none;padding:7px 10px;border-radius:999px;background:rgba(66,232,181,.12);border:1px solid rgba(66,232,181,.3);color:#8fffd8;font-size:.73rem;font-weight:800}
      .api-budget-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .api-budget-metric{min-width:0;padding:11px 10px;border-radius:16px;background:rgba(255,255,255,.035);border:1px solid rgba(144,167,229,.13)}
      .api-budget-metric.primary-metric{background:rgba(51,217,255,.07);border-color:rgba(51,217,255,.24)}
      .api-budget-metric small{display:block;color:#98a7c8;font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .api-budget-metric strong{display:block;margin-top:4px;font-size:1.04rem;color:#fff;white-space:nowrap}
      .api-budget-progress{height:8px;margin:13px 0 9px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.07)}
      .api-budget-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#42d9ff,#8a5cff,#ef4eb8);border-radius:inherit;transition:width .3s ease}
      .api-budget-detail{font-size:.76rem;line-height:1.45;color:#aeb9d4}
      .api-budget-last{margin-top:9px;padding:9px 11px;border-radius:13px;background:rgba(79,217,255,.06);border:1px solid rgba(79,217,255,.15);font-size:.77rem;color:#d8f8ff}
      .api-budget-last.hidden{display:none}
      .api-budget-settings{margin-top:12px;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}
      .api-budget-settings summary{cursor:pointer;color:#c7d2ec;font-size:.76rem;font-weight:700}
      .api-budget-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}
      .api-budget-settings label{font-size:.7rem;color:#9faecc}
      .api-budget-settings input{box-sizing:border-box;width:100%;margin-top:5px;padding:10px;border-radius:12px;border:1px solid rgba(141,165,225,.22);background:#090f22;color:#fff;font-size:.9rem}
      .api-budget-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}
      .api-budget-actions button{padding:10px;border-radius:12px;border:1px solid rgba(75,205,255,.26);background:rgba(75,205,255,.08);color:#e9fbff;font-weight:800}
      .api-budget-settings>small{display:block;color:#8795b4;font-size:.65rem;line-height:1.4}
      @media(max-width:560px){.api-budget-counter{margin-top:8px;padding:15px;border-radius:21px}.api-budget-head{align-items:center}.api-budget-head h2{font-size:1.12rem}.api-budget-paid{font-size:.65rem;padding:6px 8px}.api-budget-grid{grid-template-columns:1fr 1fr}.api-budget-metric{padding:10px}.api-budget-settings-grid,.api-budget-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function bindSettings() {
    const credit = document.getElementById('apiBudgetCreditInput');
    const paid = document.getElementById('apiBudgetPaidInput');
    if (credit) credit.value = state.apiCreditUsd.toFixed(2);
    if (paid) paid.value = state.paidAmountUsd.toFixed(2);

    document.getElementById('apiBudgetNewCycle')?.addEventListener('click', () => {
      const apiCreditUsd = positiveNumber(credit?.value, DEFAULT_API_CREDIT);
      const paidAmountUsd = positiveNumber(paid?.value, DEFAULT_PAID_AMOUNT);
      if (!window.confirm(`Repartir à zéro avec ${apiCreditUsd.toFixed(2)} $ de crédit API ?`)) return;
      state = normalizeState({
        apiCreditUsd,
        paidAmountUsd,
        spentApiUsd: 0,
        videos: 0,
        minutes: 0,
        cycleStartedAt: new Date().toISOString()
      });
      localStorage.removeItem(HISTORY_KEY);
      saveState();
      render();
    });

    document.getElementById('apiBudgetAddCredit')?.addEventListener('click', () => {
      const extraCredit = positiveNumber(credit?.value, 0);
      const extraPaid = positiveNumber(paid?.value, 0);
      if (extraCredit <= 0 || extraPaid <= 0) return;
      state.apiCreditUsd += extraCredit;
      state.paidAmountUsd += extraPaid;
      saveState();
      render();
      if (credit) credit.value = DEFAULT_API_CREDIT.toFixed(2);
      if (paid) paid.value = DEFAULT_PAID_AMOUNT.toFixed(2);
    });
  }

  function syncVisibility() {
    const card = document.getElementById('apiBudgetCounter');
    card?.classList.toggle('visible', isAdminVisible());
  }

  function render() {
    const remaining = Math.max(0, state.apiCreditUsd - state.spentApiUsd);
    const taxFactor = state.apiCreditUsd > 0 ? state.paidAmountUsd / state.apiCreditUsd : 1;
    const realSpent = state.spentApiUsd * taxFactor;
    const averageVideo = state.videos > 0 ? state.spentApiUsd / state.videos : 0;
    const averageMinute = state.minutes > 0 ? state.spentApiUsd / state.minutes : 0;
    const projectedVideos = averageVideo > 0 ? Math.floor(remaining / averageVideo) : null;
    const progress = state.apiCreditUsd > 0 ? Math.min(100, (state.spentApiUsd / state.apiCreditUsd) * 100) : 0;

    setText('apiBudgetTitleCredit', money(state.apiCreditUsd));
    setText('apiBudgetPaidBadge', `Payé ${money(state.paidAmountUsd)} TTC`);
    setText('apiBudgetRemaining', money(remaining));
    setText('apiBudgetSpent', money(state.spentApiUsd));
    setText('apiBudgetVideos', String(state.videos));
    setText('apiBudgetMinutes', state.minutes.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

    const bar = document.getElementById('apiBudgetProgress');
    if (bar) bar.style.width = `${progress.toFixed(1)}%`;

    const details = [];
    details.push(`Coût réel TTC estimé : ${money(realSpent)}`);
    if (state.videos > 0) details.push(`moy. ${money(averageVideo)}/vidéo`);
    if (state.minutes > 0) details.push(`${money(averageMinute)}/min`);
    if (projectedVideos !== null) details.push(`≈ ${projectedVideos} vidéo(s) restantes au rythme actuel`);
    setText('apiBudgetDetail', details.join(' · '));

    const last = loadHistory()[0];
    const lastNode = document.getElementById('apiBudgetLast');
    if (lastNode && last) {
      const lastTtc = last.estimatedApiUsd * taxFactor;
      lastNode.textContent = `Dernière vidéo : ${formatDuration(last.durationSeconds)} · ≈ ${cents(last.estimatedApiUsd)} API / ${cents(lastTtc)} TTC · ${last.routeLabel}`;
      lastNode.classList.remove('hidden');
    } else if (lastNode) {
      lastNode.classList.add('hidden');
    }
  }

  function installFetchCounter() {
    if (window.__VIRALVOICE_BUDGET_FETCH_HOOK_V403) return;
    window.__VIRALVOICE_BUDGET_FETCH_HOOK_V403 = true;
    const previousFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const response = await previousFetch(...args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : String(args[0]?.url || '');
        if (response.ok && url.includes('/api/dub-video')) {
          const clone = response.clone();
          clone.json().then(data => {
            if (data?.ok) recordSuccessfulGeneration(data);
          }).catch(() => {});
        }
      } catch {
        // Le compteur ne doit jamais bloquer le doublage.
      }
      return response;
    };
  }

  function recordSuccessfulGeneration(data) {
    const durationSeconds = Math.max(1, number(data.durationSeconds) || 60);
    const estimatedApiUsd = getBestCostEstimate(data, durationSeconds);
    const route = String(data.autoEngine || data.voiceStyle || 'auto');
    const routeLabel = route.startsWith('realtime-') ? 'Realtime OpenAI' : 'Premium segmenté';

    state.spentApiUsd += estimatedApiUsd;
    state.videos += 1;
    state.minutes += durationSeconds / 60;
    saveState();
    saveHistory({
      createdAt: new Date().toISOString(),
      durationSeconds,
      estimatedApiUsd,
      route,
      routeLabel,
      speakers: Math.max(1, number(data.speakersDetected) || 1),
      segments: Math.max(1, number(data.synchronizedSegments) || 1)
    });
    render();
  }

  function getBestCostEstimate(data, durationSeconds) {
    const directCandidates = [
      data?.apiCostEstimate?.estimatedUsd,
      data?.apiCost?.estimatedUsd,
      data?.apiCostEstimateUsd,
      data?.estimatedApiCostUsd
    ];
    for (const candidate of directCandidates) {
      const value = number(candidate);
      if (value > 0) return round6(value);
    }

    const minutes = durationSeconds / 60;
    const route = String(data?.autoEngine || data?.voiceStyle || 'auto');
    const speakers = Math.max(1, number(data?.speakersDetected) || 1);
    const segments = Math.max(1, number(data?.synchronizedSegments) || 1);
    let total = minutes * 0.006;

    if (route.startsWith('realtime-')) {
      const realtimeSeconds = durationSeconds + Math.min(segments * 0.8, durationSeconds * 0.35);
      total += (realtimeSeconds / 60) * (0.034 + 0.017);
    } else {
      total += minutes * 0.003;
      total += Math.min(speakers, 4) * 0.0015;
      total += minutes * 0.088;
      total += Math.min(0.012, segments * 0.00025);
    }
    return round6(total);
  }

  function watchAdminState() {
    const email = document.getElementById('clientEmail');
    email?.addEventListener('input', () => window.setTimeout(syncVisibility, 0));
    document.addEventListener('click', () => window.setTimeout(syncVisibility, 30));
    window.addEventListener('storage', () => {
      state = loadState();
      syncVisibility();
      render();
    });
    window.setInterval(syncVisibility, 1500);
  }

  function money(value) {
    return `${Math.max(0, number(value)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  }

  function cents(value) {
    return `${(Math.max(0, number(value)) * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ¢`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(number(seconds)));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes} min ${String(rest).padStart(2, '0')} s`;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function round6(value) {
    return Math.round(number(value) * 1_000_000) / 1_000_000;
  }

  function updateVisibleVersion() {
    document.querySelectorAll('.version-pill').forEach(node => { node.textContent = '4.0.3'; });
    const footer = document.querySelector('.app-footer strong');
    if (footer) footer.textContent = 'ViralVoice Pro 4.0.3';
  }

  function init() {
    installCard();
    installFetchCounter();
    watchAdminState();
    updateVisibleVersion();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
