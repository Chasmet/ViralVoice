from __future__ import annotations

import math
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
        self.ffprobe = str(Path(self.ffmpeg).with_name("ffprobe"))
        self.timeout_seconds = int(os.getenv("LIPSYNC_JOB_TIMEOUT_SECONDS", "5400"))
        self.chunk_seconds = max(15, min(60, int(os.getenv("LIPSYNC_CHUNK_SECONDS", "45"))))
        self.max_duration_seconds = int(os.getenv("LIPSYNC_MAX_DURATION_SECONDS", "300"))

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
        return True, f"MuseTalk 1.5 prêt · blocs de {self.chunk_seconds} s"

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

    def duration_seconds(self, media_path: Path) -> float:
        result = subprocess.run(
            [
                self.ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(media_path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return float(result.stdout.strip() or 0)

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

        total_duration = self.duration_seconds(video_path)
        if total_duration <= 0:
            raise RuntimeError("Durée vidéo impossible à lire.")
        if total_duration > self.max_duration_seconds + 0.25:
            raise RuntimeError(
                f"Vidéo trop longue pour MuseTalk: {total_duration:.1f} s. "
                f"Limite: {self.max_duration_seconds} s."
            )

        profile = QUALITY_PROFILES.get(quality, QUALITY_PROFILES["balanced"])
        chunk_count = max(1, math.ceil(total_duration / self.chunk_seconds))
        result_dir = work_dir / "results"
        config_path = work_dir / "tasks.yaml"
        tasks: dict[str, dict[str, object]] = {}
        chunk_specs: list[tuple[str, Path, float]] = []

        for index in range(chunk_count):
            start = index * self.chunk_seconds
            duration = min(self.chunk_seconds, total_duration - start)
            chunk_dir = work_dir / f"chunk-{index:03d}"
            chunk_dir.mkdir(parents=True, exist_ok=True)
            prepared_video = chunk_dir / "source-25fps.mp4"
            prepared_audio = chunk_dir / "dubbed-16k.wav"
            result_name = f"viralvoice-chunk-{index:03d}.mp4"

            self._prepare_video_segment(
                video_path,
                prepared_video,
                profile.max_height,
                start,
                duration,
            )
            self._prepare_audio_segment(audio_path, prepared_audio, start, duration)

            tasks[f"task_{index}"] = {
                "video_path": str(prepared_video),
                "audio_path": str(prepared_audio),
                "result_name": result_name,
                "bbox_shift": int(max(-20, min(20, bbox_shift))),
            }
            chunk_specs.append((result_name, chunk_dir, duration))

        config_path.write_text(
            yaml.safe_dump(tasks, sort_keys=False),
            encoding="utf-8",
        )

        self._run_inference(
            config_path=config_path,
            result_dir=result_dir,
            profile=profile,
            extra_margin=extra_margin,
        )

        finalized_chunks: list[Path] = []
        for index, (result_name, chunk_dir, duration) in enumerate(chunk_specs):
            generated = result_dir / "v15" / result_name
            if not generated.exists() or generated.stat().st_size < 1024:
                matches = list(result_dir.rglob(result_name))
                if not matches:
                    raise RuntimeError(f"MuseTalk n'a pas produit le bloc {index + 1}/{chunk_count}.")
                generated = max(matches, key=lambda item: item.stat().st_mtime)

            finalized = chunk_dir / f"final-{index:03d}.mp4"
            self._finalize_video_only(generated, finalized, profile.crf, duration)
            finalized_chunks.append(finalized)

        if len(finalized_chunks) == 1:
            self._copy_video(finalized_chunks[0], output_path)
        else:
            self._concat_video_chunks(finalized_chunks, output_path, work_dir)

        return output_path

    def _run_inference(
        self,
        *,
        config_path: Path,
        result_dir: Path,
        profile: QualityProfile,
        extra_margin: int,
    ) -> None:
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
            tail = (process.stderr or process.stdout or "")[-6000:]
            raise RuntimeError(f"MuseTalk a échoué: {tail}")

    def _prepare_video_segment(
        self,
        source: Path,
        target: Path,
        max_height: int,
        start: float,
        duration: float,
    ) -> None:
        scale = f"scale=-2:'min({max_height},ih)',fps=25"
        self._run_ffmpeg([
            "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(source),
            "-an", "-vf", scale,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target),
        ])

    def _prepare_audio_segment(
        self,
        source: Path,
        target: Path,
        start: float,
        duration: float,
    ) -> None:
        self._run_ffmpeg([
            "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(source),
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(target),
        ])

    def _finalize_video_only(
        self,
        source: Path,
        target: Path,
        crf: int,
        duration: float,
    ) -> None:
        self._run_ffmpeg([
            "-i", str(source), "-t", f"{duration:.3f}", "-an",
            "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target),
        ])

    def _copy_video(self, source: Path, target: Path) -> None:
        self._run_ffmpeg([
            "-i", str(source), "-an", "-c:v", "copy", "-movflags", "+faststart", str(target),
        ])

    def _concat_video_chunks(self, chunks: list[Path], target: Path, work_dir: Path) -> None:
        concat_file = work_dir / "concat-video.txt"
        concat_file.write_text(
            "\n".join(f"file '{str(path).replace(chr(39), chr(39) + '\\\'' + chr(39))}'" for path in chunks) + "\n",
            encoding="utf-8",
        )
        self._run_ffmpeg([
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-an", "-c:v", "copy", "-movflags", "+faststart", str(target),
        ])

    def _run_ffmpeg(self, args: list[str]) -> None:
        command = [self.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", *args]
        result = subprocess.run(command, capture_output=True, text=True, timeout=900)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg a échoué: {(result.stderr or '')[-3000:]}")
