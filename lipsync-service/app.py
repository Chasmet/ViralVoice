from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from engine import MuseTalkEngine

app = FastAPI(title="ViralVoice LipSync", version="1.0.0")
engine = MuseTalkEngine()
job_lock = asyncio.Semaphore(int(os.getenv("MAX_CONCURRENT_JOBS", "1")))
api_token = os.getenv("LIPSYNC_SERVICE_TOKEN", "")
max_upload_bytes = int(os.getenv("MAX_UPLOAD_MB", "120")) * 1024 * 1024


def require_token(authorization: str | None) -> None:
    if not api_token:
        return
    if authorization != f"Bearer {api_token}":
        raise HTTPException(status_code=401, detail="Jeton lip-sync invalide.")


@app.get("/health")
def health() -> dict:
    ready, detail = engine.readiness()
    return {
        "ok": True,
        "ready": ready,
        "engine": "musetalk-v1.5",
        "gpu": engine.gpu_name(),
        "detail": detail,
    }


@app.post("/v1/lipsync")
async def lipsync(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    audio: UploadFile = File(...),
    quality: str = Form("balanced"),
    bbox_shift: int = Form(0),
    extra_margin: int = Form(10),
    authorization: str | None = Header(default=None),
) -> FileResponse:
    require_token(authorization)
    if quality not in {"fast", "balanced", "quality"}:
        raise HTTPException(status_code=400, detail="Qualité lip-sync invalide.")
    if not (video.content_type or "").startswith("video/"):
        raise HTTPException(status_code=400, detail="Le fichier source doit être une vidéo.")
    if not (audio.content_type or "").startswith("audio/"):
        raise HTTPException(status_code=400, detail="La piste doublée doit être un audio.")

    job_dir = Path(tempfile.mkdtemp(prefix="viralvoice-lipsync-"))
    video_path = job_dir / "input.mp4"
    audio_path = job_dir / "input-audio"
    output_path = job_dir / f"viralvoice-lipsync-{uuid.uuid4().hex[:8]}.mp4"

    try:
        await save_upload(video, video_path)
        await save_upload(audio, audio_path)
        async with job_lock:
            await asyncio.to_thread(
                engine.run,
                video_path=video_path,
                audio_path=audio_path,
                output_path=output_path,
                work_dir=job_dir,
                quality=quality,
                bbox_shift=bbox_shift,
                extra_margin=extra_margin,
            )
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    background_tasks.add_task(shutil.rmtree, job_dir, True)
    return FileResponse(
        path=output_path,
        media_type="video/mp4",
        filename="viralvoice-lipsync.mp4",
        background=background_tasks,
    )


async def save_upload(upload: UploadFile, target: Path) -> None:
    written = 0
    with target.open("wb") as output:
        while chunk := await upload.read(1024 * 1024):
            written += len(chunk)
            if written > max_upload_bytes:
                raise HTTPException(status_code=413, detail="Fichier trop lourd pour le moteur lip-sync.")
            output.write(chunk)
    await upload.close()
