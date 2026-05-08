const mediaFile = document.getElementById('mediaFile');
const fileInfo = document.getElementById('fileInfo');
const dubBtn = document.getElementById('dubBtn');
const adminLogoBtn = document.getElementById('adminLogoBtn');
const adminPanel = document.getElementById('adminPanel');

const backendUrl = document.getElementById('backendUrl');
const saveBackendBtn = document.getElementById('saveBackendBtn');
const testBackendBtn = document.getElementById('testBackendBtn');
const backendStatus = document.getElementById('backendStatus');

const userStatus = document.getElementById('userStatus');
const targetLang = document.getElementById('targetLang');
const voiceMode = document.getElementById('voiceMode');
const multiVoiceMode = document.getElementById('multiVoiceMode');
const voiceVolume = document.getElementById('voiceVolume');
const voiceVolumeValue = document.getElementById('voiceVolumeValue');
const originalVolume = document.getElementById('originalVolume');
const originalVolumeValue = document.getElementById('originalVolumeValue');

const statusCard = document.getElementById('statusCard');
const statusText = document.getElementById('statusText');
const resultCard = document.getElementById('resultCard');
const outputText = document.getElementById('outputText');
const finalVideo = document.getElementById('finalVideo');
const finalAudio = document.getElementById('finalAudio');
const downloadVideoBtn = document.getElementById('downloadVideoBtn');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');
const sourcePreview = document.getElementById('sourcePreview');
const sourceAudioPreview = document.getElementById('sourceAudioPreview');
const speakerInfo = document.getElementById('speakerInfo');

const clientEmail = document.getElementById('clientEmail');
const checkWalletBtn = document.getElementById('checkWalletBtn');
const clearClientBtn = document.getElementById('clearClientBtn');
const walletBadge = document.getElementById('walletBadge');
const walletStatus = document.getElementById('walletStatus');

const paymentStatus = document.getElementById('paymentStatus');
const savePaymentLinksBtn = document.getElementById('savePaymentLinksBtn');
const paymentRequestsList = document.getElementById('paymentRequestsList');

const adminSecretInput = document.getElementById('adminSecretInput');
const adminFreeMode = document.getElementById('adminFreeMode');
const saveAdminSecretBtn = document.getElementById('saveAdminSecretBtn');
const adminFreeStatus = document.getElementById('adminFreeStatus');

const adminClientEmail = document.getElementById('adminClientEmail');
const adminTokens = document.getElementById('adminTokens');
const adminPackName = document.getElementById('adminPackName');
const adminAmountEur = document.getElementById('adminAmountEur');
const adminAddTokensBtn = document.getElementById('adminAddTokensBtn');
const adminAddTokensStatus = document.getElementById('adminAddTokensStatus');

const payInputs = {
  decouverte: document.getElementById('payDecouverte'),
  createur: document.getElementById('payCreateur'),
  viral: document.getElementById('payViral'),
  pro: document.getElementById('payPro')
};

const APP_VERSION = '20260508k';
const BACKEND_KEY = 'viralvoice-backend-url';
const PAYMENT_LINKS_KEY = 'viralvoice-payment-links';
const PAYMENT_REQUESTS_KEY = 'viralvoice-payment-requests';
const CLIENT_EMAIL_KEY = 'viralvoice-client-email';
const ADMIN_SECRET_KEY = 'viralvoice-admin-secret';
const ADMIN_FREE_MODE_KEY = 'viralvoice-admin-free-mode';

const MAX_FILE_SIZE = 80 * 1024 * 1024;
const DEFAULT_BACKEND_URL = 'https://viralvoice.onrender.com';

const DEFAULT_PAYMENT_LINKS = {
  decouverte: 'https://checkout.revolut.com/pay/1f3ed21f-2b5a-428e-98ce-92195da91bc6',
  createur: 'https://checkout.revolut.com/pay/664e7390-9e23-4772-beae-4cbe18ad228a',
  viral: 'https://checkout.revolut.com/pay/9249340c-529d-4fd5-ae94-8f250a7db43c',
  pro: 'https://checkout.revolut.com/pay/4ff81a0e-d5b1-41e5-8ece-1b9890bb1ac3'
};

