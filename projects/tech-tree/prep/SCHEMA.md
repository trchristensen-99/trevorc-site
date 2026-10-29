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
    people: 10                    # rough number working on it at once (order of magnitude)
    cost_usd: 1e6                 # rough cost in 2025 dollars (order of magnitude)
    note: A small Bell Labs group.  # (more keys under Effort, below)
  metric: transistors-per-chip    # optional: a metric in metrics/ that tracks this line of tech
  lost: >-                        # optional, for lost or forgotten techs: what happened
  sources:
    - title: Nobel Prize in Physics 1956
      url: https://www.nobelprize.org/prizes/physics/1956/summary/
```

Only `id`, `name`, `kind`, `fields`, `date`, `status`, `tier`, `summary`
and `sources` are required, plus `criterion` for anything not yet
achieved.

### Fields for the frontier

```yaml
  track: longevity                # sub-lane within the main field; see Tracks
  criterion: >-                   # for ongoing and speculative nodes: what
    A therapy that, in a randomized  # counts as done, concretely enough that
    trial, ...                    # someone could check it.
  routes:                         # alternative paths: any ONE route is enough
    - name: Repair                #   (requires: still lists what every route needs)
      requires: [partial-reprogramming-humans, senolytics-approved]
      note: Fix the damage in place.
    - name: Replace
      requires: [whole-organ-bioprinting, xenotransplant-routine]
```

### Milestones

A milestone is a threshold on a metric: "a human genome for under $1,000".

```yaml
- id: genome-100-dollars
  name: "$100 genome"
  kind: milestone
  fields: [biology]
  track: sequencing
  tier: 2
  threshold: { metric: sequencing-cost-per-genome, value: 100, label: "$100" }
  # date and status may be left out: the build dates the milestone from the
  # data (the first year it was crossed) or, if not yet crossed, from the
  # trend carried forward. Give them to override with your own judgment;
  # the trend's year is still shown alongside.
  requires: [next-generation-sequencing]
  summary: ...
  sources: [...]                  # optional if the metric's source covers it
