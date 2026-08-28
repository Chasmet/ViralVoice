const path = require('path');
const config = require('./config');
const media = require('./media');
const mediaExtra = require('./media-extra');
const speech = require('./speech-sync');
const realtime = require('./realtime-translate');
const qualityVoice = require('./quality-voice');
const fastFinalize = require('./fast-finalize');

const VOICE_API_CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(config.VOICE_SEGMENT_CONCURRENCY || 3) + 1)
);
const AUDIO_FIT_CONCURRENCY = 2;

function chooseRoute({ speakers, targetLanguage }) {
  const realtimeSupported = realtime.supportsTargetLanguage(targetLanguage);

  if (speakers.length > 1) {
    return {
      id: 'segmented-multispeaker-quality',
      label: 'Doublage multi-voix haute qualité rapide',
      reason:
        `${speakers.length} intervenants détectés : moteur OpenAI premium ` +
        `avec jusqu’à ${VOICE_API_CONCURRENCY} générations vocales en parallèle.`,
      realtimeFallbackAvailable: realtimeSupported
    };
  }

  return {
    id: 'segmented-single-speaker-quality',
    label: 'Doublage haute qualité rapide',
    reason:
      'Priorité au moteur OpenAI premium avec référence de la voix source et ' +
      `jusqu’à ${VOICE_API_CONCURRENCY} générations vocales en parallèle.`,
    realtimeFallbackAvailable: realtimeSupported
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    () => (async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })()
  );
  await Promise.all(workers);
  return results;
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
  const startedAt = Date.now();
  const speakerProfiles = {};
  const voiceMap = {};
  const realtimeConcurrency = Math.min(2, config.VOICE_SEGMENT_CONCURRENCY);

  const prepared = await mapWithConcurrency(
    segments,
    realtimeConcurrency,
    async (segment, index) => {
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
        wordBudget: speech.calculateWordBudget(slotDuration),
        voice: 'dynamic-source-adaptation',
        voiceEngine: result.engine,
        voiceProfile: 'source-adapted',
        audioPath: translatedFitPath
      };

      console.log(
        `[${jobId}] AUTO REALTIME ${index + 1}/${segments.length} ` +
        `${segment.speaker} ${segment.start.toFixed(2)}-${segment.end.toFixed(2)} ${result.engine}`
      );
      return item;
    }
  );

  const generationMs = Date.now() - startedAt;

  for (const segment of segments) {
    if (!speakerProfiles[segment.speaker]) {
      speakerProfiles[segment.speaker] = {
        profile: 'source-adapted',
        confidence: 1,
        source: 'realtime-translate'
      };
      voiceMap[segment.speaker] = 'dynamic-source-adaptation';
    }
  }

  const translated = prepared.map(item => ({
    id: item.id,
    start: item.start,
    end: item.end,
    speaker: item.speaker,
    text: item.text,
    translatedText: item.translatedText,
    delivery: item.delivery,
    pace: item.pace,
    wordBudget: item.wordBudget
  }));

  const finalizeStartedAt = Date.now();
  await fastFinalize.finalizeTimeline({
    segments: prepared,
    outputPath: finalAudioPath,
    totalDuration: duration,
    voiceVolume,
    silentPath,
    timelinePath,
    jobId
  });
  const finalizeMs = Date.now() - finalizeStartedAt;

  console.log(
    `[${jobId}] PERF realtime-generation=${generationMs}ms ` +
    `finalize=${finalizeMs}ms total=${Date.now() - startedAt}ms`
  );

  return {
    translated,
    prepared,
    voiceMap,
    voiceEngines: [config.REALTIME_TRANSLATE_MODEL],
    voiceFallbackSegments: 0,
    syncMode: 'realtime-translate-speaker-timeline-parallel-fast-finalize',
    translationModel: config.REALTIME_TRANSLATE_MODEL,
    audioDubModel: config.REALTIME_TRANSLATE_MODEL,
    speakerProfiles,
    performanceMs: {
      realtimeGeneration: generationMs,
      finalize: finalizeMs,
      totalDubbing: Date.now() - startedAt
    }
  };
}

