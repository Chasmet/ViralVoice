const path = require('path');
const config = require('./config');
const media = require('./media');
const mediaExtra = require('./media-extra');
const speech = require('./speech-sync');
const realtime = require('./realtime-translate');

function chooseRoute({ speakers, targetLanguage }) {
  const realtimeSupported = realtime.supportsTargetLanguage(targetLanguage);

  if (realtimeSupported && speakers.length > 1) {
    return {
      id: 'realtime-multispeaker',
      label: 'Doublage automatique multi-voix',
      reason: `${speakers.length} intervenants détectés : adaptation vocale dynamique OpenAI.`
    };
  }

  if (realtimeSupported) {
    return {
      id: 'realtime-single-speaker',
      label: 'Doublage automatique rapide',
      reason: 'Une voix détectée et langue compatible avec la traduction vocale directe.'
    };
  }

  return {
    id: speakers.length > 1
      ? 'segmented-multispeaker-language-fallback'
      : 'segmented-language-fallback',
    label: speakers.length > 1
      ? 'Doublage multi-intervenants synchronisé'
      : 'Doublage synchronisé compatible langue',
    reason: 'Langue cible non disponible sur Realtime Translate : moteur OpenAI segmenté utilisé automatiquement.'
  };
}

async function runRealtimeAdaptive({
  sourceAudioPath,
  segments,
  targetLanguage,
  duration,
  timelinePath,
  silentPath,
  finalAudioPath,
  voiceVolume,
  createdFiles,
  jobId
}) {
  const prepared = [];
  const translated = [];
  const speakerProfiles = {};
  const voiceMap = {};

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const slotDuration = Math.max(0.25, segment.end - segment.start);
    const sourceSegmentPath = path.join(config.WORK_DIR, `${jobId}-${index}-rt-source.mp3`);
    const translatedRawPath = path.join(config.WORK_DIR, `${jobId}-${index}-rt-raw.wav`);
    const translatedFitPath = path.join(config.WORK_DIR, `${jobId}-${index}-rt-fit.wav`);
    createdFiles.push(sourceSegmentPath, translatedRawPath, translatedFitPath);

    await mediaExtra.extractAudioSegmentExact(
      sourceAudioPath,
      sourceSegmentPath,
      segment.start,
      slotDuration
    );

    const result = await realtime.translateSegment({
      inputPath: sourceSegmentPath,
      targetLanguage,
      outputPath: translatedRawPath,
      workPrefix: path.join(config.WORK_DIR, `${jobId}-${index}`),
      jobId
    });

    await media.fitVoiceToDuration(
      translatedRawPath,
      translatedFitPath,
      slotDuration
    );

    const translatedText = result.transcript || segment.text;
    const item = {
      ...segment,
      translatedText,
      delivery: 'adaptation vocale directe',
      pace: 'auto',
      wordBudget: speech.calculateWordBudget(slotDuration)
    };

    translated.push(item);
    prepared.push({
      ...item,
      voice: 'dynamic-source-adaptation',
      voiceEngine: result.engine,
      voiceProfile: 'source-adapted',
      audioPath: translatedFitPath
    });

    if (!speakerProfiles[segment.speaker]) {
      speakerProfiles[segment.speaker] = {
        profile: 'source-adapted',
        confidence: 1,
        source: 'realtime-translate'
      };
      voiceMap[segment.speaker] = 'dynamic-source-adaptation';
    }

    console.log(
      `[${jobId}] AUTO REALTIME ${index + 1}/${segments.length} ` +
      `${segment.speaker} ${segment.start.toFixed(2)}-${segment.end.toFixed(2)} ${result.engine}`
    );
  }

  await media.createSilentAudio(silentPath, duration);
  await media.renderSpeakerTimeline(silentPath, prepared, timelinePath, duration);
  await media.normalizeVoice(timelinePath, finalAudioPath, voiceVolume);

  return {
    translated,
    prepared,
    voiceMap,
    voiceEngines: [config.REALTIME_TRANSLATE_MODEL],
    voiceFallbackSegments: 0,
    syncMode: 'realtime-translate-speaker-timeline',
    translationModel: config.REALTIME_TRANSLATE_MODEL,
    audioDubModel: config.REALTIME_TRANSLATE_MODEL,
    speakerProfiles
  };
}

async function runSegmentedPremium({
  segments,
  speakers,
  speakerProfiles,
  options,
  duration,
  timelinePath,
  silentPath,
  finalAudioPath,
  createdFiles,
  jobId
}) {
  const translated = await speech.translateTimedSegments(
    segments,
    options.targetLanguage,
    jobId
  );

  const voiceMap = speech.buildSpeakerVoiceMap({
    speakers,
    speakerProfiles,
    ...options
  });

  const prepared = [];
  const voiceEngines = new Set();
  let voiceFallbackSegments = 0;

  for (let index = 0; index < translated.length; index += 1) {
    const segment = translated[index];
    const slotDuration = Math.max(0.25, segment.end - segment.start);
    const rawPath = path.join(config.WORK_DIR, `${jobId}-${index}-raw.wav`);
    const fitPath = path.join(config.WORK_DIR, `${jobId}-${index}-fit.wav`);
    createdFiles.push(rawPath, fitPath);

    const voice = voiceMap[segment.speaker] || options.selectedVoice;
    const role = speech.getSpeakerRole(
      segment.speaker,
      speakers,
      options.firstSpeakerRole,
      speakerProfiles
    );

    const voiceResult = await speech.generateVoiceSegment({
      text: segment.translatedText,
      voice,
      outputPath: rawPath,
      slotDuration,
      role,
      delivery: segment.delivery,
      pace: segment.pace
    });

    voiceEngines.add(voiceResult.engine);
    if (voiceResult.fallback) voiceFallbackSegments += 1;

    await media.fitVoiceToDuration(rawPath, fitPath, slotDuration);
    prepared.push({
      ...segment,
      voice,
      voiceEngine: voiceResult.engine,
      voiceProfile: speakerProfiles[segment.speaker]?.profile || 'neutral',
      audioPath: fitPath
    });

    console.log(
      `[${jobId}] SEGMENT ${index + 1}/${translated.length} ` +
      `${segment.speaker} ${segment.start.toFixed(2)}-${segment.end.toFixed(2)} ` +
      `${role}/${voice}/${voiceResult.engine} ` +
      `words=${speech.countWords(segment.translatedText)}/${segment.wordBudget}`
    );
  }

  await media.createSilentAudio(silentPath, duration);
  await media.renderSpeakerTimeline(silentPath, prepared, timelinePath, duration);
  await media.normalizeVoice(timelinePath, finalAudioPath, options.voiceVolume);

  return {
    translated,
    prepared,
    voiceMap,
    voiceEngines: [...voiceEngines],
    voiceFallbackSegments,
    syncMode: 'duration-adapted-speaker-segments',
    translationModel: config.TEXT_MODEL,
    audioDubModel: config.AUDIO_DUB_MODEL,
    speakerProfiles
  };
}

module.exports = {
  chooseRoute,
  runRealtimeAdaptive,
  runSegmentedPremium
};
