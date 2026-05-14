---
title: Metadata
date: 2026-05-13
tags:
  - meta
---

A reference for the metadata fields used on pieces of writing here, what they mean, and how they are rendered. Updated whenever the system changes.

## Fields

### Published

The `date` frontmatter field. When the piece was first published. Shown as "Published <date>" in the metadata header on each page.

Clicking the date in any page's metadata jumps to [[all|All pages]] sorted by publication date.

### Updated

The `modified` frontmatter field. When the piece was last meaningfully updated. Shown as "Updated <date>" if it differs from the publication date by more than a day.

If you don't set this in frontmatter, Quartz infers it from git history. Any commit touching the file updates the date — there is no "meaningful change" threshold. To freeze the value, set `modified:` explicitly in frontmatter.

### Reading time

Auto-computed from the page text using the reading-time package, at roughly 265 words per minute. Shown as "N min read" in the metadata header.

Clicking the value jumps to [[all|All pages]] sorted shortest first.

### Importance

A 1 to 10 manual score in the frontmatter field `importance`. Manual judgement of how important the piece is to the author, with 10 being the most important.

Raw scores are passed through a log inverse-J calibration at build time so the displayed "calibrated" bucket adapts as the corpus grows. The displayed value is the calibrated bucket; the rank shown alongside is the page's rank among all rated pages.

### Tags

The `tags` frontmatter field, a list of strings. Shown as "Tags: x, y, z" with each tag linking to its own page; the "Tags" label links to the full [[tags|Tags]] index.

### Audio

Optional. The `audio` frontmatter field, either a string URL or an object of the form `{src, label}`. Renders a small speaker icon in the metadata; click to expand the full audio player with playback-speed and 15-second skip controls.