async function runSegmentedPremium({
  sourceAudioPath,
  segments,
  translatedSegments,
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
  const startedAt = Date.now();
  const effectiveSourceAudioPath = sourceAudioPath || path.join(
    config.WORK_DIR,
    `${jobId}-source.mp3`
  );

  const translationStartedAt = Date.now();
  const translated = Array.isArray(translatedSegments) && translatedSegments.length
    ? translatedSegments
    : await speech.translateTimedSegments(
      segments,
      options.targetLanguage,
      jobId
    );
  const translationMs = Date.now() - translationStartedAt;

  const voiceMap = speech.buildSpeakerVoiceMap({
    speakers,
    speakerProfiles,
    ...options
  });

  // Phase 1 : appels OpenAI. Ils sont principalement limités par le réseau,
  // donc on peut en lancer davantage en parallèle sans charger le CPU Render.
  const voiceApiStartedAt = Date.now();
  const generatedSegments = await mapWithConcurrency(
    translated,
    VOICE_API_CONCURRENCY,
    async (segment, index) => {
      const slotDuration = Math.max(0.25, segment.end - segment.start);
      const rawPath = path.join(config.WORK_DIR, `${jobId}-${index}-raw.wav`);
      const fitPath = path.join(config.WORK_DIR, `${jobId}-${index}-fit.wav`);
      const referencePath = path.join(config.WORK_DIR, `${jobId}-${index}-voice-reference.mp3`);
      createdFiles.push(rawPath, fitPath, referencePath);

      const voice = voiceMap[segment.speaker] || options.selectedVoice;
      const role = speech.getSpeakerRole(
        segment.speaker,
        speakers,
        options.firstSpeakerRole,
        speakerProfiles
      );

      let sourceReferencePath = null;
      try {
        await mediaExtra.extractAudioSegmentExact(
          effectiveSourceAudioPath,
          referencePath,
          segment.start,
          slotDuration
        );
        sourceReferencePath = referencePath;
      } catch (referenceError) {
        console.warn(
          `[${jobId}] VOICE REFERENCE FALLBACK ${index + 1}`,
          referenceError.message || referenceError
        );
      }

      const voiceResult = await qualityVoice.generateVoiceSegment({
        text: segment.translatedText,
        voice,
        outputPath: rawPath,
        slotDuration,
        role,
        delivery: segment.delivery,
        pace: segment.pace,
        sourceAudioPath: sourceReferencePath
      });

      return {
        segment,
        index,
        slotDuration,
        rawPath,
        fitPath,
        voice,
        role,
        voiceResult
      };
    }
  );
  const voiceApiMs = Date.now() - voiceApiStartedAt;

  // Phase 2 : FFmpeg. On limite volontairement à 2 tâches simultanées pour
  // éviter que le petit serveur Render se bloque avec trop d'encodages CPU.
  const fitStartedAt = Date.now();
  const segmentResults = await mapWithConcurrency(
    generatedSegments,
    AUDIO_FIT_CONCURRENCY,
    async generated => {
      const {
        segment,
        index,
        slotDuration,
        rawPath,
        fitPath,
        voice,
        role,
        voiceResult
      } = generated;

      await media.fitVoiceToDuration(rawPath, fitPath, slotDuration);

      console.log(
        `[${jobId}] SEGMENT ${index + 1}/${translated.length} ` +
        `${segment.speaker} ${segment.start.toFixed(2)}-${segment.end.toFixed(2)} ` +
        `${role}/${voice}/${voiceResult.engine} ` +
        `reference=${voiceResult.sourceReference ? 'yes' : 'no'} ` +
        `apiConcurrency=${VOICE_API_CONCURRENCY} fitConcurrency=${AUDIO_FIT_CONCURRENCY} ` +
        `words=${speech.countWords(segment.translatedText)}/${segment.wordBudget}`
      );

      return {
        prepared: {
          ...segment,
          voice,
          voiceEngine: voiceResult.engine,
          voiceProfile: speakerProfiles[segment.speaker]?.profile || 'neutral',
          sourceReferenceUsed: Boolean(voiceResult.sourceReference),
          audioPath: fitPath
        },
        voiceEngine: voiceResult.engine,
        fallback: Boolean(voiceResult.fallback)
      };
    }
  );
  const audioFitMs = Date.now() - fitStartedAt;

  const prepared = segmentResults.map(item => item.prepared);
  const voiceEngines = [...new Set(segmentResults.map(item => item.voiceEngine))];
  const voiceFallbackSegments = segmentResults.filter(item => item.fallback).length;

  const finalizeStartedAt = Date.now();
  await fastFinalize.finalizeTimeline({
    segments: prepared,
    outputPath: finalAudioPath,
    totalDuration: duration,
    voiceVolume: options.voiceVolume,
    silentPath,
    timelinePath,
    jobId
  });
  const finalizeMs = Date.now() - finalizeStartedAt;
  const totalDubbingMs = Date.now() - startedAt;

  console.log(
    `[${jobId}] PERF translation=${translationMs}ms voiceApi=${voiceApiMs}ms ` +
    `audioFit=${audioFitMs}ms finalize=${finalizeMs}ms totalDubbing=${totalDubbingMs}ms`
  );

  return {
    translated,
    prepared,
    voiceMap,
    voiceEngines,
    voiceFallbackSegments,
    syncMode: `quality-reference-api-${VOICE_API_CONCURRENCY}-fit-${AUDIO_FIT_CONCURRENCY}-fast-finalize`,
    translationModel: config.TEXT_MODEL,
    audioDubModel: config.AUDIO_DUB_MODEL,
    speakerProfiles,
    performanceMs: {
      translation: translationMs,
      voiceApi: voiceApiMs,
      audioFit: audioFitMs,
      finalize: finalizeMs,
      totalDubbing: totalDubbingMs
    }
  };
}

module.exports = {
  chooseRoute,
  runRealtimeAdaptive,
  runSegmentedPremium,
  mapWithConcurrency
};