```

### Patches

`patches/*.yaml` changes nodes defined elsewhere: each entry gives an `id`
and the fields to replace (whole fields, so to change `requires` give the
full new list). `remove: true` deletes a node. `links.yaml` and
`links-*.yaml` add links (`requires`, `helped_by`, `uses`, `competes`) and
can remove wrong ones with `drop: { requires: [...] }`. Prerequisites point backwards in time: a tech's
`requires` should all be dated no later than it.

## Effort

`effort.yaml` holds what each technology took, merged key by key into the
node's own `effort` (a key set to `null` removes it), so the figures can
be reviewed in one place:

```yaml
- id: transistor
  span: [1945, 1947]   # years of focused work on this result
  people: 10           # working on it at once: researchers, engineers, builders
                       # (not trial volunteers or customers); for something not
                       # yet achieved, the number working on it now
  person_years: 20     # total, when the sources give one (else people x years)
  cost_usd: 1e6        # total, 2025 dollars
  compute_usd: 440     # the cost of computing alone (AI training runs)
  work: build          # mostly building what people already knew how to make
                       # (default: research, finding out how)
  growth: 0.1          # not yet achieved: how fast effort on it grows a year
  rough: true          # an order-of-magnitude estimate, not a documented figure
  note: ...
```

The build fits three models from these and the links (`build.mjs`,
"models"), shown under **What it takes** in the app:

- **Effort over time:** log10 person-years against the year achieved and
  the kind (discovery; technique or device; infrastructure or institution),
  for research efforts since 1500, by least squares.
- **Time after prerequisites:** how long after its latest direct
  prerequisite (a technology, not a resource) each technology came, by era.
  For a future technology: when its prerequisites are in place (the
  earliest route, if it has routes) plus the lags seen since 1950, using
  only lags at least as long as it has already waited.
- **Effort-based estimate:** for a future technology with `people` and
  person-years so far, the person-years it needs are taken as log-normal
  (the effort fit for its kind today, with the fit's scatter), conditioned
  on being more than has been spent; what's left, divided by the people now
  (growing at `growth`), gives the time left, and never before its
  prerequisites are in place.

## Resources and supply

`supply.yaml` gives each resource's world supply, keyed by id:

```yaml
res-lithium:
  year: 2025
  production: { value: 290000, unit: t, what: lithium content }
  reserves: { value: 37000000, unit: t }   # same unit as production; more: true for "over"
  producers: [[Australia, 31.7], [China, 21.4], ...]   # percent of world output
  processing: { stage: chemical refining, producers: [[China, 65]] }
  recycling: "<1%"     # end-of-life recycling rate: >50%, 25-50%, 10-25%, 1-10%, <1% (UNEP 2011)
  demand_2040: 5       # demand in 2040 as a multiple of today's (IEA stated policies)
  uses: [[batteries, 88], ...]
  risk: { rating: high, note: ... }   # optional: a judgment instead of the score
  note: ...
  sources: [...]
```

The build scores supply risk from 0 to 1 as a weighted average of the
parts that are known: concentration (0.45; the HHI of the most
concentrated stage, mining or processing, over 0.5), depletion (0.2; 100
years of reserves or more is 0, 10 or less is 1), recycling (0.15) and
demand growth (0.2; fivefold or more is 1). Ratings: under 0.3 low, under
0.45 moderate, under 0.6 high, else very high. A technology takes the
rating of the riskiest resource it uses.

`resource-use.yaml` says how much of a resource a technology needs (each
entry also adds the `uses` link):

```yaml
- tech: lithium-ion-battery
  resource: res-lithium
  share: 88                  # percent of world use that goes to it
  amount: About 9 kg of lithium in a typical electric car's battery.
  substitute: sodium-ion-battery   # a technology that avoids it
  source: { title: ..., url: ... }
```

## Kinds

- `precondition`: biological givens (hands, large brains, the senses,
  the vocal tract). Not technologies, but every technology rests on them.
- `resource`: a natural resource (ids start with `res-`), with `scarcity`
  (`abundant` | `limited` | `scarce` | `critical`, a long-run judgment), a
  `note` on its history, and its supply in `supply.yaml`.
- `discovery`: knowledge of how the world works (a theory, law or finding).
- `technique`: a method or process (smelting, vulcanization, PCR).
- `device`: a made thing (the triode, the steam engine).
- `infrastructure`: large shared systems (the power grid, the internet).
- `milestone`: a threshold on a metric (see Milestones).
- `institution`: social technologies, meaning reusable methods and
  organizations that, once they exist, can be copied and make other things
  possible: writing, money, double-entry bookkeeping, the patent, the
  joint-stock company, peer review, the randomized trial.

## Fields and tracks

Each field is a lane; within it, tracks group related technologies so
they sit next to each other. Assign tracks in `tracks.yaml` (existing
nodes) or with `track:` on the node. In lane order, from abstract to
applied, with each field's tracks top to bottom (defined in `build.mjs`):

- `math`: geometry-analysis, number-algebra, probability-statistics, logic, cryptography
- `computing`: computing-theory, classic-ai, deep-learning, bioinformatics, software, networks, computers
- `electronics`: processors, components, chipmaking, communication, neurotech
- `physics`: quantum-atomic, em-optics, astronomy, earth-climate, mechanics-heat, nuclear-particle
- `energy`: nuclear-energy, renewables, grid, storage-fuels, carbon, fossil-fuels, engines
- `engineering`: space, aviation, land-transport, sea-transport, machines, construction
- `materials`: metals, traditional-materials, modern-materials, nanotech
- `chemistry`: classical-chemistry, industrial-chemistry, analytical-chemistry
- `biology`: sequencing, single-molecule, genomics, molecular-biology, synthetic-biology, life-science
- `medicine`: genetic-medicine, drugs, longevity, surgery-organs, public-health
- `agriculture`: crops, soil-water, farm-machines, animals-food
- `society`: research, economy, law-governance, records
- roots: preconditions, resources

The fields themselves:

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
short: Genome cost                # optional short name for the trend strips
field: biology                    # the field it belongs with
fit: { from: 2008 }               # optional: fit the trend from/to a year, or
                                  # envelope: min|max (best value each year)
cumulative: other-metric-id       # optional: fit a learning curve against it
scenarios:                        # optional: forecasts of where it goes next
  - id: un-wpp-medium             # unique within the metric
    name: UN medium projection    # short, shown as a label
    kind: projection              # trend | projection | survey | market | model | judgment
    points: [[2030, 74.1], [2050, 77.4], [2100, 82.1]]   # the central path
    low: [[2050, 74.0], [2100, 76.5]]    # optional band (e.g. 80 or 95 percent)
    high: [[2050, 80.5], [2100, 87.9]]
    note: >-                      # what it assumes, in a sentence or two
      ...
    sources: [{title: ..., url: ...}]
```

### Several lines on one metric

A metric can hold several lines that share a unit and a chart, such as one
per country income group. Give `series` instead of `points`; each series
has its own `points`, optional `fit` and `scenarios`:

```yaml
id: life-expectancy-income
name: Life expectancy at birth by country income group
unit: years
better: higher
log: false
series:
  - id: high
    name: High-income countries
    points: [[1950, 64.2], ...]
    scenarios: [...]
  - id: low
    name: Low-income countries
    points: [...]
```

A milestone on such a metric names its line: `threshold: { metric:
life-expectancy-income, series: low, value: 70 }`.

Scenarios are drawn on the metric's chart and trend strip, and every
milestone on the metric reports the year each scenario reaches it. Use
`kind: model` for a path computed from stated assumptions (say so in the
note, e.g. "if rejuvenation therapies arrive around 2062 and add ..."),
and `judgment` for your own estimate. Points must start at or after the
last data point; the first one may repeat it so the line joins the data.
