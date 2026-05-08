# ViralVoice

ViralVoice est une application mobile-first pour créer un doublage IA à partir d’une vidéo ou d’un audio.

## Ce que fait la V1

- Upload vidéo ou audio depuis téléphone
- Transcription de la voix originale
- Traduction dans la langue choisie
- Génération d’une nouvelle voix IA
- Export audio doublé
- Export vidéo doublée si le fichier source est une vidéo
- Voix originale baissée en fond

## Limite claire

La V1 ne fait pas encore de synchronisation labiale parfaite. Pour ça, il faudra brancher ensuite Sync30 ou un moteur lip-sync.

## Déploiement Render

1. Crée un nouveau Web Service sur Render
2. Connecte le dépôt GitHub `Chasmet/ViralVoice`
3. Mets ces paramètres :
   - Build Command : `npm install`
   - Start Command : `npm start`
4. Ajoute la variable d’environnement :
   - `OPENAI_API_KEY` = ta clé API OpenAI
5. Déploie
6. Ouvre l’URL Render
7. Clique sur Tester dans l’application

## Utilisation depuis GitHub Pages

1. Ouvre l’application GitHub Pages
2. Colle l’URL Render dans le champ Backend
3. Clique sur Sauvegarder
4. Clique sur Tester
5. Choisis une vidéo ou un audio
6. Choisis la langue
7. Clique sur Créer le doublage

## Fichiers

- `index.html` : interface mobile
- `style.css` : design mobile
- `script.js` : logique côté téléphone
- `server.js` : backend Render avec OpenAI et FFmpeg
- `package.json` : dépendances Render
- `manifest.json` : installation mobile
- `sw.js` : cache simple PWA

## Variables optionnelles Render

- `OPENAI_TRANSCRIBE_MODEL` : par défaut `whisper-1`
- `OPENAI_TEXT_MODEL` : par défaut `gpt-4o-mini`
- `OPENAI_TTS_MODEL` : par défaut `gpt-4o-mini-tts`
- `MAX_FILE_SIZE` : par défaut 80 MB
