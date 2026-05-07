const mediaFile = document.getElementById('mediaFile');
const fileInfo = document.getElementById('fileInfo');
const translateBtn = document.getElementById('translateBtn');
const outputText = document.getElementById('outputText');
const resultCard = document.getElementById('resultCard');
const statusCard = document.getElementById('statusCard');
const statusText = document.getElementById('statusText');
const targetLang = document.getElementById('targetLang');
const styleMode = document.getElementById('styleMode');
const backendUrl = document.getElementById('backendUrl');
const saveBackendBtn = document.getElementById('saveBackendBtn');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadTxtBtn = document.getElementById('downloadTxtBtn');
const downloadSrtBtn = document.getElementById('downloadSrtBtn');

let currentResult = {
  transcript: '',
  translation: '',
  srt: ''
};

const HISTORY_KEY = 'viralvoice-history';
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

translateBtn.addEventListener('click', async () => {
  const file = mediaFile.files[0];
  const backend = backendUrl.value.trim();

  if (!backend) {
    alert('Ajoute ton URL backend');
    return;
  }

  if (!file) {
    alert('Choisis un fichier');
    return;
  }

  try {
    statusCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    statusText.textContent = 'Envoi du fichier...';

    const formData = new FormData();
    formData.append('media', file);
    formData.append('targetLanguage', targetLang.value);
    formData.append('styleMode', styleMode.value);

    const response = await fetch(`${backend}/api/translate`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Erreur serveur');
    }

    statusText.textContent = 'Génération des sous-titres...';

    const data = await response.json();

    currentResult = {
      transcript: data.transcript || '',
      translation: data.translation || '',
      srt: data.srt || ''
    };

    outputText.value = currentResult.translation;

    resultCard.classList.remove('hidden');

    saveHistory({
      fileName: file.name,
      language: targetLang.value,
      date: new Date().toLocaleString(),
      translation: currentResult.translation
    });

    renderHistory();

  } catch (error) {
    console.error(error);
    alert('Erreur pendant la traduction');
  } finally {
    statusCard.classList.add('hidden');
  }
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(outputText.value);
  alert('Texte copié');
});

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

downloadTxtBtn.addEventListener('click', () => {
  downloadFile(outputText.value, 'viralvoice-traduction.txt', 'text/plain');
});

downloadSrtBtn.addEventListener('click', () => {
  downloadFile(currentResult.srt, 'viralvoice-sous-titres.srt', 'text/plain');
});

const tabs = document.querySelectorAll('.tab');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(btn => btn.classList.remove('active'));
    tab.classList.add('active');

    const mode = tab.dataset.tab;

    if (mode === 'translation') {
      outputText.value = currentResult.translation;
    }

    if (mode === 'transcript') {
      outputText.value = currentResult.transcript;
    }

    if (mode === 'srt') {
      outputText.value = currentResult.srt;
    }
  });
});

function saveHistory(item) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

  historyList.innerHTML = '';

  if (!history.length) {
    historyList.innerHTML = '<p class="hint">Aucun historique</p>';
    return;
  }

  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';

    div.innerHTML = `
      <strong>${item.fileName}</strong>
      <small>${item.language} • ${item.date}</small>
    `;

    historyList.appendChild(div);
  });
}

clearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.error(error);
    }
  });
}

renderHistory();
