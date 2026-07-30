from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class QualityProfile:
    batch_size: int
    use_float16: bool
    max_height: int
    crf: int


QUALITY_PROFILES = {
    "fast": QualityProfile(batch_size=16, use_float16=True, max_height=720, crf=22),
    "balanced": QualityProfile(batch_size=8, use_float16=True, max_height=1080, crf=18),
    "quality": QualityProfile(batch_size=4, use_float16=False, max_height=1080, crf=16),
}


class MuseTalkEngine:
    def __init__(self) -> None:
        self.repo_dir = Path(os.getenv("MUSETALK_DIR", "/opt/MuseTalk")).resolve()
        self.python = os.getenv("MUSETALK_PYTHON", sys.executable)
        self.ffmpeg = os.getenv("FFMPEG_BIN", "ffmpeg")
        self.timeout_seconds = int(os.getenv("LIPSYNC_JOB_TIMEOUT_SECONDS", "1800"))

    def readiness(self) -> tuple[bool, str]:
        required = [
            self.repo_dir / "scripts" / "inference.py",
            self.repo_dir / "models" / "musetalkV15" / "unet.pth",
            self.repo_dir / "models" / "musetalkV15" / "musetalk.json",
            self.repo_dir / "models" / "whisper" / "config.json",
            self.repo_dir / "models" / "sd-vae" / "config.json",
            self.repo_dir / "models" / "face-parse-bisent" / "79999_iter.pth",
        ]
        missing = [str(path) for path in required if not path.exists()]
        if missing:
            return False, f"Modèles MuseTalk manquants: {', '.join(missing[:3])}"
        try:
            subprocess.run([self.ffmpeg, "-version"], check=True, capture_output=True, timeout=10)
        except Exception as exc:  # noqa: BLE001
            return False, f"FFmpeg indisponible: {exc}"
        return True, "MuseTalk 1.5 prêt"

    def gpu_name(self) -> str | None:
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                check=True,
                capture_output=True,
                text=True,
                timeout=8,
            )
            return result.stdout.strip().splitlines()[0] if result.stdout.strip() else None
        except Exception:  # noqa: BLE001
            return None

    def run(
        self,
        *,
        video_path: Path,
        audio_path: Path,
        output_path: Path,
        work_dir: Path,
        quality: str,
        bbox_shift: int,
        extra_margin: int,
    ) -> Path:
        ready, detail = self.readiness()
        if not ready:
            raise RuntimeError(detail)

        profile = QUALITY_PROFILES.get(quality, QUALITY_PROFILES["balanced"])
        prepared_video = work_dir / "source-25fps.mp4"
        prepared_audio = work_dir / "dubbed-16k.wav"
        result_dir = work_dir / "results"
        result_name = "viralvoice-lipsync.mp4"
        config_path = work_dir / "task.yaml"

        self._prepare_video(video_path, prepared_video, profile.max_height)
        self._prepare_audio(audio_path, prepared_audio)

        config_path.write_text(
            yaml.safe_dump(
                {
                    "task_0": {
                        "video_path": str(prepared_video),
                        "audio_path": str(prepared_audio),
                        "result_name": result_name,
                        "bbox_shift": int(max(-20, min(20, bbox_shift))),
                    }
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )

        command = [
            self.python,
            "-m",
            "scripts.inference",
            "--inference_config",
            str(config_path),
            "--result_dir",
            str(result_dir),
            "--unet_model_path",
            "models/musetalkV15/unet.pth",
            "--unet_config",
            "models/musetalkV15/musetalk.json",
            "--version",
            "v15",
            "--batch_size",
            str(profile.batch_size),
            "--extra_margin",
            str(max(0, min(40, extra_margin))),
            "--parsing_mode",
            "jaw",
            "--ffmpeg_path",
            str(Path(self.ffmpeg).parent),
        ]
        if profile.use_float16:
            command.append("--use_float16")

        env = os.environ.copy()
        env.setdefault("PYTHONUNBUFFERED", "1")
        process = subprocess.run(
            command,
            cwd=self.repo_dir,
            env=env,
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
        )
        if process.returncode != 0:
            tail = (process.stderr or process.stdout or "")[-4000:]
            raise RuntimeError(f"MuseTalk a échoué: {tail}")

        generated = result_dir / "v15" / result_name
        if not generated.exists() or generated.stat().st_size < 1024:
            candidates = list(result_dir.rglob("*.mp4"))
            if not candidates:
                raise RuntimeError("MuseTalk n'a produit aucun fichier MP4.")
            generated = max(candidates, key=lambda item: item.stat().st_mtime)

        self._finalize(generated, output_path, profile.crf)
        return output_path

    def _prepare_video(self, source: Path, target: Path, max_height: int) -> None:
        scale = f"scale=-2:'min({max_height},ih)',fps=25"
        self._run_ffmpeg([
            "-i", str(source), "-an", "-vf", scale,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target),
        ])

    def _prepare_audio(self, source: Path, target: Path) -> None:
        self._run_ffmpeg([
            "-i", str(source), "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "pcm_s16le", str(target),
        ])

    def _finalize(self, source: Path, target: Path, crf: int) -> None:
        self._run_ffmpeg([
            "-i", str(source), "-c:v", "libx264", "-preset", "medium",
            "-crf", str(crf), "-c:a", "aac", "-b:a", "160k",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target),
        ])

    def _run_ffmpeg(self, args: list[str]) -> None:
        command = [self.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", *args]
        result = subprocess.run(command, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg a échoué: {(result.stderr or '')[-2000:]}")
