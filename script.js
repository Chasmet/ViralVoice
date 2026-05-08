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

const APP_VERSION = '20260508f';
const BACKEND_KEY = 'viralvoice-backend-url';
const MAX_FILE_SIZE = 80 * 1024 * 1024;
const DEFAULT_BACKEND_URL = 'https://viralvoice.onrender.com';

let sourceObjectUrl = null;
let currentResultUrls = [];
let logoTapCount = 0;
let logoTapTimer = null;

const sameOriginBackend = `${window.location.origin}`;
backendUrl.value = DEFAULT_BACKEND_URL;
localStorage.setItem(BACKEND_KEY, DEFAULT_BACKEND_URL);

if (location.hash === '#admin') {
  showAdminPanel();
}

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

voiceVolume.addEventListener('input', () => {
  voiceVolumeValue.textContent = `${voiceVolume.value}%`;
});

originalVolume.addEventListener('input', () => {
  originalVolumeValue.textContent = `${originalVolume.value}%`;
});

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
  fileInfo.textContent = `${typeLabel} : ${file.name} • ${sizeMb} MB`;

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
    if (!response.ok || !data.ok) throw new Error('Réponse service invalide');
    showBackendStatus(`Service connecté : ${data.app || 'ViralVoice'} - clé OpenAI ${data.openaiKey ? 'OK' : 'manquante'}`, 'success');
  } catch (error) {
    showBackendStatus('Service Render non joignable. Vérifie que Render est bien réveillé.', 'error');
  } finally {
    testBackendBtn.disabled = false;
  }
}

async function createDub() {
  const file = mediaFile.files && mediaFile.files[0] ? mediaFile.files[0] : null;
  const backend = getBackendUrl();

  hideUserStatus();

  if (!file) {
    showUserStatus('Choisis une vidéo ou un audio.', 'error');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showUserStatus('Fichier trop lourd pour la V1. Coupe une vidéo plus courte.', 'error');
    return;
  }

  try {
    resetResult();
    statusCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    dubBtn.disabled = true;
    dubBtn.textContent = 'Traitement en cours...';
    statusText.textContent = 'Réveil du service Render...';

    await pingBackend(backend);

    statusText.textContent = 'Préparation du fichier...';

    const formData = new FormData();
    formData.append('media', file);
    formData.append('targetLanguage', targetLang.value);
    formData.append('voice', voiceMode.value);
    formData.append('voiceVolume', String(Number(voiceVolume.value) / 100));
    formData.append('originalVolume', String(Number(originalVolume.value) / 100));

    scheduleStatusMessages();

    const response = await fetch(`${backend}/api/dub-video`, {
      method: 'POST',
      body: formData,
      cache: 'no-store'
    });

    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || 'Erreur serveur');

    outputText.value = data.translation || '';

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
    dubBtn.textContent = '⚡ Créer le doublage';
  }
}

async function pingBackend(backend) {
  const response = await fetch(`${backend}/api/health?version=${APP_VERSION}`, {
    method: 'GET',
    cache: 'no-store'
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error('Service Render indisponible. Réessaie dans 30 secondes.');
  if (!data.openaiKey) throw new Error('Clé OpenAI manquante dans Render. Ajoute OPENAI_API_KEY.');
  return data;
}

function scheduleStatusMessages() {
  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Transcription de la voix originale...';
  }, 2500);

  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Traduction du texte...';
  }, 7000);

  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Création de la voix IA...';
  }, 12000);

  setTimeout(() => {
    if (!statusCard.classList.contains('hidden')) statusText.textContent = 'Préparation du fichier final...';
  }, 18000);
}

function getBackendUrl() {
  const manual = cleanBackendUrl(backendUrl.value || localStorage.getItem(BACKEND_KEY) || '');
  if (manual && manual.includes('viralvoice.onrender.com')) return manual;

  const host = window.location.hostname;
  if (host.includes('onrender.com') || host === 'localhost' || host === '127.0.0.1') return sameOriginBackend;

  return DEFAULT_BACKEND_URL;
}

function showAdminPanel() {
  adminPanel.classList.remove('hidden');
  adminPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  } catch (error) {
    return { error: text || 'Réponse serveur illisible' };
  }
}

function absoluteUrl(backend, url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  return `${backend}${url.startsWith('/') ? '' : '/'}${url}`;
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
