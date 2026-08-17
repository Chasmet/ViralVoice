const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

// Tarifs de référence en USD par million de tokens.
// Les chemins sans usage détaillé sont volontairement estimés séparément plus bas.
const MODEL_PRICES = {
  'gpt-4o-transcribe-diarize': {
    textInput: 2.5,
    textOutput: 10,
    audioInput: 2.5,
    audioOutput: 10
  },
  'gpt-4o-transcribe': {
    textInput: 2.5,
    textOutput: 10,
    audioInput: 2.5,
    audioOutput: 10
  },
  'gpt-5.6-luna': {
    textInput: 0.2,
    textOutput: 1.2
  },
  'gpt-4o-mini': {
    textInput: 0.15,
    textOutput: 0.6
  },
  'gpt-audio-1.5': {
    textInput: 2.5,
    textOutput: 10,
    audioInput: 32,
    audioOutput: 64
  },
  'gpt-4o-mini-tts': {
    textInput: 0.6,
    audioOutput: 12
  },
  'gpt-4o-mini-tts-2025-12-15': {
    textInput: 0.6,
    audioOutput: 12
  }
};

const DURATION_PRICES = {
  'gpt-realtime-translate': 0.034,
  'gpt-realtime-whisper': 0.017
};

function run(meta, fn) {
  return storage.run({
    meta: { ...meta },
    items: []
  }, fn);
}

function current() {
  return storage.getStore() || null;
}

function addTokenUsage(label, model, usage) {
  const meter = current();
  if (!meter || !usage) return;

  const cleanModel = String(model || '').trim();
  const price = findTokenPrice(cleanModel);
  if (!price) {
    meter.items.push({
      label,
      model: cleanModel || 'unknown',
      type: 'tokens',
      estimatedUsd: 0,
      metered: false,
      note: 'Tarif non référencé dans le compteur.'
    });
    return;
  }

  const inputTotal = number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const outputTotal = number(usage.output_tokens ?? usage.completion_tokens ?? 0);

  const audioInput = number(
    usage.input_audio_tokens ??
    usage.input_token_details?.audio_tokens ??
    usage.prompt_tokens_details?.audio_tokens ??
    0
  );
  const audioOutput = number(
    usage.output_audio_tokens ??
    usage.output_token_details?.audio_tokens ??
    usage.completion_tokens_details?.audio_tokens ??
    0
  );

  const textInput = Math.max(0, inputTotal - audioInput);
  const textOutput = Math.max(0, outputTotal - audioOutput);

  const estimatedUsd =
    tokenCost(textInput, price.textInput) +
    tokenCost(textOutput, price.textOutput) +
    tokenCost(audioInput, price.audioInput) +
    tokenCost(audioOutput, price.audioOutput);

  meter.items.push({
    label,
    model: cleanModel,
    type: 'tokens',
    estimatedUsd,
    metered: true,
    usage: {
      textInput,
      textOutput,
      audioInput,
      audioOutput,
      inputTotal,
      outputTotal
    }
  });
}

function addDuration(label, model, seconds, options = {}) {
  const meter = current();
  if (!meter) return;

  const cleanModel = String(model || '').trim();
  const pricePerMinute = Number(options.pricePerMinute ?? DURATION_PRICES[cleanModel]);
  const cleanSeconds = Math.max(0, Number(seconds || 0));

  if (!Number.isFinite(pricePerMinute)) {
    meter.items.push({
      label,
      model: cleanModel || 'unknown',
      type: 'duration',
      seconds: cleanSeconds,
      estimatedUsd: 0,
      metered: false,
      note: 'Tarif par minute non référencé.'
    });
    return;
  }

  meter.items.push({
    label,
    model: cleanModel,
    type: 'duration',
    seconds: cleanSeconds,
    pricePerMinute,
    estimatedUsd: (cleanSeconds / 60) * pricePerMinute,
    metered: options.metered !== false,
    note: options.note || null
  });
}

function addEstimated(label, model, estimatedUsd, details = {}) {
  const meter = current();
  if (!meter) return;

  meter.items.push({
    label,
    model: String(model || '').trim() || 'unknown',
    type: 'estimate',
    estimatedUsd: Math.max(0, Number(estimatedUsd || 0)),
    metered: false,
    ...details
  });
}

function summary(durationSeconds) {
  const meter = current();
  const duration = Math.max(0, Number(durationSeconds || meter?.meta?.durationSeconds || 0));
  const items = Array.isArray(meter?.items) ? meter.items : [];
  const totalUsd = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.estimatedUsd || 0)),
    0
  );
  return buildSummary(totalUsd, duration, items);
}

