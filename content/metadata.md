---
title: Metadata
date: 2026-05-13
tags:
  - meta
---

A reference for the metadata fields used on pieces of writing here, what they mean, and how they are rendered. Updated whenever the system changes.

## How the metadata works

In the frontmatter:

- `date`: when the piece was first published. Shown as "Published".
- `modified`: when it was last meaningfully updated. Shown as "Updated" if it differs from `date` by more than a day. Quartz also infers this from git history if you omit the field.
- `importance`: a 1 to 10 score. Manual judgement of how important this is to the author, with 10 being the most important. Shown in the page meta and used as a sortable column.
- `tags`: a list of tags associated with the piece. Shown in the page meta as "Tags: x, y, z" with each linking to its tag page.
- `audio`: optional. Either a string URL or `{src, label}` object. Renders an audio player launcher in the metadata line; click to expand into the full player with playback speed and 15-second skip controls.

Importance scores are passed through a log inverse-J calibration at build time so the "calibrated" bucket adapts as the corpus grows (see `quartz/util/calibration.ts` for the formula).
