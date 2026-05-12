#!/usr/bin/env python3
"""Generate TTS samples from edge-tts for voice comparison.

Run from repo root:
    .tts-venv/bin/python scripts/generate-tts-samples.py

Edit SAMPLE_TEXT and VOICES below. Outputs to quartz/static/audio-samples/.
"""
import asyncio
import sys
from pathlib import Path

import edge_tts

SAMPLE_TEXT = """Welcome to this audio narration test. We are evaluating multiple text-to-speech voices to find one that is clear, pleasant for background listening, and handles technical vocabulary well.

This sample includes a few specific challenges. Numerical values, like 2.7 percent or one hundred and forty thousand. Proper nouns, including Cold Spring Harbor Laboratory and CRISPR Cas9. Punctuation: pauses, mid-sentence emphasis, and parenthetical asides. Abbreviations such as PhD, RNA, and Q3 2026.

Most importantly, the voice should be easy to follow when you are not paying full attention. Voices that sound natural and have varied prosody tend to hold up better in this case. After listening to each sample, pick the voice that feels least fatiguing over a long essay."""

# (voice id, friendly label, slug for filename)
# US male voices only. edge-tts character notes from --list-voices.
VOICES = [
    ("en-US-AndrewNeural", "Andrew (warm, confident, authentic)", "andrew"),
    ("en-US-BrianNeural", "Brian (approachable, casual, sincere)", "brian"),
    ("en-US-ChristopherNeural", "Christopher (reliable, authoritative)", "christopher"),
    ("en-US-EricNeural", "Eric (rational, neutral)", "eric"),
    ("en-US-GuyNeural", "Guy (passionate, energetic)", "guy"),
    ("en-US-RogerNeural", "Roger (lively, narrator-style)", "roger"),
    ("en-US-SteffanNeural", "Steffan (rational, measured)", "steffan"),
]


async def synth(voice: str, out_path: Path) -> None:
    communicate = edge_tts.Communicate(SAMPLE_TEXT, voice)
    await communicate.save(str(out_path))


async def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    out_dir = repo_root / "quartz" / "static" / "audio-samples"
    out_dir.mkdir(parents=True, exist_ok=True)

    for voice, _label, slug in VOICES:
        out_path = out_dir / f"{slug}.mp3"
        print(f"  {voice:30s} -> {out_path.relative_to(repo_root)}")
        try:
            await synth(voice, out_path)
        except Exception as e:
            print(f"  FAILED for {voice}: {e}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
