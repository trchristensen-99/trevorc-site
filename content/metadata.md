---
title: Metadata
date: 2026-05-13
tags:
  - meta
---

A reference for the metadata fields used on pieces of writing here. Section headings are the literal frontmatter keys (except `reading-time`, which is computed and not stored in frontmatter).

## Fields

### date

When the piece was first created. Shown as "Created <date>" in the metadata header on each page. Clicking the date in any page's metadata jumps to [[all|All pages]] sorted by creation date.

### modified

When the piece was last meaningfully updated. Shown as "Updated <date>" if it differs from `date` by more than a day.

If you don't set this in frontmatter, Quartz infers it from git history. Any commit touching the file updates the date — there is no "meaningful change" threshold. To freeze the value, set `modified:` explicitly in frontmatter.

### reading-time

Auto-computed from the page text using the reading-time package, at roughly 265 words per minute. Shown as "N min read" in the metadata header. Not a frontmatter field; the only knob is the body text itself.

Clicking the value jumps to [[all|All pages]] sorted shortest first.

### importance

A 1 to 10 manual score in the frontmatter field `importance`. Judgement of how important the piece is to the author, with 10 being the most important.

The parenthetical "(rank R of T)" alongside the score is the page's standing among all rated pages — **lower numbers mean the piece is more important**, so rank 1 is the most important and rank T the least. Ties share a single rank (the floored median of their positions), so two equally-rated pieces in a corpus of three both show "rank 1 of 3".

### tags

The `tags` frontmatter field, a list of strings. Shown as "Tags: x, y, z" with each tag linking to its own page; the "Tags" label links to the full [[tags|Tags]] index.

### audio

Optional. The `audio` frontmatter field, either a string URL or an object of the form `{src, label}`. Renders a small speaker icon in the metadata; click to expand the full audio player with playback-speed and 15-second skip controls.
