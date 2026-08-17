const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const config = require('./config');
const media = require('./media');

const TARGET_LANGUAGE_CODES = {
  anglais: 'en',
  english: 'en',
  français: 'fr',
  francais: 'fr',
  french: 'fr',
  espagnol: 'es',
  spanish: 'es',
  portugais: 'pt',
  portuguese: 'pt',
  italien: 'it',
  italian: 'it',
  allemand: 'de',
  german: 'de',
  japonais: 'ja',
  japanese: 'ja',
  russe: 'ru',
  russian: 'ru',
  chinois: 'zh',
  chinese: 'zh',
  coréen: 'ko',
  coreen: 'ko',
  korean: 'ko',
  hindi: 'hi',
  indonésien: 'id',
  indonesien: 'id',
  indonesian: 'id',
  vietnamien: 'vi',
  vietnamese: 'vi'
};

function targetLanguageCode(value) {
  const key = String(value || '').trim().toLowerCase();
  return TARGET_LANGUAGE_CODES[key] || null;
}

function supportsTargetLanguage(value) {
  return Boolean(targetLanguageCode(value));
}

async function translateSegment({
  inputPath,
  targetLanguage,
  outputPath,
  workPrefix,
  jobId
}) {
  const language = targetLanguageCode(targetLanguage);
  if (!language) {
    throw new Error(`Langue non prise en charge par ${config.REALTIME_TRANSLATE_MODEL}.`);
  }

  const pcmInputPath = `${workPrefix}-rt-in.pcm`;
  const pcmOutputPath = `${workPrefix}-rt-out.pcm`;

  try {
    await media.convertToRealtimePcm(inputPath, pcmInputPath);
    const pcm = fs.readFileSync(pcmInputPath);
    if (!pcm.length) throw new Error('Audio source vide pour la traduction temps réel.');

    const result = await runTranslationSession({
      pcm,
      targetLanguage: language,
      jobId
    });

    if (!result.audio.length) {
      throw new Error('Le moteur temps réel n’a renvoyé aucun audio traduit.');
    }

    fs.writeFileSync(pcmOutputPath, result.audio);
    await media.convertRealtimePcmToWav(pcmOutputPath, outputPath);

    return {
      transcript: result.outputTranscript.trim(),
      sourceTranscript: result.inputTranscript.trim(),
      engine: config.REALTIME_TRANSLATE_MODEL
    };
  } finally {
    safeDelete(pcmInputPath);
    safeDelete(pcmOutputPath);
  }
}

function runTranslationSession({ pcm, targetLanguage, jobId }) {
  return new Promise((resolve, reject) => {
    const url =
      `wss://api.openai.com/v1/realtime/translations?model=` +
      encodeURIComponent(config.REALTIME_TRANSLATE_MODEL);

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    const audioChunks = [];
    let inputTranscript = '';
    let outputTranscript = '';
    let inputFinished = false;
    let gotAudio = false;
    let settled = false;
    let lastOutputAt = Date.now();
    let hardTimeout = null;
    let idleTimer = null;

    const cleanup = () => {
      if (hardTimeout) clearTimeout(hardTimeout);
      if (idleTimer) clearInterval(idleTimer);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        // Rien à faire.
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        audio: Buffer.concat(audioChunks),
        inputTranscript,
        outputTranscript
      });
    };

    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    hardTimeout = setTimeout(() => {
      if (gotAudio) finish();
      else fail(new Error('Délai dépassé pour la traduction OpenAI temps réel.'));
    }, config.REALTIME_TRANSLATE_TIMEOUT_MS);

    idleTimer = setInterval(() => {
      if (!inputFinished || !gotAudio) return;
      if (Date.now() - lastOutputAt >= config.REALTIME_TRANSLATE_IDLE_MS) finish();
    }, 250);

    ws.on('open', async () => {
      try {
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            audio: {
              input: {
                transcription: { model: config.REALTIME_TRANSCRIBE_MODEL }
              },
              output: { language: targetLanguage }
            }
          }
        }));

        await streamPcm(ws, pcm);

        // Un court silence aide le modèle à terminer la dernière phrase.
        const tailSilence = Buffer.alloc(24000 * 2 * 0.8);
        await streamPcm(ws, tailSilence);
        inputFinished = true;
        lastOutputAt = Date.now();
      } catch (error) {
        fail(error);
      }
    });

    ws.on('message', raw => {
      let event;
      try {
        event = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (event.type === 'error') {
        const message = event.error?.message || 'Erreur OpenAI Realtime Translate.';
        fail(new Error(message));
        return;
      }

      if (event.type === 'session.output_audio.delta' && event.delta) {
        audioChunks.push(Buffer.from(event.delta, 'base64'));
        gotAudio = true;
        lastOutputAt = Date.now();
        return;
      }

      if (event.type === 'session.output_transcript.delta' && event.delta) {
        outputTranscript += event.delta;
        lastOutputAt = Date.now();
        return;
      }

      if (event.type === 'session.input_transcript.delta' && event.delta) {
        inputTranscript += event.delta;
        return;
      }

      if (
        inputFinished &&
        (event.type === 'session.output_audio.done' ||
          event.type === 'session.output_transcript.done')
      ) {
        lastOutputAt = Date.now() - config.REALTIME_TRANSLATE_IDLE_MS;
      }
    });

    ws.on('error', error => {
      console.warn(`[${jobId}] REALTIME SOCKET ERROR`, error.message || error);
      fail(error);
    });

    ws.on('close', () => {
      if (settled) return;
      if (gotAudio) finish();
      else fail(new Error('Connexion OpenAI Realtime fermée sans audio traduit.'));
    });
  });
}

async function streamPcm(ws, pcm) {
  // 200 ms de PCM16 mono 24 kHz = 9 600 octets.
  const chunkSize = 9600;

  for (let offset = 0; offset < pcm.length; offset += chunkSize) {
    const chunk = pcm.subarray(offset, Math.min(offset + chunkSize, pcm.length));

    while (ws.bufferedAmount > 2 * 1024 * 1024) {
      await delay(15);
    }

    ws.send(JSON.stringify({
      type: 'session.input_audio_buffer.append',
      audio: chunk.toString('base64')
    }));

    // Laisse respirer le socket tout en traitant les fichiers plus vite que le temps réel.
    await delay(2);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Nettoyage non bloquant.
  }
}

module.exports = {
  targetLanguageCode,
  supportsTargetLanguage,
  translateSegment
};
