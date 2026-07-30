const fs = require('fs');
const OpenAI = require('openai');
const config = require('./config');
const { clamp } = require('./utils');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-key' });

async function transcribeWithSpeakerTimeline(audioPath, duration, jobId) {
  try {
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: config.DIARIZE_MODEL,
      response_format: 'diarized_json',
      chunking_strategy: 'auto'
    });
    const segments = Array.isArray(result?.segments) ? result.segments : [];
    if (!segments.length) throw new Error('Aucun segment diarise.');
    return { mode: 'diarized', segments };
  } catch (error) {
    console.warn(`[${jobId}] DIARIZATION FALLBACK`, error.message || error);
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: config.TRANSCRIBE_MODEL,
      response_format: 'json'
    });
    const text = String(result?.text || result || '').trim();
    return {
      mode: 'single-speaker-fallback',
      warning: 'Détection des intervenants indisponible : une voix unique a été utilisée.',
      segments: text ? [{ id: 'fallback-0', start: 0, end: duration, speaker: 'A', text }] : []
    };
  }
}

function normalizeSegments(rawSegments, totalDuration) {
  return rawSegments
    .map((segment, index) => {
      const start = clamp(Number(segment.start || 0), 0, totalDuration);
      const end = clamp(Number(segment.end || start), start, totalDuration);
      return {
        id: String(segment.id || `segment-${index}`),
        start,
        end: Math.max(end, Math.min(totalDuration, start + 0.25)),
        speaker: String(segment.speaker || 'A').trim().slice(0, 24) || 'A',
        text: String(segment.text || '').trim()
      };
    })
    .filter(segment => segment.text && segment.end > segment.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function mergeAdjacentSpeakerSegments(segments) {
  const merged = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    const gap = previous ? segment.start - previous.end : Infinity;
    if (
      previous && previous.speaker === segment.speaker && gap >= -0.05 &&
      gap <= 0.35 && segment.end - previous.start <= 12
    ) {
      previous.end = Math.max(previous.end, segment.end);
      previous.text = `${previous.text} ${segment.text}`.trim();
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function limitSegmentCount(segments, maxSegments) {
  const limited = segments.map(segment => ({ ...segment }));
  while (limited.length > maxSegments) {
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let index = 0; index < limited.length - 1; index += 1) {
      const current = limited[index];
      const next = limited[index + 1];
      const score = Math.max(0, next.start - current.end) +
        (current.speaker === next.speaker ? 0 : 5);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const current = limited[bestIndex];
    const next = limited[bestIndex + 1];
    limited.splice(bestIndex, 2, {
      id: `${current.id}+${next.id}`,
      start: current.start,
      end: next.end,
      speaker: current.speaker,
      text: `${current.text} ${next.text}`.trim()
    });
  }
  return limited;
}

async function translateTimedSegments(segments, targetLanguage, jobId) {
  try {
    const completion = await openai.chat.completions.create({
      model: config.TEXT_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Traduis pour un doublage vidéo. Réponds seulement avec un JSON valide ' +
            '{"segments":[{"id":0,"text":"..."}]}. Conserve exactement les identifiants, ' +
            'le nombre et l’ordre. Style oral naturel et longueur proche de l’original.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            targetLanguage,
            segments: segments.map((segment, id) => ({ id, text: segment.text }))
          })
        }
      ]
    });
    const parsed = JSON.parse(String(completion.choices?.[0]?.message?.content || ''));
    const translated = Array.isArray(parsed?.segments) ? parsed.segments : [];
    const byId = new Map(translated.map(item => [Number(item.id), String(item.text || '').trim()]));
    if (byId.size !== segments.length) throw new Error('Segments traduits incomplets.');
    return segments.map((segment, index) => ({
      ...segment,
      translatedText: byId.get(index) || segment.text
    }));
  } catch (error) {
    console.warn(`[${jobId}] TRANSLATION FALLBACK`, error.message || error);
    const output = [];
    for (const segment of segments) {
      output.push({
        ...segment,
        translatedText: await translateOne(segment.text, targetLanguage) || segment.text
      });
    }
    return output;
  }
}

async function translateOne(text, targetLanguage) {
  const completion = await openai.chat.completions.create({
    model: config.TEXT_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: 'Traduis pour un doublage. Réponds uniquement avec la traduction orale et concise.'
      },
      { role: 'user', content: `Traduis en ${targetLanguage}:\n\n${String(text).slice(0, 4000)}` }
    ]
  });
  return String(completion.choices?.[0]?.message?.content || '').trim();
}

function buildSpeakerVoiceMap(options) {
  const {
    speakers, multiVoiceRequested, selectedVoice, maleVoice, femaleVoice, firstSpeakerRole
  } = options;
  const map = {};
  if (!multiVoiceRequested || speakers.length <= 1) {
    speakers.forEach(speaker => { map[speaker] = selectedVoice; });
    return map;
  }
  const first = firstSpeakerRole === 'female' ? femaleVoice : maleVoice;
  const second = firstSpeakerRole === 'female' ? maleVoice : femaleVoice;
  const cycle = [first, second, 'marin', 'sage', 'verse', 'ash', 'alloy', 'nova', 'onyx']
    .filter((voice, index, array) => array.indexOf(voice) === index);
  speakers.forEach((speaker, index) => { map[speaker] = cycle[index % cycle.length]; });
  return map;
}

function getSpeakerRole(speaker, speakers, firstSpeakerRole) {
  const index = speakers.indexOf(speaker);
  if (index === 0) return firstSpeakerRole;
  if (index === 1) return firstSpeakerRole === 'female' ? 'male' : 'female';
  return 'neutral';
}

async function generateVoiceSegment({ text, voice, outputPath, slotDuration, role }) {
  const roleInstruction = role === 'male'
    ? 'Utilise un timbre masculin naturel.'
    : role === 'female'
      ? 'Utilise un timbre féminin naturel.'
      : 'Utilise un timbre naturel distinct.';
  const speech = await openai.audio.speech.create({
    model: config.TTS_MODEL,
    voice,
    input: String(text || '').trim().slice(0, 4000),
    instructions:
      `${roleInstruction} Parle clairement, sans préambule et avec l’émotion du dialogue. ` +
      `La réplique doit tenir environ ${slotDuration.toFixed(2)} secondes.`,
    response_format: 'wav'
  });
  fs.writeFileSync(outputPath, Buffer.from(await speech.arrayBuffer()));
}

module.exports = {
  transcribeWithSpeakerTimeline,
  normalizeSegments,
  mergeAdjacentSpeakerSegments,
  limitSegmentCount,
  translateTimedSegments,
  buildSpeakerVoiceMap,
  getSpeakerRole,
  generateVoiceSegment
};
