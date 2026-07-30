# ViralVoice 2.0

ViralVoice est une application mobile-first de doublage IA pour vidéo et audio.

## Correction principale de la V2

L’ancienne version transcrivait toute la conversation en un seul texte, générait une seule piste TTS à partir de 0 seconde et ignorait le paramètre `multiVoice`. Cela provoquait un décalage progressif et mélangeait les interventions homme/femme.

La V2 :

- détecte les changements d’intervenant avec la diarisation ;
- conserve les horodatages de début et de fin de chaque réplique ;
- traduit les segments sans changer leur ordre ;
- attribue une voix distincte au premier et au deuxième intervenant ;
- ajuste la durée de chaque réplique à son créneau ;
- replace chaque segment vocal à son horodatage d’origine ;
- mélange ensuite la piste doublée avec l’ambiance originale.

Le premier intervenant est considéré comme un homme par défaut. L’interface permet de choisir « Femme » lorsque la vidéo commence par une femme.

## Limite restante

Cette synchronisation est une synchronisation temporelle des dialogues. Le mouvement exact des lèvres nécessite un moteur vidéo de lip-sync spécialisé.

## Backend Render

Variables obligatoires :

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET`

Variables optionnelles :

- `OPENAI_TRANSCRIBE_MODEL` : `gpt-4o-mini-transcribe`
- `OPENAI_DIARIZE_MODEL` : `gpt-4o-transcribe-diarize`
- `OPENAI_TEXT_MODEL` : `gpt-4o-mini`
- `OPENAI_TTS_MODEL` : `gpt-4o-mini-tts`
- `MAX_FILE_SIZE` : 80 MB par défaut
- `MAX_DURATION_SECONDS` : 120 secondes par défaut
- `MAX_SYNC_SEGMENTS` : 60 par défaut
- `CLEANUP_AFTER_MS` : 30 minutes par défaut

Build Command :

```bash
npm install
```

Start Command :

```bash
npm start
```

Vérification JavaScript :

```bash
npm run check
```

## Application Android

Le dossier `android/` contient une application Android native Java qui ouvre ViralVoice dans une WebView sécurisée et gère :

- la sélection de vidéos et d’audios depuis le téléphone ;
- les liens de paiement externes ;
- le téléchargement des vidéos et audios générés ;
- le bouton Retour Android.

Configuration : Java, minSdk 21, compileSdk 34, targetSdk 34.

Le workflow `.github/workflows/android-apk.yml` compile un véritable APK avec Gradle et le publie dans les Artifacts GitHub sous le nom `ViralVoice-Android-APK`.
