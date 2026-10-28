# Building the tech tree's data

```sh
npm install
npm run build   # writes ../data/tree.json
```

- `nodes/*.yaml`: every technology, precondition and resource; the format is
  in `SCHEMA.md`. The files are split by era and field (`a-ancient`,
  `b-modern`, `c-bio`, `d-computing`, `e-frontier`), plus `z-merge.yaml` for
  nodes added while merging them. Any file works: the build reads them all.
- `links.yaml`, `links-*.yaml`: links between nodes in different files, added
  at merge time or in audits; entries can also `drop` wrong links.
- `patches/*.yaml`: changes to nodes defined elsewhere (reworded, re-dated or
  removed), so a review can be kept apart from the original data.
- `tracks.yaml`: which track (sub-lane of its field) each node sits in. The
  tracks themselves, and their order, are defined in `build.mjs`.
- `metrics/*.yaml`: measured series (prices, performance) with their sources.
  The build fits a doubling or halving time to each, and a learning curve
  (Wright's law) where a series names its `cumulative` production series.
- `IDS.md`: the ids each part was asked to define.

The build reports unknown ids, prerequisites dated after the things that need
them, cycles, missing sources and future technologies without a criterion.
It dates milestones from their metrics (the year the data crossed the
threshold, or the trend carried forward), ranks the nodes by importance (tier,
then how much depends on them) to decide the zoom each first shows at, and
places each on the log time axis inside its track. It writes `tree.json`
(what the first view needs) and `details.json` (the text, loaded after). The
app works out which links to draw for whatever is showing: only those not
implied by a longer chain of shown nodes.
