const mediaFile = document.getElementById('mediaFile');
const fileInfo = document.getElementById('fileInfo');
const dubBtn = document.getElementById('dubBtn');
const backendUrl = document.getElementById('backendUrl');
const saveBackendBtn = document.getElementById('saveBackendBtn');
const targetLang = document.getElementById('targetLang');
const voiceMode = document.getElementById('voiceMode');
const statusCard = document.getElementById('statusCard');
const statusText = document.getElementById('statusText');
const resultCard = document.getElementById('resultCard');
const outputText = document.getElementById('outputText');
const finalVideo = document.getElementById('finalVideo');
const finalAudio = document.getElementById('finalAudio');
const downloadVideoBtn = document.getElementById('downloadVideoBtn');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');

const BACKEND_KEY = 'viralvoice-backend-url';
backendUrl.value = localStorage.getItem(BACKEND_KEY) || '';

saveBackendBtn.addEventListener('click', async () => {
  const backend = cleanBackendUrl(backendUrl.value);

  if (!backend) {
    alert('Colle ton URL Render');
    return;
  }

  backendUrl.value = backend;
  localStorage.setItem(BACKEND_KEY, backend);

  try {
    const response = await fetch(`${backend}/api/health`);
    const data = await response.json();

    if (data.ok) {
      alert('Backend connecté');
    } else {
      alert('Backend sauvegardé, mais réponse étrange');
    }
  } catch (error) {
    alert('URL sauvegardée, mais le backend ne répond pas encore');
  }
});

mediaFile.addEventListener('change', () => {
  resetResult();

  const file = mediaFile.files[0];

  if (!file) {
    fileInfo.textContent = 'Aucun fichier sélectionné';
    return;
  }

  const sizeMb = (file.size / 1024 / 1024).toFixed(2);
  const typeLabel = file.type.startsWith('video/') ? 'Vidéo' : 'Audio';
  fileInfo.textContent = `${typeLabel} : ${file.name} • ${sizeMb} MB`;

  if (file.size > 80 * 1024 * 1024) {
    alert('Pour le premier test, prends une vidéo courte de moins de 80 MB.');
  }
});

dubBtn.addEventListener('click', async () => {
  const file = mediaFile.files[0];
  const backend = cleanBackendUrl(backendUrl.value);

  if (!backend) {
    alert('Ajoute ton URL backend Render');
    return;
  }

  if (!file) {
    alert('Choisis une vidéo ou un audio');
    return;
  }

  try {
    resetResult();
    statusCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    dubBtn.disabled = true;
    dubBtn.textContent = 'Traitement en cours...';
    statusText.textContent = 'Envoi du fichier vers Render...';

    localStorage.setItem(BACKEND_KEY, backend);

    const formData = new FormData();
    formData.append('media', file);
    formData.append('targetLanguage', targetLang.value);
    formData.append('voice', voiceMode.value);

    setTimeout(() => {
      if (!statusCard.classList.contains('hidden')) {
        statusText.textContent = 'OpenAI transcrit et traduit la voix...';
      }
    }, 3500);

    setTimeout(() => {
      if (!statusCard.classList.contains('hidden')) {
        statusText.textContent = 'Création de la nouvelle voix IA...';
      }
    }, 9000);

    setTimeout(() => {
      if (!statusCard.classList.contains('hidden')) {
        statusText.textContent = 'Export de la vidéo finale...';
      }
    }, 15000);

    const response = await fetch(`${backend}/api/dub-video`, {
      method: 'POST',
      body: formData
    });

    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Réponse serveur illisible');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Erreur serveur');
    }

    outputText.value = data.translation || '';

    if (data.dubbedVideoUrl) {
      finalVideo.src = data.dubbedVideoUrl;
      finalVideo.classList.remove('hidden');
      downloadVideoBtn.href = data.dubbedVideoUrl;
      downloadVideoBtn.classList.remove('hidden');
      downloadVideoBtn.setAttribute('download', 'viralvoice-video-doublee.mp4');
    }

    if (data.dubbedAudioUrl) {
      finalAudio.src = data.dubbedAudioUrl;
      finalAudio.classList.remove('hidden');
      downloadAudioBtn.href = data.dubbedAudioUrl;
      downloadAudioBtn.classList.remove('hidden');
      downloadAudioBtn.setAttribute('download', 'viralvoice-voix-traduite.mp3');
    }

    resultCard.classList.remove('hidden');
    statusText.textContent = 'Terminé';
  } catch (error) {
    console.error(error);
    alert(error.message || 'Erreur pendant le doublage');
  } finally {
    statusCard.classList.add('hidden');
    dubBtn.disabled = false;
    dubBtn.textContent = '⚡ Créer la vidéo doublée';
  }
});

function resetResult() {
  finalVideo.removeAttribute('src');
  finalVideo.load();
  finalVideo.classList.add('hidden');

  finalAudio.removeAttribute('src');
  finalAudio.load();
  finalAudio.classList.add('hidden');

  downloadVideoBtn.removeAttribute('href');
  downloadVideoBtn.classList.add('hidden');

  downloadAudioBtn.removeAttribute('href');
  downloadAudioBtn.classList.add('hidden');

  outputText.value = '';
}

function cleanBackendUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}
