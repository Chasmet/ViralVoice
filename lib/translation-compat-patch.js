const OpenAI = require('openai');
const config = require('./config');
const speechSync = require('./speech-sync');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-key' });
const ALLOWED_REASONING = new Set(['none', 'low', 'medium', 'high', 'xhigh']);

function reasoningEffort() {
  const value = String(config.TEXT_REASONING_EFFORT || 'low').toLowerCase();
  return ALLOWED_REASONING.has(value) ? value : 'low';
}

function jsonMessages(messages) {
  const list = Array.isArray(messages) ? messages.map(message => ({ ...message })) : [];
  const hasJsonWord = list.some(message => {
    const content = typeof message.content === 'string' ? message.content : '';
    return /json/i.test(content);
  });
  if (!hasJsonWord) {
    list.unshift({
      role: 'system',
      content: 'Réponds uniquement avec un objet JSON valide, sans markdown ni texte autour.'
    });
  }
  return list;
}

async function createJsonCompletion({ messages, jobId, label, maxCompletionTokens = 12000 }) {
  const safeMessages = jsonMessages(messages);
  const primary = {
    model: config.TEXT_MODEL,
    reasoning_effort: reasoningEffort(),
    response_format: { type: 'json_object' },
    max_completion_tokens: maxCompletionTokens,
    messages: safeMessages
  };

  try {
    return await openai.chat.completions.create(primary);
  } catch (primaryError) {
    console.warn(`[${jobId}] ${label} PRIMARY FALLBACK`, primaryError.message || primaryError);
    try {
      return await openai.chat.completions.create({
        model: config.TEXT_FALLBACK_MODEL,
        reasoning_effort: reasoningEffort(),
        response_format: { type: 'json_object' },
        max_completion_tokens: maxCompletionTokens,
        messages: safeMessages
      });
    } catch (fallbackError) {
      console.warn(`[${jobId}] ${label} LEGACY FALLBACK`, fallbackError.message || fallbackError);
      return openai.chat.completions.create({
        model: config.TEXT_LEGACY_FALLBACK_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_completion_tokens: maxCompletionTokens,
        messages: safeMessages
      });
    }
  }
}

function normalizeDelivery(value) {
  const text = String(value || 'naturel et fidèle au dialogue')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 120);
  return text || 'naturel et fidèle au dialogue';
}

function normalizePace(value) {
  const pace = String(value || '').toLowerCase();
  if (pace.includes('lent') || pace.includes('slow')) return 'slow';
  if (pace.includes('rapid') || pace.includes('vite') || pace.includes('fast')) return 'fast';
  return 'normal';
}

async function translateOne(text, targetLanguage, maximumSpokenWords, jobId) {
  const completion = await createJsonCompletion({
    jobId,
    label: 'SINGLE TRANSLATION',
    maxCompletionTokens: 1000,
    messages: [
      {
        role: 'system',
        content:
          'Traduis et adapte pour un doublage oral. Respecte strictement la limite de mots. ' +
          'Réponds uniquement avec un JSON valide au format {"text":"..."}.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          targetLanguage,
          maximumSpokenWords,
          text: String(text || '').slice(0, 4000)
        })
      }
    ]
  });
  const parsed = JSON.parse(String(completion.choices?.[0]?.message?.content || '{}'));
  return String(parsed?.text || '').trim();
}

async function tightenOverlongSegments(segments, targetLanguage, jobId) {
  const overlong = segments
    .map((segment, id) => ({
      id,
      text: segment.translatedText,
      maximumSpokenWords: segment.wordBudget,
      actualWords: speechSync.countWords(segment.translatedText)
    }))
    .filter(item => item.actualWords > Math.max(item.maximumSpokenWords + 2, item.maximumSpokenWords * 1.25));

  if (!overlong.length) return segments;

  try {
    const completion = await createJsonCompletion({
      jobId,
      label: 'DUB COMPRESSION',
      maxCompletionTokens: 5000,
      messages: [
        {
          role: 'system',
          content:
            'Raccourcis les répliques de doublage sans perdre leur sens essentiel, les noms propres ' +
            'ni le ton. Respecte strictement maximumSpokenWords. Réponds uniquement avec un JSON valide ' +
            'au format {"segments":[{"id":0,"text":"..."}]} et conserve les identifiants fournis.'
        },
        {
          role: 'user',
          content: JSON.stringify({ targetLanguage, segments: overlong })
        }
      ]
    });

    const parsed = JSON.parse(String(completion.choices?.[0]?.message?.content || '{}'));
    const compressed = Array.isArray(parsed?.segments) ? parsed.segments : [];
    const byId = new Map(compressed.map(item => [Number(item.id), String(item.text || '').trim()]));
    return segments.map((segment, id) => ({
      ...segment,
      translatedText: byId.get(id) || segment.translatedText
    }));
  } catch (error) {
    console.warn(`[${jobId}] DUB COMPRESSION FALLBACK`, error.message || error);
    return segments;
  }
}

