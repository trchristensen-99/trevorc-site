---
title: TTS voice comparison
date: 2026-05-12
tags:
  - meta
---

Seven US male voices from Microsoft Edge TTS (free, no API key). Same script, different voices. Pick the one that holds up best when you are listening with partial attention.

The script tests numerical values (2.7 percent), proper nouns (Cold Spring Harbor Laboratory, CRISPR Cas9), abbreviations (PhD, RNA), and varied sentence rhythm.

## Andrew (warm, confident, authentic)

<audio controls preload="metadata" src="/static/audio-samples/andrew.mp3"></audio>

## Brian (approachable, casual, sincere)

<audio controls preload="metadata" src="/static/audio-samples/brian.mp3"></audio>

## Christopher (reliable, authoritative)

<audio controls preload="metadata" src="/static/audio-samples/christopher.mp3"></audio>

## Eric (rational, neutral)

<audio controls preload="metadata" src="/static/audio-samples/eric.mp3"></audio>

## Guy (passionate, energetic)

<audio controls preload="metadata" src="/static/audio-samples/guy.mp3"></audio>

## Roger (lively, narrator-style)

<audio controls preload="metadata" src="/static/audio-samples/roger.mp3"></audio>

## Steffan (rational, measured)

<audio controls preload="metadata" src="/static/audio-samples/steffan.mp3"></audio>

## Kokoro voices (local, free, generally smoother than Edge TTS)

Kokoro is a 2024 open-source TTS model (~310MB, runs locally). Subjectively the prosody is more natural than Edge TTS, especially across longer passages. Setup is heavier (model download, soundfile, ffmpeg).

### Michael (Kokoro, US male)

<audio controls preload="metadata" src="/static/audio-samples/kokoro-michael.mp3"></audio>

### Adam (Kokoro, US male)

<audio controls preload="metadata" src="/static/audio-samples/kokoro-adam.mp3"></audio>

### Liam (Kokoro, US male)

<audio controls preload="metadata" src="/static/audio-samples/kokoro-liam.mp3"></audio>

### Eric (Kokoro, US male)

<audio controls preload="metadata" src="/static/audio-samples/kokoro-eric.mp3"></audio>

### Puck (Kokoro, US male)

<audio controls preload="metadata" src="/static/audio-samples/kokoro-puck.mp3"></audio>

Regenerate via `scripts/generate-kokoro-samples.py`. Edit `VOICES` to add more (`am_onyx`, `am_echo`, `am_fenrir`, `am_santa` etc.).

## Auto-discovered audio narrations

If you want a specific essay to have a narration without setting `audio:` in its frontmatter, drop an MP3 at `quartz/static/audio-narrations/<slug>.mp3`. Use `--` instead of `/` in the slug for nested paths: a piece at `content/writing/foo.md` looks for `quartz/static/audio-narrations/writing--foo.mp3`.

The `AudioAutoDiscover` transformer (registered in `quartz.config.ts`) wires this up automatically. To opt a specific essay out, set `audio: false` in its frontmatter.

## Changing the voice lineup

Edit `scripts/generate-tts-samples.py` (the `VOICES` list, or `SAMPLE_TEXT`) and rerun:

```
.tts-venv/bin/python scripts/generate-tts-samples.py
```

To browse the full Edge TTS voice list (250+ voices, many languages):

```
.tts-venv/bin/edge-tts --list-voices
```
