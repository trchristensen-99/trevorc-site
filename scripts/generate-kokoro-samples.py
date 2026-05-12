#!/usr/bin/env python3
"""Generate TTS samples from Kokoro (free, local, high-quality, ~310MB model).

Setup (one time):
    .tts-venv/bin/pip install kokoro-onnx soundfile
    curl -L -o /tmp/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -L -o /tmp/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Run:
    .tts-venv/bin/python scripts/generate-kokoro-samples.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro


SAMPLE_TEXT = """Welcome to this audio narration test. We are evaluating multiple text-to-speech voices to find one that is clear, pleasant for background listening, and handles technical vocabulary well.

This sample includes a few specific challenges. Numerical values, like 2.7 percent or one hundred and forty thousand. Proper nouns, including Cold Spring Harbor Laboratory and CRISPR Cas9. Punctuation: pauses, mid-sentence emphasis, and parenthetical asides. Abbreviations such as PhD, RNA, and Q3 2026.

Most importantly, the voice should be easy to follow when you are not paying full attention. Voices that sound natural and have varied prosody tend to hold up better in this case."""


# Pick a few American voices to compare. Kokoro voice ids:
#   am_michael, am_adam, am_eric, am_liam, am_onyx, am_echo, am_fenrir,
#   am_puck, am_santa
VOICES = [
    ("am_michael", "Michael (US male, Kokoro)", "kokoro-michael"),
    ("am_adam", "Adam (US male, Kokoro)", "kokoro-adam"),
    ("am_liam", "Liam (US male, Kokoro)", "kokoro-liam"),
    ("am_eric", "Eric (US male, Kokoro)", "kokoro-eric"),
    ("am_puck", "Puck (US male, Kokoro)", "kokoro-puck"),
]


def wav_to_mp3(wav_path: Path, mp3_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
         "-codec:a", "libmp3lame", "-qscale:a", "4", str(mp3_path)],
        check=True,
    )


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    out_dir = repo_root / "quartz" / "static" / "audio-samples"
    out_dir.mkdir(parents=True, exist_ok=True)

    model = Path("/tmp/kokoro-v1.0.onnx")
    voices = Path("/tmp/voices-v1.0.bin")
    if not model.exists() or not voices.exists():
        print(f"Missing model files at {model} or {voices}", file=sys.stderr)
        print("See module docstring for download URLs.", file=sys.stderr)
        sys.exit(1)

    kokoro = Kokoro(str(model), str(voices))

    for voice_id, label, slug in VOICES:
        try:
            samples, sample_rate = kokoro.create(SAMPLE_TEXT, voice=voice_id, speed=1.0, lang="en-us")
        except Exception as e:
            print(f"  SKIP {voice_id}: {e}", file=sys.stderr)
            continue

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            sf.write(tmp.name, samples, sample_rate)
            mp3_path = out_dir / f"{slug}.mp3"
            wav_to_mp3(Path(tmp.name), mp3_path)
            print(f"  {voice_id:30s} -> {mp3_path.relative_to(repo_root)}")


if __name__ == "__main__":
    main()
