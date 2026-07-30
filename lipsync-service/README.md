# ViralVoice LipSync GPU

Microservice GPU qui reçoit une vidéo et la piste audio doublée, exécute MuseTalk 1.5, puis renvoie un MP4 dont les lèvres suivent l'audio.

## Démarrage GPU

```bash
docker compose -f docker-compose.gpu.yml up --build
```

Le premier démarrage télécharge les poids MuseTalk. Une carte NVIDIA avec au moins 4 Go de VRAM est le minimum pratique ; 8 Go ou plus est recommandé.

## Variables du backend ViralVoice

```text
LIPSYNC_SERVICE_URL=https://ton-service-gpu.example.com
LIPSYNC_SERVICE_TOKEN=le-meme-secret
LIPSYNC_TIMEOUT_MS=1500000
LIPSYNC_MAX_DURATION_SECONDS=45
LIPSYNC_REQUIRED=false
```

`LIPSYNC_REQUIRED=false` conserve automatiquement la vidéo doublée classique si le GPU est indisponible. Avec `true`, la génération échoue et les minutes sont remboursées.
