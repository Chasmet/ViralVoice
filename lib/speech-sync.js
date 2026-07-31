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

function pickRepresentativeSegment(segments, speaker) {
  const candidates = segments
    .filter(segment => segment.speaker === speaker)
    .map(segment => ({
      ...segment,
      duration: Math.max(0, segment.end - segment.start)
    }))
    .filter(segment => segment.duration >= 0.8)
    .sort((a, b) => b.duration - a.duration || a.start - b.start);

  const selected = candidates[0];
  if (!selected) return null;

  const duration = clamp(selected.duration, 1, 7);
  const start = Math.max(0, selected.start + Math.max(0, (selected.duration - duration) / 2));
  return { start, duration };
}

async function classifyVoiceProfile(audioPath, speaker, jobId) {
  try {
    const encodedAudio = fs.readFileSync(audioPath).toString('base64');
    const completion = await openai.chat.completions.create({
      model: config.VOICE_PROFILE_MODEL,
      temperature: 0,
      max_completion_tokens: 80,
      messages: [
        {
          role: 'system',
          content:
            'Analyse uniquement la présentation vocale perçue dans le court extrait, ' +
            'pas l’identité ni le genre déclaré de la personne. Classe le timbre en ' +
            'masculine, feminine ou neutral selon la hauteur, la résonance et le timbre. ' +
            'En cas de doute, de musique forte ou de chevauchement, choisis neutral. ' +
            'Réponds uniquement avec un JSON valide : ' +
            '{"profile":"masculine|feminine|neutral","confidence":0.0}.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Intervenant ${speaker}. Donne uniquement le profil vocal perçu.`
            },
            {
              type: 'input_audio',
              input_audio: {
                data: encodedAudio,
                format: 'mp3'
              }
            }
          ]
        }
      ]
    });

    const raw = String(completion.choices?.[0]?.message?.content || '').trim();
    const parsed = parseProfileJson(raw);
    console.log(
      `[${jobId}] VOICE PROFILE ${speaker}=${parsed.profile} ` +
      `confidence=${parsed.confidence.toFixed(2)}`
    );
    return parsed;
  } catch (error) {
    console.warn(`[${jobId}] VOICE PROFILE FALLBACK ${speaker}`, error.message || error);
    return { profile: 'neutral', confidence: 0, source: 'fallback' };
  }
}

function parseProfileJson(raw) {
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }

  const profile = normalizeVoiceProfile(parsed?.profile || raw);
  const confidence = clamp(Number(parsed?.confidence || 0), 0, 1);
  if (confidence < 0.55) {
    return { profile: 'neutral', confidence, source: 'audio-ai' };
  }
  return { profile, confidence, source: 'audio-ai' };
}

function normalizeVoiceProfile(value) {
  const clean = String(value || '').toLowerCase();
  if (clean.includes('femin')) return 'feminine';
  if (clean.includes('mascul')) return 'masculine';
  return 'neutral';
}

function reconcileSpeakerProfiles(profiles, speakers) {
  const output = {};
  speakers.forEach(speaker => {
    const value = profiles[speaker] || {};
    output[speaker] = {
      profile: normalizeVoiceProfile(value.profile),
      confidence: clamp(Number(value.confidence || 0), 0, 1),
      source: value.source || 'audio-ai'
    };
  });
  return output;
}

function buildManualSpeakerProfiles(speakers, firstSpeakerRole) {
  const output = {};
  if (!speakers.length) return output;

  if (firstSpeakerRole === 'female' || firstSpeakerRole === 'male') {
    const firstProfile = firstSpeakerRole === 'female' ? 'feminine' : 'masculine';
    const secondProfile = firstProfile === 'feminine' ? 'masculine' : 'feminine';
    speakers.forEach((speaker, index) => {
      output[speaker] = {
        profile: index === 0 ? firstProfile : index === 1 ? secondProfile : 'neutral',
        confidence: index < 2 ? 1 : 0,
        source: 'manual'
      };
    });
  } else {
    speakers.forEach(speaker => {
      output[speaker] = { profile: 'neutral', confidence: 0, source: 'fallback' };
    });
  }

  return output;
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
    speakers, multiVoiceRequested, selectedVoice, maleVoice, femaleVoice,
    firstSpeakerRole, speakerProfiles = {}
  } = options;
  const map = {};

  if (!multiVoiceRequested || speakers.length <= 1) {
    speakers.forEach(speaker => {
      const profile = speakerProfiles[speaker]?.profile;
      if (profile === 'feminine') map[speaker] = femaleVoice;
      else if (profile === 'masculine') map[speaker] = maleVoice;
      else map[speaker] = selectedVoice;
    });
    return map;
  }

  const manualProfiles = buildManualSpeakerProfiles(speakers, firstSpeakerRole);
  speakers.forEach((speaker, index) => {
    const detected = speakerProfiles[speaker]?.profile || manualProfiles[speaker]?.profile || 'neutral';
    if (detected === 'feminine') {
      map[speaker] = femaleVoice;
    } else if (detected === 'masculine') {
      map[speaker] = maleVoice;
    } else {
      const neutralCycle = [selectedVoice, 'marin', 'sage', 'verse', 'ash', 'alloy'];
      map[speaker] = neutralCycle[index % neutralCycle.length];
    }
  });
  return map;
}

function getSpeakerRole(speaker, speakers, firstSpeakerRole, speakerProfiles = {}) {
  const detected = speakerProfiles[speaker]?.profile;
  if (detected === 'feminine') return 'female';
  if (detected === 'masculine') return 'male';

  const index = speakers.indexOf(speaker);
  if (firstSpeakerRole === 'female') {
    if (index === 0) return 'female';
    if (index === 1) return 'male';
  }
  if (firstSpeakerRole === 'male') {
    if (index === 0) return 'male';
    if (index === 1) return 'female';
  }
  return 'neutral';
}

async function generateVoiceSegment({ text, voice, outputPath, slotDuration, role }) {
  const roleInstruction = role === 'male'
    ? 'Utilise un timbre masculin naturel, adulte et crédible.'
    : role === 'female'
      ? 'Utilise un timbre féminin naturel, adulte et crédible.'
      : 'Utilise un timbre naturel distinct et cohérent.';
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
  pickRepresentativeSegment,
  classifyVoiceProfile,
  reconcileSpeakerProfiles,
  buildManualSpeakerProfiles,
  translateTimedSegments,
  buildSpeakerVoiceMap,
  getSpeakerRole,
  generateVoiceSegment
};
