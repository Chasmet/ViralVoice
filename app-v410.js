(() => {
  'use strict';

  const VERSION_FALLBACK = '4.1.0';
  const BACKEND = 'https://viralvoice.onrender.com';
  const ADMIN_EMAIL = 'skypieachannel@gmail.com';
  const MAX_FILE_SIZE = 300 * 1024 * 1024;
  const RECOVERY_MAX_MS = 20 * 60 * 1000;
  const RECOVERY_POLL_MS = 2000;

  const KEY_EMAIL = 'viralvoice-client-email';
  const KEY_SECRET = 'viralvoice-admin-secret';
  const KEY_FREE = 'viralvoice-admin-free-mode';
  const KEY_AUTOSAVE = 'viralvoiceAutoSave400';
  const KEY_BUDGET = 'viralvoice-admin-api-budget-v403';
  const KEY_BUDGET_HISTORY = 'viralvoice-admin-api-budget-history-v403';
  const KEY_RECORDED = 'viralvoice-budget-recorded-v410';
  const KEY_ACTIVE = 'viralvoice-active-result-recovery';

  const PAYMENT_LINKS = {
    decouverte: 'https://checkout.revolut.com/pay/1f3ed21f-2b5a-428e-98ce-92195da91bc6',
    createur: 'https://checkout.revolut.com/pay/664e7390-9e23-4772-beae-4cbe18ad228a',
    viral: 'https://checkout.revolut.com/pay/9249340c-529d-4fd5-ae94-8f250a7db43c',
    pro: 'https://checkout.revolut.com/pay/4ff81a0e-d5b1-41e5-8ece-1b9890bb1ac3'
  };

  const PRESETS = {
    solo: { voice: 105, original: 0 },
    balanced: { voice: 105, original: 10 },
    original: { voice: 110, original: 25 },
    power: { voice: 125, original: 0 }
  };

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  let selectedFile = null;
  let sourceObjectUrl = '';
  let currentResult = null;
  let statusTimers = [];
  let logoTaps = 0;
  let logoTimer = null;
  let budget = loadBudget();

  function clean(value) {
    return String(value || '').trim();
  }

  function email(value) {
    return clean(value).toLowerCase();
  }

  function readStorage(key, fallback = '') {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  function removeStorage(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function installedVersion() {
    try {
      if (window.ViralVoiceUpdater && typeof window.ViralVoiceUpdater.currentVersion === 'function') {
        const value = clean(window.ViralVoiceUpdater.currentVersion());
        if (value) return value;
      }
    } catch {}
    const match = String(navigator.userAgent || '').match(/ViralVoiceAndroid\/(\d+\.\d+\.\d+)/i);
    return match ? match[1] : VERSION_FALLBACK;
  }

  function setText(id, value) {
    const node = $(id);
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }

  function money(value) {
    return `${Math.max(0, Number(value || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  }

  function cents(value) {
    return `${(Math.max(0, Number(value || 0)) * 100).toFixed(1)} ¢`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function updateVersionUi() {
    const version = installedVersion();
    $$('.version-pill').forEach(node => {
      if (node.textContent !== version) node.textContent = version;
    });
    setText('footerVersion', `ViralVoice Pro ${version}`);
    setText('adminVersionLabel', `ViralVoice ${version}`);
  }

  function showNotice(id, text, type = '') {
    const node = $(id);
    if (!node) return;
    node.textContent = text;
    node.className = `notice ${type}`.trim();
    node.classList.remove('hidden');
  }

  function hideNotice(id) {
    $(id)?.classList.add('hidden');
  }

  function setWallet(balance) {
    const value = Math.max(0, Number(balance || 0));
    const badge = $('walletBadge');
    if (!badge) return;
    badge.textContent = `${value} min`;
    badge.classList.toggle('ok-badge', value > 0);
    badge.classList.toggle('muted-badge', value <= 0);
  }

  async function fetchJson(url, options = {}, timeoutMs = 18000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Réponse serveur illisible.' }; }
      return { response, data };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function currentEmail() {
    return email($('clientEmail')?.value || readStorage(KEY_EMAIL));
  }

  function currentSecret() {
    return clean($('adminSecretInput')?.value || readStorage(KEY_SECRET));
  }

  function isAdmin() {
    return Boolean(currentSecret()) || currentEmail() === ADMIN_EMAIL;
  }

  function syncAdminVisibility() {
    const panel = $('adminPanel');
    const budgetCard = $('apiBudgetCounter');
    const active = isAdmin();
    panel?.classList.toggle('hidden', !active);
    budgetCard?.classList.toggle('hidden', !active);
    document.body.classList.toggle('admin-email-active', active);
    if (active && $('adminClientEmail') && !$('adminClientEmail').value) {
      $('adminClientEmail').value = currentEmail() || ADMIN_EMAIL;
    }
    renderBudget();
  }

  function selectFile(file) {
    if (!file) return;
    selectedFile = file;
    resetResult();
    revokeSourcePreview();

    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a)$/i.test(file.name);
    const typeLabel = isVideo ? 'Vidéo' : isAudio ? 'Audio' : 'Fichier';
    setText('fileInfo', `${typeLabel} : ${file.name} · ${sizeMb} Mo`);
    document.body.classList.add('has-file');
    hideNotice('userStatus');

    if (file.size > MAX_FILE_SIZE) {
      showNotice('userStatus', 'Fichier trop lourd. Limite technique : 300 Mo.', 'error');
      return;
    }

    try {
      sourceObjectUrl = URL.createObjectURL(file);
      if (isVideo) {
        const preview = $('sourcePreview');
        preview.src = sourceObjectUrl;
        preview.classList.remove('hidden');
        preview.load();
      } else if (isAudio) {
        const preview = $('sourceAudioPreview');
        preview.src = sourceObjectUrl;
        preview.classList.remove('hidden');
        preview.load();
      }
    } catch {}
  }

  function revokeSourcePreview() {
    if (sourceObjectUrl) {
      try { URL.revokeObjectURL(sourceObjectUrl); } catch {}
      sourceObjectUrl = '';
    }
    const video = $('sourcePreview');
    const audio = $('sourceAudioPreview');
    if (video) {
      try { video.pause(); } catch {}
      video.removeAttribute('src');
      video.classList.add('hidden');
    }
    if (audio) {
      try { audio.pause(); } catch {}
      audio.removeAttribute('src');
      audio.classList.add('hidden');
    }
  }

  function resetFile() {
    selectedFile = null;
    const input = $('mediaFile');
    if (input) input.value = '';
    revokeSourcePreview();
    setText('fileInfo', 'Aucun fichier sélectionné');
    document.body.classList.remove('has-file');
  }

  function openFilePicker() {
    const input = $('mediaFile');
    if (!input) return;
    input.value = '';
    input.click();
  }

  function applyPreset(name) {
    const preset = PRESETS[name] || PRESETS.balanced;
    const voice = $('voiceVolume');
    const original = $('originalVolume');
    if (voice) voice.value = String(preset.voice);
    if (original) original.value = String(preset.original);
    setText('voiceVolumeValue', `${preset.voice}%`);
    setText('originalVolumeValue', `${preset.original}%`);
    $$('.preset-card').forEach(card => {
      const radio = card.querySelector('input[name="audioPreset"]');
      card.classList.toggle('active', Boolean(radio?.checked));
    });
  }

  async function checkWallet({ quiet = false } = {}) {
    const account = currentEmail();
    if (!account) {
      if (!quiet) showNotice('walletStatus', 'Entre ton email pour retrouver tes minutes.', 'error');
      return null;
    }
    if (!quiet) showNotice('walletStatus', 'Vérification du solde…', 'loading');
    try {
      const { response, data } = await fetchJson(`${BACKEND}/api/wallet?email=${encodeURIComponent(account)}&t=${Date.now()}`, { cache: 'no-store' }, 12000);
      if (!response.ok || !data.ok) throw new Error(data.error || 'Impossible de lire le solde.');
      const balance = Number(data.wallet?.token_balance || 0);
      setWallet(balance);
      writeStorage(KEY_EMAIL, account);
      if (!quiet) showNotice('walletStatus', `Solde disponible : ${balance} min.`, balance > 0 ? 'success' : 'warning');
      return data.wallet;
    } catch (error) {
      if (!quiet) showNotice('walletStatus', error.message || 'Erreur de connexion.', 'error');
      return null;
    }
  }

  function openPayment(plan) {
    const account = currentEmail();
    if (!account) {
      showNotice('paymentStatus', 'Entre ton email avant le paiement.', 'error');
      $('clientEmail')?.focus();
      return;
    }
    const url = PAYMENT_LINKS[plan];
    if (!url) return;
    writeStorage(KEY_EMAIL, account);
    showNotice('paymentStatus', 'Paiement ouvert. Garde le même email pour retrouver tes minutes.', 'success');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function loadBudget() {
    try {
      const saved = JSON.parse(readStorage(KEY_BUDGET, 'null'));
      if (saved && typeof saved === 'object') {
        return {
          apiCreditUsd: Math.max(.01, Number(saved.apiCreditUsd || 10)),
          paidAmountUsd: Math.max(.01, Number(saved.paidAmountUsd || 12)),
          spentApiUsd: Math.max(0, Number(saved.spentApiUsd || 0)),
          videos: Math.max(0, Number(saved.videos || 0)),
          minutes: Math.max(0, Number(saved.minutes || 0))
        };
      }
    } catch {}
    return { apiCreditUsd: 10, paidAmountUsd: 12, spentApiUsd: 0, videos: 0, minutes: 0 };
  }

  function saveBudget() {
    writeStorage(KEY_BUDGET, JSON.stringify({ ...budget, updatedAt: new Date().toISOString() }));
  }

  function budgetHistory() {
    try {
      const value = JSON.parse(readStorage(KEY_BUDGET_HISTORY, '[]'));
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function recordedTokens() {
    try {
      const value = JSON.parse(readStorage(KEY_RECORDED, '[]'));
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function renderBudget() {
    if (!$('apiBudgetCounter')) return;
    const remaining = Math.max(0, budget.apiCreditUsd - budget.spentApiUsd);
    const factor = budget.apiCreditUsd > 0 ? budget.paidAmountUsd / budget.apiCreditUsd : 1;
    const ttc = budget.spentApiUsd * factor;
    const averageMinute = budget.minutes > 0 ? budget.spentApiUsd / budget.minutes : 0;
    const progress = budget.apiCreditUsd > 0 ? Math.min(100, budget.spentApiUsd / budget.apiCreditUsd * 100) : 0;
    setText('apiBudgetTitleCredit', money(budget.apiCreditUsd));
    setText('apiBudgetPaidBadge', `Payé ${money(budget.paidAmountUsd)} TTC`);
    setText('apiBudgetRemaining', money(remaining));
    setText('apiBudgetSpent', money(budget.spentApiUsd));
    setText('apiBudgetVideos', Math.round(budget.videos));
    setText('apiBudgetMinutes', Number(budget.minutes).toFixed(1));
    setText('apiBudgetDetail', `Coût réel TTC estimé : ${money(ttc)}${budget.minutes > 0 ? ` · ${money(averageMinute)}/min API` : ''}`);
    const bar = $('apiBudgetProgress');
    if (bar) bar.style.width = `${progress.toFixed(1)}%`;
  }

  function estimateCost(data, durationSeconds) {
    const direct = [
      data?.apiCostEstimateUsd,
      data?.api_cost_estimate_usd,
      data?.estimatedApiCostUsd,
      data?.costEstimateUsd
    ].map(Number).find(value => Number.isFinite(value) && value > 0);
    if (direct) return direct;
    return Math.max(1, durationSeconds) / 60 * 0.101;
  }

  function recordBudget(data, recordKey = '') {
    if (!isAdmin()) return;
    const key = clean(recordKey || data?.recoveryToken || data?.generationId || data?.dubbedVideoUrl || data?.dubbedAudioUrl);
    const done = recordedTokens();
    if (key && done.includes(key)) return;

    const durationSeconds = Math.max(1, Number(data?.durationSeconds || data?.duration_seconds || 60));
    const cost = estimateCost(data, durationSeconds);
    budget.spentApiUsd += cost;
    budget.videos += 1;
    budget.minutes += durationSeconds / 60;
    saveBudget();

    const history = budgetHistory();
    history.unshift({
      createdAt: new Date().toISOString(),
      durationSeconds,
      estimatedApiUsd: cost,
      route: data?.autoEngine || data?.modelRoute || data?.voiceStyle || 'auto'
    });
    writeStorage(KEY_BUDGET_HISTORY, JSON.stringify(history.slice(0, 100)));
    if (key) writeStorage(KEY_RECORDED, JSON.stringify([key, ...done].slice(0, 100)));
    renderBudget();
  }

  function configureBudgetButtons() {
    $('budgetNewCycleBtn')?.addEventListener('click', () => {
      const credit = Math.max(.01, Number($('budgetCreditInput')?.value || 10));
      const paid = Math.max(.01, Number($('budgetPaidInput')?.value || 12));
      if (!window.confirm(`Repartir à zéro avec ${credit.toFixed(2)} $ de crédit API ?`)) return;
      budget = { apiCreditUsd: credit, paidAmountUsd: paid, spentApiUsd: 0, videos: 0, minutes: 0 };
      saveBudget();
      writeStorage(KEY_BUDGET_HISTORY, '[]');
      writeStorage(KEY_RECORDED, '[]');
      renderBudget();
    });
    $('budgetAddCreditBtn')?.addEventListener('click', () => {
      const credit = Math.max(0, Number($('budgetCreditInput')?.value || 0));
      const paid = Math.max(0, Number($('budgetPaidInput')?.value || 0));
      if (!credit || !paid) return;
      budget.apiCreditUsd += credit;
      budget.paidAmountUsd += paid;
      saveBudget();
      renderBudget();
    });
  }

  async function adminAddMinutes() {
    const secret = currentSecret();
    const target = email($('adminClientEmail')?.value);
    const minutes = Math.floor(Number($('adminTokens')?.value || 0));
    if (!secret) return showNotice('adminAddTokensStatus', 'Mot de passe admin manquant.', 'error');
    if (!target) return showNotice('adminAddTokensStatus', 'Email client manquant.', 'error');
    if (!Number.isInteger(minutes) || minutes <= 0) return showNotice('adminAddTokensStatus', 'Nombre de minutes invalide.', 'error');

    showNotice('adminAddTokensStatus', 'Ajout des minutes…', 'loading');
    try {
      const { response, data } = await fetchJson(`${BACKEND}/api/admin/add-tokens`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ email: target, tokens: minutes, packName: 'Ajout admin 4.1', amountEur: 0 })
      }, 12000);
      if (!response.ok || !data.ok) throw new Error(data.error || 'Ajout refusé.');
      const balance = Number(data.wallet?.token_balance || 0);
      showNotice('adminAddTokensStatus', `${minutes} min ajoutée(s). Nouveau solde : ${balance} min.`, 'success');
      if (target === currentEmail()) setWallet(balance);
    } catch (error) {
      showNotice('adminAddTokensStatus', error.message || 'Erreur ajout minutes.', 'error');
    }
  }

  async function loadCosts() {
    const secret = currentSecret();
    const list = $('adminCostLogs');
    if (!secret || !list) return showNotice('adminCostStatus', 'Mot de passe admin requis.', 'error');
    showNotice('adminCostStatus', 'Chargement des coûts…', 'loading');
    try {
      const { response, data } = await fetchJson(`${BACKEND}/api/admin/cost-log?limit=30&t=${Date.now()}`, {
        cache: 'no-store', headers: { 'x-admin-secret': secret }
      }, 12000);
      if (!response.ok || !data.ok) throw new Error(data.error || 'Journal indisponible.');
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const summary = data.summary || {};
      setText('adminCostSummary', `Dernière : ${cents(summary.lastCostUsd)} · Moyenne : ${cents(summary.averageCostPerMinuteUsd)}/min · Aujourd’hui : ${cents(summary.totalUsdToday)}`);
      list.innerHTML = rows.length ? rows.slice(0, 15).map(row => {
        const relation = Array.isArray(row.clients) ? row.clients[0] : row.clients;
        return `<div class="admin-cost-row"><strong>${escapeHtml(relation?.email || 'client')}</strong> · ${escapeHtml(cents(row.api_cost_estimate_usd))} · ${Math.round(Number(row.duration_seconds || 0))} s</div>`;
      }).join('') : '<div class="admin-cost-row">Aucune génération mesurée.</div>';
      showNotice('adminCostStatus', `${rows.length} génération(s) chargée(s).`, 'success');
    } catch (error) {
      showNotice('adminCostStatus', error.message || 'Erreur journal.', 'error');
    }
  }

  function clearStatusTimers() {
    statusTimers.forEach(clearTimeout);
    statusTimers = [];
  }

  function stage(name, text) {
    if (text) setText('statusText', text);
    const stages = ['wake', 'transcribe', 'voice', 'final'];
    const index = stages.indexOf(name);
    $$('.processing-steps span').forEach((node, i) => {
      node.classList.toggle('done', i < index);
      node.classList.toggle('active', i === index);
    });
  }

  function startStatusTimeline() {
    clearStatusTimers();
    statusTimers.push(setTimeout(() => stage('transcribe', 'Transcription et détection des voix…'), 3500));
    statusTimers.push(setTimeout(() => stage('voice', 'Traduction et création des voix OpenAI…'), 13000));
    statusTimers.push(setTimeout(() => stage('final', 'Finalisation de la vidéo…'), 28000));
  }

  async function pingBackend() {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      stage('wake', attempt === 1 ? 'Connexion au moteur ViralVoice…' : `Réveil du moteur · tentative ${attempt}/3…`);
      try {
        const { response, data } = await fetchJson(`${BACKEND}/api/health?t=${Date.now()}`, { cache: 'no-store' }, 18000);
        if (!response.ok || !data.ok) throw new Error(data.error || 'Service indisponible.');
        if (!data.openaiKey) throw new Error('Clé OpenAI absente du serveur.');
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await sleep(1000);
      }
    }
    throw lastError || new Error('Serveur indisponible.');
  }

  function makeToken() {
    try {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
    } catch {
      return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    }
  }

  function saveActiveRecovery(state) {
    writeStorage(KEY_ACTIVE, JSON.stringify(state));
  }

  function readActiveRecovery() {
    try {
      const state = JSON.parse(readStorage(KEY_ACTIVE, 'null'));
      if (!state?.token || !state?.startedAt) return null;
      if (Date.now() - Number(state.startedAt) > RECOVERY_MAX_MS) {
        removeStorage(KEY_ACTIVE);
        return null;
      }
      return state;
    } catch { return null; }
  }

  async function recoverLatestAdmin(startedAt, account) {
    const secret = currentSecret();
    if (!secret || !account) return null;
    try {
      const { response, data } = await fetchJson(`${BACKEND}/api/admin/recover-latest?email=${encodeURIComponent(account)}&startedAt=${encodeURIComponent(startedAt)}&maxAgeMs=${30 * 60 * 1000}&t=${Date.now()}`, {
        cache: 'no-store', headers: { 'x-admin-secret': secret }
      }, 9000);
      return response.ok && data?.ok ? data : null;
    } catch { return null; }
  }

  async function pollRecovery(token, startedAt, account, cancelState) {
    await sleep(5000);
    let lastAdmin = 0;
    while (!cancelState.cancelled && Date.now() - startedAt < RECOVERY_MAX_MS) {
      try {
        const { response, data } = await fetchJson(`${BACKEND}/api/recover-result?token=${encodeURIComponent(token)}&t=${Date.now()}`, { cache: 'no-store' }, 8500);
        if (response.status === 200 && data?.ok) return data;
      } catch {}

      if (Date.now() - startedAt > 12000 && Date.now() - lastAdmin > 5000) {
        lastAdmin = Date.now();
        const latest = await recoverLatestAdmin(startedAt, account);
        if (latest?.ok) return latest;
      }
      if (!cancelState.cancelled) await sleep(RECOVERY_POLL_MS);
    }
    return null;
  }

  function absoluteUrl(value) {
    if (!value) return '';
    try { return new URL(value, `${BACKEND}/`).href; } catch { return String(value); }
  }

  function resetResult() {
    currentResult = null;
    document.body.classList.remove('has-result');
    $('resultCard')?.classList.add('hidden');
    ['finalVideo', 'finalAudio'].forEach(id => {
      const media = $(id);
      if (!media) return;
      try { media.pause(); } catch {}
      media.removeAttribute('src');
      media.classList.add('hidden');
    });
    ['downloadVideoBtn', 'downloadAudioBtn', 'saveAsBtn'].forEach(id => $(id)?.classList.add('hidden'));
    if ($('outputText')) $('outputText').value = '';
  }

  function applyResult(rawData, recordKey = '') {
    const data = rawData?.result && rawData.result.ok ? rawData.result : rawData;
    if (!data?.ok) throw new Error(data?.error || 'Résultat invalide.');
    currentResult = data;
    resetResultMediaOnly();

    if ($('outputText')) $('outputText').value = data.translation || '';
    if (data.wallet && !data.adminFreeMode) setWallet(Number(data.wallet.token_balance || 0));

    const videoUrl = absoluteUrl(data.dubbedVideoUrl);
    const audioUrl = absoluteUrl(data.dubbedAudioUrl);
    if (videoUrl) {
      const video = $('finalVideo');
      video.src = videoUrl;
      video.classList.remove('hidden');
      video.load();
      const link = $('downloadVideoBtn');
      link.href = videoUrl;
      link.classList.remove('hidden');
      link.setAttribute('download', 'viralvoice-video-doublee.mp4');
    }
    if (audioUrl) {
      const audio = $('finalAudio');
      audio.src = audioUrl;
      audio.classList.remove('hidden');
      audio.load();
      const link = $('downloadAudioBtn');
      link.href = audioUrl;
      link.classList.remove('hidden');
      link.setAttribute('download', 'viralvoice-voix-traduite.mp3');
    }

    const speakers = Math.max(1, Number(data.speakersDetected || 1));
    const segments = Math.max(0, Number(data.synchronizedSegments || 0));
    setText('speakerInfo', `Terminé · ${speakers} intervenant${speakers > 1 ? 's' : ''} · ${segments} passage${segments > 1 ? 's' : ''} synchronisé${segments > 1 ? 's' : ''}.`);
    $('resultCard')?.classList.remove('hidden');
    $('saveAsBtn')?.classList.toggle('hidden', !(videoUrl || audioUrl));
    $('statusCard')?.classList.add('hidden');
    document.body.classList.remove('is-processing');
    document.body.classList.add('has-result');
    showNotice('userStatus', 'Doublage terminé. La vidéo est prête.', 'success');
    removeStorage(KEY_ACTIVE);
    clearStatusTimers();
    recordBudget(data, recordKey);
    if ($('autoSaveMedia')?.checked) autoSaveResult();
  }

  function resetResultMediaOnly() {
    ['finalVideo', 'finalAudio'].forEach(id => {
      const media = $(id);
      if (!media) return;
      try { media.pause(); } catch {}
      media.removeAttribute('src');
      media.classList.add('hidden');
    });
    ['downloadVideoBtn', 'downloadAudioBtn'].forEach(id => {
      const node = $(id);
      node?.removeAttribute('href');
      node?.classList.add('hidden');
    });
  }

  function mediaResult() {
    if (!currentResult) return null;
    const isVideo = Boolean(currentResult.dubbedVideoUrl);
    const url = absoluteUrl(currentResult.dubbedVideoUrl || currentResult.dubbedAudioUrl);
    if (!url) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      url,
      fileName: isVideo ? `ViralVoice-${stamp}.mp4` : `ViralVoice-${stamp}.mp3`,
      mimeType: isVideo ? 'video/mp4' : 'audio/mpeg'
    };
  }

  function autoSaveResult() {
    const media = mediaResult();
    if (!media) return;
    try {
      if (window.ViralVoiceAndroid && typeof window.ViralVoiceAndroid.saveMedia === 'function') {
        window.ViralVoiceAndroid.saveMedia(media.url, media.fileName, media.mimeType);
      }
    } catch {}
  }

  function saveAsResult() {
    const media = mediaResult();
    if (!media) return;
    try {
      if (window.ViralVoiceAndroid && typeof window.ViralVoiceAndroid.saveMediaAs === 'function') {
        window.ViralVoiceAndroid.saveMediaAs(media.url, media.fileName, media.mimeType);
        return;
      }
    } catch {}
    window.open(media.url, '_blank', 'noopener');
  }

  async function createDub() {
    if (!selectedFile) return showNotice('userStatus', 'Choisis une vidéo ou un audio.', 'error');
    if (selectedFile.size > MAX_FILE_SIZE) return showNotice('userStatus', 'Fichier trop lourd : maximum 300 Mo.', 'error');

    const freeMode = readStorage(KEY_FREE) === 'true';
    const account = currentEmail();
    const secret = currentSecret();
    if (!freeMode && !account) return showNotice('userStatus', 'Entre ton email avant de lancer le doublage.', 'error');
    if (freeMode && !secret) return showNotice('userStatus', 'Mode admin gratuit actif mais mot de passe admin absent.', 'error');

    resetResult();
    hideNotice('userStatus');
    document.body.classList.add('is-processing');
    $('statusCard')?.classList.remove('hidden');
    const button = $('dubBtn');
    if (button) { button.disabled = true; button.textContent = 'Traitement en cours…'; }
    stage('wake', 'Connexion au moteur ViralVoice…');

    const token = makeToken();
    const startedAt = Date.now();
    const cancelState = { cancelled: false };

    try {
      await pingBackend();
      stage('transcribe', 'Envoi du fichier et transcription…');
      startStatusTimeline();

      const formData = new FormData();
      formData.append('media', selectedFile, selectedFile.name);
      formData.append('targetLanguage', $('targetLang')?.value || 'anglais');
      formData.append('voice', $('voiceMode')?.value || 'alloy');
      formData.append('voiceVolume', String(Number($('voiceVolume')?.value || 105) / 100));
      formData.append('originalVolume', String(Number($('originalVolume')?.value || 10) / 100));
      formData.append('multiVoice', $('multiVoiceMode')?.checked ? 'true' : 'false');
      formData.append('firstSpeakerRole', $('firstSpeakerRole')?.value || 'auto');
      formData.append('maleVoice', $('maleVoice')?.value || 'cedar');
      formData.append('femaleVoice', $('femaleVoice')?.value || 'coral');
      formData.append('lipSync', 'false');
      formData.append('recoveryToken', token);
      if (freeMode) {
        formData.append('adminSecret', secret);
        formData.append('clientEmail', account || ADMIN_EMAIL);
      } else {
        formData.append('clientEmail', account);
      }

      saveActiveRecovery({ token, startedAt, clientEmail: account, baseUrl: BACKEND });

      const originalPromise = fetch(`${BACKEND}/api/dub-video`, {
        method: 'POST', body: formData, cache: 'no-store'
      }).then(async response => {
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Réponse illisible.' }; }
        if (!response.ok) return { kind: 'http-error', status: response.status, error: new Error(data.error || `Erreur serveur ${response.status}`) };
        return { kind: 'result', data };
      }).catch(error => ({ kind: 'network-error', error }));

      const recoveryPromise = pollRecovery(token, startedAt, account, cancelState)
        .then(data => data ? { kind: 'result', data, recovered: true } : { kind: 'no-result' })
        .catch(error => ({ kind: 'recovery-error', error }));

      let first = await Promise.race([originalPromise, recoveryPromise]);
      if (first.kind === 'http-error' && first.status < 500) throw first.error;
      if (first.kind === 'network-error' || first.kind === 'http-error') {
        stage('final', 'Connexion mobile interrompue · récupération du résultat…');
        first = await recoveryPromise;
      }
      if (first.kind !== 'result') {
        const original = await originalPromise;
        if (original.kind === 'result') first = original;
        else throw original.error || first.error || new Error('Résultat non récupéré.');
      }

      cancelState.cancelled = true;
      applyResult(first.data, token);
    } catch (error) {
      cancelState.cancelled = true;
      document.body.classList.remove('is-processing');
      $('statusCard')?.classList.add('hidden');
      clearStatusTimers();
      showNotice('userStatus', error?.name === 'AbortError' ? 'Connexion trop lente. Réessaie.' : (error.message || 'Erreur pendant le doublage.'), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = freeMode ? '⚡ Créer gratuitement en admin' : '⚡ Créer mon doublage'; }
    }
  }

  async function resumePendingResult() {
    const active = readActiveRecovery();
    if (!active) return;
    const cancelState = { cancelled: false };
    document.body.classList.add('is-processing');
    $('statusCard')?.classList.remove('hidden');
    stage('final', 'Récupération de la génération terminée…');
    try {
      const data = await pollRecovery(active.token, Number(active.startedAt), email(active.clientEmail), cancelState);
      if (data?.ok) applyResult(data, active.token);
    } catch {}
  }

  function resetProject() {
    resetResult();
    resetFile();
    hideNotice('userStatus');
    document.body.classList.remove('is-processing', 'has-result');
    $('projectCard')?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  async function checkUpdateManually() {
    try {
      if (window.ViralVoiceUpdater && typeof window.ViralVoiceUpdater.checkNow === 'function') {
        window.ViralVoiceUpdater.checkNow();
        return;
      }
    } catch {}
    try {
      const { response, data } = await fetchJson(`https://chasmet.github.io/ViralVoice/update.json?t=${Date.now()}`, { cache: 'no-store' }, 10000);
      if (!response.ok || !data.apkUrl) throw new Error('Mise à jour indisponible.');
      window.location.href = data.apkUrl;
    } catch (error) {
      showNotice('adminUpdateStatus', error.message || 'Vérification impossible.', 'error');
    }
  }

  function bindEvents() {
    const mediaInput = $('mediaFile');
    mediaInput?.addEventListener('click', () => { mediaInput.value = ''; });
    mediaInput?.addEventListener('change', () => {
      const file = mediaInput.files?.[0];
      if (file) selectFile(file);
    });
    $('chooseFileBtn')?.addEventListener('click', openFilePicker);
    $('changeFileBtn')?.addEventListener('click', openFilePicker);
    $('clearFileBtn')?.addEventListener('click', resetFile);
    $('dubBtn')?.addEventListener('click', createDub);
    $('newDubBtn')?.addEventListener('click', resetProject);
    $('saveAsBtn')?.addEventListener('click', saveAsResult);

    $('clientEmail')?.addEventListener('input', event => {
      writeStorage(KEY_EMAIL, email(event.target.value));
      syncAdminVisibility();
    });
    $('checkWalletBtn')?.addEventListener('click', () => checkWallet());
    $('clearClientBtn')?.addEventListener('click', () => {
      $('clientEmail').value = '';
      removeStorage(KEY_EMAIL);
      setWallet(0);
      syncAdminVisibility();
      showNotice('walletStatus', 'Compte retiré de ce téléphone.', 'warning');
    });

    $$('.buy-btn').forEach(button => button.addEventListener('click', () => openPayment(button.dataset.plan)));

    $$('input[name="audioPreset"]').forEach(radio => radio.addEventListener('change', () => {
      if (radio.checked) applyPreset(radio.value);
    }));
    $('voiceVolume')?.addEventListener('input', event => setText('voiceVolumeValue', `${event.target.value}%`));
    $('originalVolume')?.addEventListener('input', event => setText('originalVolumeValue', `${event.target.value}%`));

    $('autoSaveMedia')?.addEventListener('change', event => writeStorage(KEY_AUTOSAVE, String(event.target.checked)));

    $('adminSecretInput')?.addEventListener('input', event => {
      const value = clean(event.target.value);
      if (value) writeStorage(KEY_SECRET, value);
      syncAdminVisibility();
    });
    $('saveAdminSecretBtn')?.addEventListener('click', () => {
      const secret = clean($('adminSecretInput')?.value);
      if (!secret) return showNotice('adminFreeStatus', 'Entre ton mot de passe admin.', 'error');
      writeStorage(KEY_SECRET, secret);
      syncAdminVisibility();
      showNotice('adminFreeStatus', 'Accès admin sauvegardé sur ce téléphone.', 'success');
    });
    $('adminFreeMode')?.addEventListener('change', event => {
      writeStorage(KEY_FREE, String(event.target.checked));
      document.body.classList.toggle('admin-free-active', event.target.checked);
      setText('dubBtn', event.target.checked ? '⚡ Créer gratuitement en admin' : '⚡ Créer mon doublage');
    });
    $('adminAddTokensBtn')?.addEventListener('click', adminAddMinutes);
    $('refreshAdminCostLogs')?.addEventListener('click', loadCosts);
    $('manualUpdateBtn')?.addEventListener('click', checkUpdateManually);
    configureBudgetButtons();

    $('copyTextBtn')?.addEventListener('click', async () => {
      const text = $('outputText')?.value || '';
      try { await navigator.clipboard.writeText(text); showNotice('userStatus', 'Texte copié.', 'success'); } catch {}
    });

    $('adminLogoBtn')?.addEventListener('click', () => {
      logoTaps += 1;
      clearTimeout(logoTimer);
      logoTimer = setTimeout(() => { logoTaps = 0; }, 1200);
      if (logoTaps >= 7) {
        logoTaps = 0;
        $('adminPanel')?.classList.remove('hidden');
        $('apiBudgetCounter')?.classList.remove('hidden');
      }
    });

    window.addEventListener('pageshow', () => {
      updateVersionUi();
      if (document.visibilityState === 'visible') resumePendingResult();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resumePendingResult();
    });
  }

  function init() {
    updateVersionUi();
    const savedEmail = readStorage(KEY_EMAIL);
    if ($('clientEmail')) $('clientEmail').value = savedEmail;
    const secret = readStorage(KEY_SECRET);
    if ($('adminSecretInput')) $('adminSecretInput').value = secret;
    const freeMode = readStorage(KEY_FREE) === 'true';
    if ($('adminFreeMode')) $('adminFreeMode').checked = freeMode;
    document.body.classList.toggle('admin-free-active', freeMode);
    const autoSave = readStorage(KEY_AUTOSAVE) === 'true';
    if ($('autoSaveMedia')) $('autoSaveMedia').checked = autoSave;
    if ($('budgetCreditInput')) $('budgetCreditInput').value = '10';
    if ($('budgetPaidInput')) $('budgetPaidInput').value = '12';
    applyPreset('balanced');
    bindEvents();
    syncAdminVisibility();
    renderBudget();
    if (savedEmail) checkWallet({ quiet: true });
    setTimeout(resumePendingResult, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
