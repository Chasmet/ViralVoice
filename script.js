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

saveBackendBtn.addEventListener('click', () => {
  localStorage.setItem(BACKEND_KEY, backendUrl.value.trim());
  alert('Backend sauvegardé');
});

mediaFile.addEventListener('change', () => {
  const file = mediaFile.files[0];
  if (!file) {
    fileInfo.textContent = 'Aucun fichier sélectionné';
    return;
  }
  const sizeMb = (file.size / 1024 / 1024).toFixed(2);
  fileInfo.textContent = `${file.name} • ${sizeMb} MB`;
});

dubBtn.addEventListener('click', async () => {
  const file = mediaFile.files[0];
  const backend = backendUrl.value.trim().replace(/\/$/, '');

  if (!backend) {
    alert('Ajoute ton URL backend Render');
    return;
  }

  if (!file) {
    alert('Choisis une vidéo ou un audio');
    return;
  }

  try {
    statusCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    dubBtn.disabled = true;
    statusText.textContent = 'Envoi du fichier...';

    const formData = new FormData();
    formData.append('media', file);
    formData.append('targetLanguage', targetLang.value);
    formData.append('voice', voiceMode.value);

    statusText.textContent = 'Transcription, traduction et doublage IA...';

    const response = await fetch(`${backend}/api/dub-video`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

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
  } catch (error) {
    console.error(error);
    alert(error.message || 'Erreur pendant le doublage');
  } finally {
    statusCard.classList.add('hidden');
    dubBtn.disabled = false;
  }
});