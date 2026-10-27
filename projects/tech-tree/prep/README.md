# Building the tech tree's data

```sh
npm install
npm run build   # writes ../data/tree.json
```

- `nodes/*.yaml`: every technology, precondition and resource; the format is
  in `SCHEMA.md`. The files are split by era and field (`a-ancient`,
  `b-modern`, `c-bio`, `d-computing`, `e-frontier`), plus `z-merge.yaml` for
  nodes added while merging them. Any file works: the build reads them all.
- `links.yaml`: links between nodes in different files, added at merge time.
- `metrics/*.yaml`: measured series (prices, performance) with their sources.
  The build fits a doubling or halving time to each, and a learning curve
  (Wright's law) where a series names its `cumulative` production series.
- `IDS.md`: the ids each part was asked to define.

The build reports unknown ids, prerequisites dated after the things that need
them, cycles and missing sources. It also places each node on the log time
axis and in its field's lane, and picks the links to draw at each zoom level:
only those not implied by a longer chain of shown nodes.
