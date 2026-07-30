#!/usr/bin/env bash
set -euo pipefail

cd "${MUSETALK_DIR:-/opt/MuseTalk}"

if [[ ! -f models/musetalkV15/unet.pth ]]; then
  echo "Téléchargement des poids MuseTalk 1.5..."
  bash ./download_weights.sh
fi

cd /app
exec uvicorn app:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