const PLANS = {
  decouverte: { label: 'Découverte', credits: 1, price: '1,99 €' },
  createur: { label: 'Créateur', credits: 5, price: '6,99 €' },
  viral: { label: 'Viral', credits: 10, price: '11,99 €' },
  pro: { label: 'Pro', credits: 30, price: '29,99 €' }
};

let sourceObjectUrl = null;
let currentResultUrls = [];
let logoTapCount = 0;
let logoTapTimer = null;

const sameOriginBackend = `${window.location.origin}`;

backendUrl.value = localStorage.getItem(BACKEND_KEY) || DEFAULT_BACKEND_URL;
clientEmail.value = localStorage.getItem(CLIENT_EMAIL_KEY) || '';

if (adminSecretInput) adminSecretInput.value = localStorage.getItem(ADMIN_SECRET_KEY) || '';
if (adminFreeMode) adminFreeMode.checked = localStorage.getItem(ADMIN_FREE_MODE_KEY) === 'true';

loadPaymentLinks();
renderPaymentRequests();
updateAdminVisualMode();

if (location.hash === '#admin') showAdminPanel();
clearOldServiceWorkersAndCaches();

adminLogoBtn.addEventListener('click', () => {
  logoTapCount += 1;
  clearTimeout(logoTapTimer);

  logoTapTimer = setTimeout(() => {
    logoTapCount = 0;
  }, 1200);

  if (logoTapCount >= 7) {
    logoTapCount = 0;
    showAdminPanel();
    showBackendStatus(`Mode admin ouvert. Version ${APP_VERSION}`, 'success');
  }
});

clientEmail.addEventListener('input', () => {
  const email = normalizeEmail(clientEmail.value);
  localStorage.setItem(CLIENT_EMAIL_KEY, email);
});

checkWalletBtn.addEventListener('click', checkWallet);

clearClientBtn.addEventListener('click', () => {
  clientEmail.value = '';
  localStorage.removeItem(CLIENT_EMAIL_KEY);
  setWalletBadge(0);
  showWalletStatus('Compte vidé sur ce téléphone.', 'warning');
});

voiceVolume.addEventListener('input', () => {
  voiceVolumeValue.textContent = `${voiceVolume.value}%`;
});

originalVolume.addEventListener('input', () => {
  originalVolumeValue.textContent = `${originalVolume.value}%`;
});

document.querySelectorAll('.buy-btn').forEach(button => {
  button.addEventListener('click', () => handleBuyPlan(button.dataset.plan));
});

savePaymentLinksBtn.addEventListener('click', savePaymentLinks);

saveBackendBtn.addEventListener('click', () => {
  const backend = cleanBackendUrl(backendUrl.value);

  if (!backend) {
    showBackendStatus('Colle une URL qui commence par https://', 'error');
    return;
  }

  backendUrl.value = backend;
  localStorage.setItem(BACKEND_KEY, backend);
  showBackendStatus('Service sauvegardé sur ce téléphone.', 'success');
});

testBackendBtn.addEventListener('click', testBackendConnection);

if (saveAdminSecretBtn) {
  saveAdminSecretBtn.addEventListener('click', () => {
    const secret = adminSecretInput.value.trim();

    if (!secret) {
      showAdminFreeStatus('Entre ton mot de passe admin Render.', 'error');
      return;
    }

    localStorage.setItem(ADMIN_SECRET_KEY, secret);
    showAdminFreeStatus('Mode admin sauvegardé sur ce téléphone.', 'success');
  });
}

if (adminFreeMode) {
  adminFreeMode.addEventListener('change', () => {
    localStorage.setItem(ADMIN_FREE_MODE_KEY, adminFreeMode.checked ? 'true' : 'false');
    updateAdminVisualMode();

    showAdminFreeStatus(
      adminFreeMode.checked ? 'Mode admin gratuit activé.' : 'Mode client normal activé.',
      adminFreeMode.checked ? 'success' : 'warning'
    );
  });
}

if (adminAddTokensBtn) {
  adminAddTokensBtn.addEventListener('click', adminAddTokens);
}

