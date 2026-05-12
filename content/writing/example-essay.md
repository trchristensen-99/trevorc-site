---
title: An example essay
date: 2026-04-15
modified: 2026-05-07
importance: 6
status: in-progress
confidence: likely
tags:
  - example
audio:
  src: /static/audio-samples/kokoro-liam.mp3
  label: Audio narration (Kokoro TTS, Liam voice — your chosen default).
---

This is a placeholder essay that exists to demonstrate the new metadata fields and the sortable list. Delete when you have real content.

## How the metadata works

In the frontmatter:

- `date`: when the piece was first published. Shown as "Published".
- `modified`: when it was last meaningfully updated. Shown as "Updated" if it differs from `date` by more than a day. Quartz also infers this from git history if you omit the field.
- `importance`: a 1 to 10 score. Manual judgment of how essential this is. Shown in the page meta and used as a sortable column.
- `status`: the work-in-progress label. `draft`, `in-progress`, `finished`, `abandoned`. Shown in italic.
- `confidence`: epistemic status. `speculative`, `likely`, `settled`. Shown in the page meta.
- `audio`: optional. Either a string URL or `{src: ..., label: ...}`. Renders an audio player at the top of the page.

## How the sortable table works

The folder index pages (this writing index, research, notes) now render a sortable table instead of a flat list. Click any column header to sort. Click again to reverse direction. Columns: title, published date, updated date, importance, reading time, inbound links.
