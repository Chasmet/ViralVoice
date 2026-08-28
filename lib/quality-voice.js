const fs = require('fs');
const OpenAI = require('openai');
const config = require('./config');
const speech = require('./speech-sync');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-key' });

function roleInstruction(role) {
  if (role === 'male') return 'une voix masculine naturelle et crédible';
  if (role === 'female') return 'une voix féminine naturelle et crédible';
  return 'une voix naturelle, distincte et cohérente';
}

function cleanDelivery(value) {
  const text = String(value || '').trim();
  return text || 'naturel et fidèle au dialogue';
}

function cleanPace(value) {
  const pace = String(value || '').trim().toLowerCase();
  if (pace === 'slow' || pace === 'fast') return pace;
  return 'normal';
}

async function generateWithSourceReference(options) {
  const {
    text,
    voice,
    outputPath,
    slotDuration,
    role,
    delivery,
    pace,
    sourceAudioPath
  } = options;

  if (!sourceAudioPath || !fs.existsSync(sourceAudioPath)) {
    throw new Error('Référence audio source indisponible.');
  }

  const sourceAudio = fs.readFileSync(sourceAudioPath).toString('base64');
  const completion = await openai.chat.completions.create({
    model: config.AUDIO_DUB_MODEL,
    modalities: ['text', 'audio'],
    audio: { voice, format: 'wav' },
    store: false,
    messages: [
      {
        role: 'system',
        content:
          'Tu réalises un doublage professionnel. L’extrait audio fourni est une référence de jeu. ' +
          'Prononce uniquement la réplique traduite demandée. Conserve autant que possible la prosodie, ' +
          'le rythme, l’énergie, les pauses, l’intensité et l’émotion de la source, tout en utilisant ' +
          'la voix de sortie demandée. Ne rajoute aucun commentaire, bruit, préambule ou mot.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Réplique exacte à prononcer : ${String(text || '').trim()}\n` +
              `Rendu vocal : ${roleInstruction(role)}.\n` +
              `Intention : ${cleanDelivery(delivery)}.\n` +
              `Débit : ${cleanPace(pace)}.\n` +
              `Durée visée : environ ${Number(slotDuration || 0).toFixed(2)} secondes.\n` +
              'Écoute l’extrait source ci-dessous avant de générer le doublage.'
          },
          {
            type: 'input_audio',
            input_audio: {
              data: sourceAudio,
              format: 'mp3'
            }
          }
        ]
      }
    ]
  });

  const encoded = completion.choices?.[0]?.message?.audio?.data;
  if (!encoded) {
    throw new Error('Le moteur audio guidé n’a renvoyé aucun son.');
  }

  fs.writeFileSync(outputPath, Buffer.from(encoded, 'base64'));
  return {
    engine: `${config.AUDIO_DUB_MODEL}-source-reference`,
    fallback: false,
    sourceReference: true
  };
}

async function generateVoiceSegment(options) {
  if (options.sourceAudioPath) {
    try {
      return await generateWithSourceReference(options);
    } catch (error) {
      console.warn('QUALITY SOURCE REFERENCE FALLBACK', error.message || error);
    }
  }

  const fallback = await speech.generateVoiceSegment(options);
  return {
    ...fallback,
    sourceReference: false
  };
}

module.exports = {
  generateVoiceSegment
};
