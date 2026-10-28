---
title: Real Life Tech Tree
date: 2026-10-27
modified: 2026-10-28
importance: 5
status: in progress
tags:
  - projects
  - technology
  - history
  - forecasting
---

Strategy games like *Civilization* and *Stellaris* give technology a tree: research pottery, unlock writing, and so on up to the stars. This is an attempt at the real one. It has many roots, including some that aren't technologies at all. Its branches cross between fields constantly, and many people work on its frontier at once, often in competition.

<div class="project-embed">
  <iframe src="/apps/tech-tree/" title="Real Life Tech Tree" loading="lazy"></iframe>
</div>

[Open the tree full screen](/apps/tech-tree/).

## How to read it

Time runs from left to right. The scale is logarithmic in distance from today, so three million years of prehistory take up about as much room as the last century, and the next few decades get space of their own. Each lane is a field, ordered roughly from abstract to applied:
- mathematics;
- computing;
- electronics;
- physics;
- energy;
- engineering;
- materials;
- chemistry;
- biology;
- medicine;
- agriculture;
- society and institutions.

Within each lane, tracks keep related technologies together: in engineering and transport, space sits apart from aviation, land transport and sea transport, so satellites sit beside human spaceflight rather than container shipping. The roots run along the bottom:
- **preconditions:** hands, large brains, the senses, and the capacity for language, which aren't technologies but which every technology rests on;
- **natural resources:** from flint and copper to oil, lithium and helium, which some technologies can't do without.

The shapes mark kinds of technology:

| Shape | Kind | Examples |
| --- | --- | --- |
| Circle | Discovery | Maxwell's equations |
| Diamond | Technique | Smelting |
| Square | Device | The transistor |
| Hexagon | Infrastructure | The power grid |
| Triangle | Institution | Writing, money, the patent, the randomized trial |
| Flag | Milestone | The $1,000 genome, solar under $1 a watt |

"Social technologies" count when they're reusable methods or organizations that, once they exist, can be copied and make other things possible.

Zoomed out, you see the landmarks and the main links between them. More appears as you zoom in, in order of importance (how much depends on each technology), down to individual methods and rival efforts. The **Detail** slider shows more or fewer at every zoom, up to everything at once, and **Always show the frontier** keeps every unachieved technology on screen. Clicking a technology lights up everything it needs (orange) and everything it led to (teal). This is the view the [Battelle Memorial Institute](https://www.battelle.org/) drew by hand in 1973 for the video tape recorder: decades of separate work in magnetics, electronics and control theory converging on one device.

Half-filled shapes are being worked on, and dashed ones haven't happened yet. Their bars show my best estimate of the window they'll fall in, drawn from trends and forecasts that are cited for each one. Each one also says what would count as achieving it, concretely enough to check: not "automated AI research" but an AI system that does the work of a frontier lab's best researchers, many times over, faster and cheaper. **The frontier** lists everything not yet achieved and who around the world is working on it.

Big goals rarely have a single path. Where there are genuinely different ways to get somewhere, they're shown as routes, any one of which would do. Rejuvenation could come from repairing the body in place, replacing its worn parts, or pausing it until either is possible. Fusion power could come from tokamaks, stellarators, lasers or magnetized targets. Selecting one colors each route's prerequisites.

## Measuring progress

Some lines of technology have a number that tracks them:
- transistors per chip;
- the cost of sequencing a genome;
- the price of a watt of solar power;
- the compute used to train AI models.

For many technologies, how cheap or how good matters more than whether something is possible at all: solar cells worked in 1954 but changed the world only once they got cheap. So the tree tracks 23 measured series, and where there's a long enough one it fits a trend and reports how fast it doubles or halves. For solar, which has production data, it also fits a learning curve: how much the price falls each time cumulative production doubles.

**Trend lines** shows any of these series as strips along the bottom, on the same time axis as the tree. **Milestones** (flags) are thresholds on them that people actually talk about: the $1,000 genome, solar modules under 20 cents a watt, battery packs under $100 a kilowatt-hour, AI agents that can do a day's or a month's work. A milestone already passed is dated from the data; one not yet reached is dated by carrying the trend forward, unless there's a good reason to think the trend will bend, which its note explains. Nick Land's line that "prices encode distributed SF narratives" is the idea behind treating them as evidence: a falling price is a bet that the future has already started.

Where the sources allow, each technology also records roughly what it took in years, people and money. The Manhattan Project took about 130,000 people; the Human Genome Project took 13 years and about $3 billion.

## Sources

Every technology lists its sources. The metrics come from:
- [Our World in Data](https://ourworldindata.org/) (CC BY);
- [Epoch AI](https://epoch.ai/) (CC BY);
- [METR](https://metr.org/) (the time horizons of AI agents);
- [IRENA](https://www.irena.org/), BloombergNEF and CSIS (energy and launch costs);
- the [National Human Genome Research Institute](https://www.genome.gov/about-genomics/fact-sheets/DNA-Sequencing-Costs-Data) (public domain).

The forecasts draw on [Metaculus](https://www.metaculus.com/), expert surveys and the trends above. The structure and the judgment calls are mine; corrections and additions are welcome through the [contact page](../contact).

## Changelog

- **28 October 2026:** tracks within each field; a detail control and a frontier view; concrete criteria, intermediate steps and alternative routes for future technologies; 34 milestones and trend lines for 23 measured series; about 200 more links, plus missing steps like carts, gears and the bicycle between the wheel and the car; faster drawing.
- **27 October 2026:** first version, with landmark technologies across all of history and detailed histories of DNA sequencing and AI.