// Estimation robuste disponible même lorsque certaines réponses OpenAI ne renvoient
// pas encore une ventilation de facturation exploitable. Le journal admin affiche
// explicitement « estimation » et ne prétend jamais être la facture OpenAI finale.
function estimateRouteCost({
  durationSeconds,
  route,
  speakers = 1,
  segments = 1,
  realtimeTranscription = true
}) {
  const duration = Math.max(1, Number(durationSeconds || 60));
  const minutes = duration / 60;
  const cleanRoute = String(route || 'unknown');
  const cleanSpeakers = Math.max(1, Number(speakers || 1));
  const cleanSegments = Math.max(1, Number(segments || 1));
  const items = [];

  // Diarisation initiale : ordre de grandeur prudent pour une minute de parole.
  // Le coût exact dépend des tokens audio retournés par l'API.
  const diarizationUsd = minutes * 0.006;
  items.push({
    label: 'Diarisation',
    model: 'gpt-4o-transcribe-diarize',
    type: 'estimate',
    estimatedUsd: diarizationUsd,
    metered: false
  });

  if (cleanRoute.startsWith('realtime-')) {
    // ViralVoice envoie actuellement chaque segment séparément et ajoute 0,8 s de
    // silence de fin. On plafonne cet overhead à 35 % de la durée réelle.
    const realtimeSeconds = duration + Math.min(cleanSegments * 0.8, duration * 0.35);
    const realtimeMinutes = realtimeSeconds / 60;
    const translateUsd = realtimeMinutes * DURATION_PRICES['gpt-realtime-translate'];
    items.push({
      label: 'Realtime Translate',
      model: 'gpt-realtime-translate',
      type: 'duration',
      seconds: realtimeSeconds,
      estimatedUsd: translateUsd,
      metered: false
    });

    if (realtimeTranscription) {
      const whisperUsd = realtimeMinutes * DURATION_PRICES['gpt-realtime-whisper'];
      items.push({
        label: 'Realtime Whisper',
        model: 'gpt-realtime-whisper',
        type: 'duration',
        seconds: realtimeSeconds,
        estimatedUsd: whisperUsd,
        metered: false
      });
    }
  } else {
    // Le chemin segmenté est nettement plus variable : Luna + jusqu'à 4 profils
    // vocaux + génération audio premium par segment. Ces coefficients donnent un
    // ordre de grandeur volontairement prudent pour le pilotage de marge.
    const lunaUsd = minutes * 0.001;
    const profileUsd = Math.min(cleanSpeakers, 4) * 0.0015;
    const premiumAudioUsd = minutes * 0.088;
    const segmentOverheadUsd = Math.min(0.012, cleanSegments * 0.00025);

    items.push({
      label: 'Adaptation texte',
      model: 'gpt-5.6-luna',
      type: 'estimate',
      estimatedUsd: lunaUsd,
      metered: false
    });
    items.push({
      label: 'Profils vocaux',
      model: 'gpt-audio-1.5',
      type: 'estimate',
      estimatedUsd: profileUsd,
      metered: false
    });
    items.push({
      label: 'Voix premium',
      model: 'gpt-audio-1.5',
      type: 'estimate',
      estimatedUsd: premiumAudioUsd,
      metered: false
    });
    items.push({
      label: 'Overhead segments',
      model: 'gpt-audio-1.5',
      type: 'estimate',
      estimatedUsd: segmentOverheadUsd,
      metered: false
    });
  }

  const totalUsd = items.reduce((sum, item) => sum + Number(item.estimatedUsd || 0), 0);
  return {
    ...buildSummary(totalUsd, duration, items),
    route: cleanRoute,
    speakers: cleanSpeakers,
    segments: cleanSegments
  };
}

function buildSummary(totalUsd, duration, items) {
  const minutes = duration > 0 ? duration / 60 : 0;
  return {
    estimatedUsd: round6(totalUsd),
    estimatedCents: round2(totalUsd * 100),
    costPerMinuteUsd: round6(minutes > 0 ? totalUsd / minutes : 0),
    costPerMinuteCents: round2(minutes > 0 ? (totalUsd / minutes) * 100 : 0),
    durationSeconds: round3(duration),
    meteredItems: items.filter(item => item.metered).length,
    estimatedItems: items.filter(item => !item.metered).length,
    confidence: items.some(item => !item.metered) ? 'estimated' : 'metered',
    items: items.map(item => ({
      ...item,
      estimatedUsd: round6(item.estimatedUsd)
    }))
  };
}

function findTokenPrice(model) {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const key = Object.keys(MODEL_PRICES).find(prefix => model.startsWith(prefix));
  return key ? MODEL_PRICES[key] : null;
}

function tokenCost(tokens, pricePerMillion) {
  if (!pricePerMillion) return 0;
  return (Math.max(0, Number(tokens || 0)) / 1_000_000) * pricePerMillion;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function round6(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

module.exports = {
  run,
  addTokenUsage,
  addDuration,
  addEstimated,
  summary,
  estimateRouteCost
};