async function translateTimedSegments(segments, targetLanguage, jobId) {
  const requestedLanguage = String(targetLanguage || 'anglais').trim() || 'anglais';
  console.log(`[${jobId}] TARGET LANGUAGE ${requestedLanguage}`);

  const timingInput = segments.map((segment, id) => {
    const durationSeconds = Math.max(0.25, Number(segment.end || 0) - Number(segment.start || 0));
    return {
      id,
      speaker: segment.speaker,
      originalText: segment.text,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      maximumSpokenWords: speechSync.calculateWordBudget(durationSeconds)
    };
  });

  try {
    const completion = await createJsonCompletion({
      jobId,
      label: 'DUB ADAPTATION',
      messages: [
        {
          role: 'system',
          content:
            'Tu es adaptateur professionnel de doublage cinéma. Traduis réellement chaque réplique vers ' +
            'la langue targetLanguage demandée, sauf les noms propres. Ne laisse jamais volontairement le texte ' +
            'dans la langue source si la langue cible est différente. Réécris chaque réplique pour qu’elle soit ' +
            'naturelle à l’oral et prononçable dans sa durée. Préserve le sens, les faits, le registre, l’humour ' +
            'et l’intention. Ne dépasse pas maximumSpokenWords, sauf nom propre indispensable. Renvoie uniquement ' +
            'un JSON valide au format {"segments":[{"id":0,"text":"...","delivery":"intention brève",' +
            '"pace":"slow|normal|fast"}]}. Conserve exactement tous les identifiants, leur nombre et leur ordre.'
        },
        {
          role: 'user',
          content: JSON.stringify({ targetLanguage: requestedLanguage, segments: timingInput })
        }
      ]
    });

    const parsed = JSON.parse(String(completion.choices?.[0]?.message?.content || '{}'));
    const translated = Array.isArray(parsed?.segments) ? parsed.segments : [];
    const byId = new Map(translated.map(item => [Number(item.id), item]));
    if (byId.size !== segments.length) throw new Error('Segments adaptés incomplets.');

    let output = segments.map((segment, index) => {
      const item = byId.get(index) || {};
      const durationSeconds = Math.max(0.25, Number(segment.end || 0) - Number(segment.start || 0));
      return {
        ...segment,
        translatedText: String(item.text || '').trim() || String(segment.text || '').trim(),
        delivery: normalizeDelivery(item.delivery),
        pace: normalizePace(item.pace),
        wordBudget: speechSync.calculateWordBudget(durationSeconds)
      };
    });

    output = await tightenOverlongSegments(output, requestedLanguage, jobId);
    return output;
  } catch (error) {
    console.warn(`[${jobId}] TRANSLATION FALLBACK`, error.message || error);
    const output = [];
    for (const segment of segments) {
      const durationSeconds = Math.max(0.25, Number(segment.end || 0) - Number(segment.start || 0));
      const wordBudget = speechSync.calculateWordBudget(durationSeconds);
      let translatedText = '';
      try {
        translatedText = await translateOne(segment.text, requestedLanguage, wordBudget, jobId);
      } catch (segmentError) {
        console.warn(`[${jobId}] SINGLE TRANSLATION FALLBACK`, segmentError.message || segmentError);
      }
      output.push({
        ...segment,
        translatedText: translatedText || String(segment.text || '').trim(),
        delivery: 'naturel et fidèle au dialogue',
        pace: 'normal',
        wordBudget
      });
    }
    return output;
  }
}

speechSync.translateTimedSegments = translateTimedSegments;

console.log('[TRANSLATION COMPAT] OpenAI JSON + reasoning effort compatibles · traduction cible renforcée');

module.exports = {
  translateTimedSegments
};