mediaFile.addEventListener('change', () => {
  resetResult();
  resetSourcePreview();
  hideUserStatus();

  const file = mediaFile.files && mediaFile.files[0] ? mediaFile.files[0] : null;

  if (!file) {
    fileInfo.textContent = 'Aucun fichier sélectionné';
    return;
  }

  const sizeMb = (file.size / 1024 / 1024).toFixed(2);
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  const typeLabel = isVideo ? 'Vidéo' : 'Audio';

  fileInfo.textContent = `${typeLabel} : ${file.name} - ${sizeMb} MB`;

  if (file.size > MAX_FILE_SIZE) {
    showUserStatus('Fichier trop lourd pour la V1. Coupe une vidéo plus courte.', 'warning');
  }

  sourceObjectUrl = URL.createObjectURL(file);

  if (isVideo) {
    sourcePreview.src = sourceObjectUrl;
    sourcePreview.classList.remove('hidden');
  } else if (isAudio) {
    sourceAudioPreview.src = sourceObjectUrl;
    sourceAudioPreview.classList.remove('hidden');
  }
});

dubBtn.addEventListener('click', createDub);

async function checkWallet() {
  const email = normalizeEmail(clientEmail.value);

  if (!email) {
    showWalletStatus('Entre ton email pour voir tes crédits.', 'error');
    clientEmail.focus();
    return null;
  }

  try {
    checkWalletBtn.disabled = true;
    showWalletStatus('Vérification du solde...', 'loading');

    const backend = getBackendUrl();
    const response = await fetch(`${backend}/api/wallet?email=${encodeURIComponent(email)}&v=${APP_VERSION}`, {
      method: 'GET',
      cache: 'no-store'
    });

    const data = await readJsonResponse(response);

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Impossible de lire le solde.');
    }

    const balance = Number(data.wallet?.token_balance || 0);
    setWalletBadge(balance);
    localStorage.setItem(CLIENT_EMAIL_KEY, email);

    showWalletStatus(
      balance > 0
        ? `Solde disponible : ${balance} crédit(s).`
        : 'Solde à 0. Achète un pack pour créer un doublage.',
      balance > 0 ? 'success' : 'warning'
    );

    return data.wallet;
  } catch (error) {
    showWalletStatus(error.message || 'Erreur solde.', 'error');
    return null;
  } finally {
    checkWalletBtn.disabled = false;
  }
}

function handleBuyPlan(planId) {
  const plan = PLANS[planId];
  const email = normalizeEmail(clientEmail.value);
  const links = getPaymentLinks();
  const url = links[planId];

  if (!email) {
    showPaymentStatus('Écris ton email avant de payer.', 'error');
    clientEmail.focus();
    return;
  }

  if (!url) {
    showPaymentStatus('Lien de paiement pas encore configuré pour ce pack.', 'warning');
    showAdminPanel();
    return;
  }

  const request = {
    id: Date.now(),
    clientEmail: email,
    planId,
    planLabel: plan.label,
    credits: plan.credits,
    price: plan.price,
    status: 'paiement ouvert',
    date: new Date().toLocaleString()
  };

  const requests = getPaymentRequests();
  requests.unshift(request);
  localStorage.setItem(PAYMENT_REQUESTS_KEY, JSON.stringify(requests.slice(0, 50)));
  renderPaymentRequests();

  showPaymentStatus(`${plan.label} sélectionné. Paiement ouvert. Après paiement, tes crédits seront ajoutés.`, 'success');
  window.open(url, '_blank', 'noopener,noreferrer');
}

function savePaymentLinks() {
  const links = {
    decouverte: cleanPaymentUrl(payInputs.decouverte.value),
    createur: cleanPaymentUrl(payInputs.createur.value),
    viral: cleanPaymentUrl(payInputs.viral.value),
    pro: cleanPaymentUrl(payInputs.pro.value)
  };

  localStorage.setItem(PAYMENT_LINKS_KEY, JSON.stringify(links));
  showBackendStatus('Liens de paiement sauvegardés sur ce téléphone.', 'success');
}

function loadPaymentLinks() {
  const links = getPaymentLinks();

  Object.keys(payInputs).forEach(key => {
    if (payInputs[key]) payInputs[key].value = links[key] || '';
  });
}

function getPaymentLinks() {
  try {
    const saved = JSON.parse(localStorage.getItem(PAYMENT_LINKS_KEY) || '{}');
    return { ...DEFAULT_PAYMENT_LINKS, ...saved };
  } catch {
    return { ...DEFAULT_PAYMENT_LINKS };
  }
}

