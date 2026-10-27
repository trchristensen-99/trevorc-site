# Real Life Tech Tree: data format

Every tech, precondition and resource is a node in `nodes/*.yaml`. The
build (`build.mjs`) checks the files, lays the nodes out and writes
`../data/tree.json`.

## Nodes

```yaml
- id: transistor                  # kebab-case, unique across all files
  name: Point-contact transistor
  kind: device                    # see Kinds
  fields: [electronics, physics]  # first is the main one; see Fields
  date: 1947                      # year (negative = BCE), or [from, to] for a range
  # For prehistory, use years too: -3300000 is 3.3 million years ago.
  # For future techs, use a window plus a best guess:
  # date: { window: [2032, 2045], likely: 2036 }
  status: achieved                # achieved | ongoing | speculative | lost
  tier: 1                         # 1 landmark (shown at every zoom), 2 major, 3 detail
  summary: >-                     # one or two plain sentences, no em dashes
    The first working transistor, made at Bell Labs from germanium and gold foil.
  requires: [semiconductor-physics, germanium-purification]   # hard prerequisites
  helped_by: [radar]              # optional: made much easier or faster by
  competes: []                    # optional: rival approaches to the same goal
  uses: [res-germanium]           # optional: resources it depends on
  efforts:                        # who achieved it, or who is working on it
    - who: John Bardeen, Walter Brattain (Bell Labs)
      where: USA
      when: 1947
      outcome: achieved           # achieved | ongoing | abandoned | rival | independent
      note: William Shockley's junction transistor followed in 1948.
  effort:                         # optional, rough: how much work it took
    span: [1945, 1947]            # years of focused work
    people: 10                    # rough number of researchers (order of magnitude)
    cost_usd: 1e6                 # rough cost in 2025 dollars (order of magnitude)
    note: A small Bell Labs group.
  metric: transistors-per-chip    # optional: a metric in metrics/ that tracks this line of tech
  lost: >-                        # optional, for lost or forgotten techs: what happened
  sources:
    - title: Nobel Prize in Physics 1956
      url: https://www.nobelprize.org/prizes/physics/1956/summary/
```

Only `id`, `name`, `kind`, `fields`, `date`, `status`, `tier`, `summary`
and `sources` are required. Prerequisites point backwards in time: a tech's
`requires` should all be dated no later than it.

## Kinds

- `precondition`: biological givens (hands, large brains, the senses,
  the vocal tract). Not technologies, but every technology rests on them.
- `resource`: a natural resource (ids start with `res-`), with `scarcity`
  (`abundant` | `limited` | `scarce` | `critical`) and a `note` on reserves.
- `discovery`: knowledge of how the world works (a theory, law or finding).
- `technique`: a method or process (smelting, vulcanization, PCR).
- `device`: a made thing (the triode, the steam engine).
- `infrastructure`: large shared systems (the power grid, the internet).
- `institution`: social technologies, meaning reusable methods and
  organizations that, once they exist, can be copied and make other things
  possible: writing, money, double-entry bookkeeping, the patent, the
  joint-stock company, peer review, the randomized trial.

## Fields

In lane order, from abstract to applied:

`math`, `computing`, `electronics`, `physics`, `energy`, `engineering`
(mechanics, transport, construction), `materials`, `chemistry`, `biology`,
`medicine`, `agriculture`, `society` (writing, economy, law, institutions).

## Metrics

`metrics/*.yaml`: a measured series that tracks progress, for price and
scaling curves.

```yaml
id: sequencing-cost-per-genome
name: Cost to sequence a human genome
unit: USD
better: lower                     # lower | higher
log: true
points:                           # [year, value]
  - [2001, 95263072]
  - [2022, 525]
source:
  title: NHGRI DNA Sequencing Costs
  url: https://www.genome.gov/about-genomics/fact-sheets/DNA-Sequencing-Costs-Data
license: public domain
note: Optional.
```