function cleanPaymentUrl(url) {
  const clean = String(url || '').trim();

  if (!clean) return '';
  return clean.startsWith('https://') ? clean : '';
}

function getPaymentRequests() {
  try {
    return JSON.parse(localStorage.getItem(PAYMENT_REQUESTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function renderPaymentRequests() {
  if (!paymentRequestsList) return;

  const requests = getPaymentRequests();

  if (!requests.length) {
    paymentRequestsList.innerHTML = '<p class="hint">Aucune demande enregistrée sur ce téléphone.</p>';
    return;
  }

  paymentRequestsList.innerHTML = requests.map(item => `
    <div class="payment-request">
      <strong>${escapeHtml(item.clientEmail || item.clientName || '')} - ${escapeHtml(item.planLabel)}</strong>
      <small>${escapeHtml(item.price)} - ${item.credits || item.minutes || 0} crédit(s) - ${escapeHtml(item.date)}</small>
      <span>${escapeHtml(item.status)}</span>
    </div>
  `).join('');
}

async function adminAddTokens() {
  const backend = getBackendUrl();
  const secret = localStorage.getItem(ADMIN_SECRET_KEY) || adminSecretInput.value.trim();
  const email = normalizeEmail(adminClientEmail.value);
  const tokens = Number(adminTokens.value || 0);
  const packName = adminPackName.value.trim() || 'Ajout manuel';
  const amountEur = Number(adminAmountEur.value || 0);

  if (!secret) {
    showAdminAddTokensStatus('Sauvegarde ton mot de passe admin avant.', 'error');
    return;
  }

  if (!email) {
    showAdminAddTokensStatus('Entre l’email du client.', 'error');
    adminClientEmail.focus();
    return;
  }

  if (!Number.isInteger(tokens) || tokens <= 0) {
    showAdminAddTokensStatus('Nombre de crédits invalide.', 'error');
    return;
  }

  try {
    adminAddTokensBtn.disabled = true;
    showAdminAddTokensStatus('Ajout des crédits...', 'loading');

    const response = await fetch(`${backend}/api/admin/add-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': secret
      },
      body: JSON.stringify({
        email,
        tokens,
        packName,
        amountEur
      })
    });

    const data = await readJsonResponse(response);

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Erreur ajout crédits.');
    }

    showAdminAddTokensStatus(data.message || 'Crédits ajoutés.', 'success');

    if (normalizeEmail(clientEmail.value) === email) {
      setWalletBadge(Number(data.wallet?.token_balance || 0));
    }
  } catch (error) {
    showAdminAddTokensStatus(error.message || 'Erreur ajout crédits.', 'error');
  } finally {
    adminAddTokensBtn.disabled = false;
  }
}

async function testBackendConnection() {
  const backend = getBackendUrl();

  try {
    testBackendBtn.disabled = true;
    showBackendStatus('Test du service...', 'loading');

    const response = await fetch(`${backend}/api/health?version=${APP_VERSION}`, {
      method: 'GET',
      cache: 'no-store'
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error('Réponse service invalide');
    }

    showBackendStatus(
      `Service connecté - OpenAI ${data.openaiKey ? 'OK' : 'manquant'} - Supabase ${data.supabase ? 'OK' : 'manquant'} - Admin ${data.adminSecret ? 'OK' : 'manquant'}`,
      data.openaiKey && data.supabase ? 'success' : 'warning'
    );
  } catch (error) {
    showBackendStatus('Service Render non joignable. Vérifie que Render est bien réveillé.', 'error');
  } finally {
    testBackendBtn.disabled = false;
  }
}

async function createDub() {
  const file = mediaFile.files && mediaFile.files[0] ? mediaFile.files[0] : null;
  const backend = getBackendUrl();
  const isAdminFree = localStorage.getItem(ADMIN_FREE_MODE_KEY) === 'true';
  const savedAdminSecret = localStorage.getItem(ADMIN_SECRET_KEY) || '';

  hideUserStatus();

  if (!file) {
    showUserStatus('Choisis une vidéo ou un audio.', 'error');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showUserStatus('Fichier trop lourd pour la V1. Coupe une vidéo plus courte.', 'error');
    return;
  }

  const email = normalizeEmail(clientEmail.value);

  if (!isAdminFree && !email) {
    showUserStatus('Entre ton email client avant de lancer le doublage.', 'error');
    clientEmail.focus();
    return;
  }

  if (isAdminFree && !savedAdminSecret) {
    showUserStatus('Mode admin activé, mais mot de passe admin manquant.', 'error');
    showAdminPanel();
    return;
  }

  try {
    resetResult();

    statusCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    dubBtn.disabled = true;
    dubBtn.textContent = 'Traitement en cours...';
    statusText.textContent = 'Réveil du service Render...';

    const health = await pingBackend(backend);

    if (!isAdminFree && health.supabase) {
      const wallet = await checkWallet();
      const balance = Number(wallet?.token_balance || 0);

      if (balance <= 0) {
        throw new Error('Solde insuffisant. Achète un pack ou demande l’activation de tes crédits.');
      }
    }

    statusText.textContent = isAdminFree
      ? 'Mode admin gratuit actif...'
      : 'Préparation du doublage...';

    const formData = new FormData();

    formData.append('media', file);
    formData.append('targetLanguage', targetLang.value);
    formData.append('voice', voiceMode.value);
    formData.append('voiceVolume', String(Number(voiceVolume.value) / 100));
    formData.append('originalVolume', String(Number(originalVolume.value) / 100));
    formData.append('multiVoice', multiVoiceMode.checked ? 'true' : 'false');

    if (isAdminFree && savedAdminSecret) {
      formData.append('adminSecret', savedAdminSecret);
      formData.append('clientEmail', 'admin@viralvoice.local');
    } else {
      formData.append('clientEmail', email);
    }

    scheduleStatusMessages();

    const response = await fetch(`${backend}/api/dub-video`, {
      method: 'POST',
      body: formData,
      cache: 'no-store'
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(data.error || 'Erreur serveur');
    }

    outputText.value = data.translation || '';

    speakerInfo.textContent = data.adminFreeMode
      ? 'Mode admin : doublage gratuit généré.'
      : `Doublage terminé. Crédit restant : ${Number(data.wallet?.token_balance || 0)}.`;

    if (data.wallet && !data.adminFreeMode) {
      setWalletBadge(Number(data.wallet.token_balance || 0));
    }

    if (data.dubbedVideoUrl) {
      const videoUrl = absoluteUrl(backend, data.dubbedVideoUrl);
      finalVideo.src = videoUrl;
      finalVideo.classList.remove('hidden');
      downloadVideoBtn.href = videoUrl;
      downloadVideoBtn.classList.remove('hidden');
      downloadVideoBtn.setAttribute('download', 'viralvoice-video-doublee.mp4');
    }

    if (data.dubbedAudioUrl) {
      const audioUrl = absoluteUrl(backend, data.dubbedAudioUrl);
      finalAudio.src = audioUrl;
      finalAudio.classList.remove('hidden');
      downloadAudioBtn.href = audioUrl;
      downloadAudioBtn.classList.remove('hidden');
      downloadAudioBtn.setAttribute('download', 'viralvoice-voix-traduite.mp3');
    }

    resultCard.classList.remove('hidden');
    statusText.textContent = 'Terminé';
    showUserStatus('Doublage terminé.', 'success');
  } catch (error) {
    console.error(error);
    showUserStatus(error.message || 'Erreur pendant le doublage.', 'error');
  } finally {
    statusCard.classList.add('hidden');
    dubBtn.disabled = false;
    dubBtn.textContent = '⚡ Créer mon doublage';
  }
}

async function pingBackend(backend) {
  const response = await fetch(`${backend}/api/health?version=${APP_VERSION}`, {
    method: 'GET',
    cache: 'no-store'
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error('Service Render indisponible. Réessaie dans 30 secondes.');
  }

  if (!data.openaiKey) {
    throw new Error('Clé OpenAI manquante dans Render.');
  }

  if (!data.supabase) {
    throw new Error('Supabase manquant dans Render.');
  }

  return data;
}

function scheduleStatusMessages() {
  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Transcription de la voix originale...';
  }, 2500);

  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Traduction du texte...';
  }, 9000);

  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Création de la voix IA...';
  }, 15000);

  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Préparation du fichier final...';
  }, 23000);
}

function getBackendUrl() {
  const manual = cleanBackendUrl(backendUrl.value || localStorage.getItem(BACKEND_KEY) || '');

  if (manual) return manual;

  const host = window.location.hostname;

  if (host.includes('onrender.com') || host === 'localhost' || host === '127.0.0.1') {
    return sameOriginBackend;
  }

  return DEFAULT_BACKEND_URL;
}

function showAdminPanel() {
  adminPanel.classList.remove('hidden');
  adminPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showPaymentStatus(text, type = '') {
  paymentStatus.textContent = text;
  paymentStatus.className = 'notice';
  if (type) paymentStatus.classList.add(type);
  paymentStatus.classList.remove('hidden');
}

function showWalletStatus(text, type = '') {
  walletStatus.textContent = text;
  walletStatus.className = 'notice';
  if (type) walletStatus.classList.add(type);
  walletStatus.classList.remove('hidden');
}

function showAdminFreeStatus(text, type = '') {
  if (!adminFreeStatus) return;

  adminFreeStatus.textContent = text;
  adminFreeStatus.className = 'notice';
  if (type) adminFreeStatus.classList.add(type);
  adminFreeStatus.classList.remove('hidden');
}

function showAdminAddTokensStatus(text, type = '') {
  if (!adminAddTokensStatus) return;

  adminAddTokensStatus.textContent = text;
  adminAddTokensStatus.className = 'notice';
  if (type) adminAddTokensStatus.classList.add(type);
  adminAddTokensStatus.classList.remove('hidden');
}

function setWalletBadge(balance) {
  const value = Number(balance || 0);
  walletBadge.textContent = `${value} crédit${value > 1 ? 's' : ''}`;
  walletBadge.classList.toggle('ok-badge', value > 0);
  walletBadge.classList.toggle('muted-badge', value <= 0);
}

function updateAdminVisualMode() {
  const isAdminFree = localStorage.getItem(ADMIN_FREE_MODE_KEY) === 'true';

  document.body.classList.toggle('admin-free-active', isAdminFree);

  if (isAdminFree) {
    dubBtn.textContent = '⚡ Créer gratuitement en admin';
  } else {
    dubBtn.textContent = '⚡ Créer mon doublage';
  }
}

function resetResult() {
  finalVideo.pause();
  finalVideo.removeAttribute('src');
  finalVideo.load();
  finalVideo.classList.add('hidden');

  finalAudio.pause();
  finalAudio.removeAttribute('src');
  finalAudio.load();
  finalAudio.classList.add('hidden');

  downloadVideoBtn.removeAttribute('href');
  downloadVideoBtn.classList.add('hidden');

  downloadAudioBtn.removeAttribute('href');
  downloadAudioBtn.classList.add('hidden');

  outputText.value = '';
  speakerInfo.textContent = 'Voix générée par IA.';

  currentResultUrls.forEach(url => URL.revokeObjectURL(url));
  currentResultUrls = [];
}

function resetSourcePreview() {
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);

  sourceObjectUrl = null;

  sourcePreview.pause();
  sourcePreview.removeAttribute('src');
  sourcePreview.load();
  sourcePreview.classList.add('hidden');

  sourceAudioPreview.pause();
  sourceAudioPreview.removeAttribute('src');
  sourceAudioPreview.load();
  sourceAudioPreview.classList.add('hidden');
}

function cleanBackendUrl(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '');

  if (!clean) return '';

  return clean.startsWith('https://') || clean.startsWith('http://localhost') ? clean : '';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function showBackendStatus(text, type = '') {
  backendStatus.textContent = text;
  backendStatus.className = 'notice';
  if (type) backendStatus.classList.add(type);
}

function showUserStatus(text, type = '') {
  userStatus.textContent = text;
  userStatus.className = 'notice user-status';
  if (type) userStatus.classList.add(type);
  userStatus.classList.remove('hidden');
}

function hideUserStatus() {
  userStatus.classList.add('hidden');
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: text || 'Réponse serveur illisible'
    };
  }
}

function absoluteUrl(backend, url) {
  if (!url) return '';

  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    return url;
  }

  return `${backend}${url.startsWith('/') ? '' : '/'}${url}`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

async function clearOldServiceWorkersAndCaches() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  } catch (error) {
    console.warn('Nettoyage cache impossible', error);
  }
}
