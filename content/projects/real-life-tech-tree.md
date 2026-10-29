---
title: Real Life Tech Tree
date: 2026-10-27
modified: 2026-10-29
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

Zoomed out, you see the landmarks and the main links between them. More appears as you zoom in, in order of importance (how much depends on each technology), down to individual methods and rival efforts. The **Detail** slider shows more or fewer at every zoom, from none at the far left to everything at the far right, and **Always show the frontier** keeps every unachieved technology on screen. **Display** changes how it's drawn: color by field, status or kind, with fewer links or labels, bigger or smaller nodes, or a light or dark theme. Clicking a technology lights up everything it needs (orange) and everything it led to (teal). This is the view the [Battelle Memorial Institute](https://www.battelle.org/) drew by hand in 1973 for the video tape recorder: decades of separate work in magnetics, electronics and control theory converging on one device.

Half-filled shapes are being worked on, and dashed ones haven't happened yet. Their bars show my best estimate of the window they'll fall in, drawn from trends and forecasts that are cited for each one. Each one also says what would count as achieving it, concretely enough to check: not "automated AI research" but an AI system that does the work of a frontier lab's best researchers, many times over, faster and cheaper. **The frontier** lists everything not yet achieved and who around the world is working on it.

Big goals rarely have a single path. Where there are genuinely different ways to get somewhere, they're shown as routes, any one of which would do. Rejuvenation could come from repairing the body in place, replacing its worn parts, or pausing it until either is possible. Fusion power could come from tokamaks, stellarators, lasers or magnetized targets. Selecting one colors each route's prerequisites.

The biggest goals also list their steps and open problems, ticked off as they're solved, and what else they'd help with along the way. Reversible cryopreservation, for example, has to solve cryoprotectant toxicity, getting protectant into every tissue, and rewarming a whole body evenly. Clicking **Suggest a change**, in the side panel or under any technology, opens a GitHub issue with a template.

## Measuring progress

Some lines of technology have a number that tracks them:
- transistors per chip;
- the cost of sequencing a genome;
- the price of a watt of solar power;
- the compute used to train AI models.

For many technologies, how cheap or how good matters more than whether something is possible at all: solar cells worked in 1954 but changed the world only once they got cheap. So the tree tracks 23 measured series, and where there's a long enough one it fits a trend and reports how fast it doubles or halves. For solar, which has production data, it also fits a learning curve: how much the price falls each time cumulative production doubles.

**Trend lines** shows any of these series along the bottom, on the same time axis as the tree, as strips or one combined chart. **Milestones** (flags) are thresholds on them that people actually talk about: the $1,000 genome, solar modules under 20 cents a watt, battery packs under $100 a kilowatt-hour, AI agents that can do a day's or a month's work. A milestone already passed is dated from the data; one not yet reached is dated by carrying the trend forward, unless there's a good reason to think the trend will bend, which its note explains. No window opens sooner than the series' fastest past improvement could get there from where it stands now.

## Forecasting

Prices and measured trends are one kind of forecast, but not the only one. Where others have published forecasts for a series, the tree draws them as dotted lines beside the trend, with their bands, and every milestone on that series reports when each forecast reaches it:
- official projections, like the UN's for life expectancy;
- surveys of forecasters and researchers, like the AI Digest's yearly survey of where AI benchmarks will be;
- markets and forecasting platforms, like Metaculus, Manifold and Kalshi;
- models, like the AI Futures Project's timelines model.

Some forecasts are linked to the tree itself. Life expectancy both depends on and tests the tree's medical forecasts, so it's shown for high-, middle- and low-income countries as well as the record-holding country, and one scenario assumes rejuvenation therapies arrive at the tree's own estimate and spread the way past treatments did: quickly in rich countries, decades later in poor ones. It shows how much that would add, how it would widen the gap between rich and poor countries before narrowing it, and that a one-time reset falls well short of "longevity escape velocity". For AI, where surveys forecast benchmark scores rather than capabilities, the tree turns the forecasts into milestones (a score on a benchmark, or the length of task an AI agent can finish) and links them to the capabilities they stand in for, like an AI that codes better than a lab's best engineers. Nick Land's line that "prices encode distributed SF narratives" is the idea behind treating them as evidence: a falling price is a bet that the future has already started.

## What it takes

How much work does a technology take, and how much of the world's resources? **What it takes** gathers three rough models built from the tree itself.

**Effort.** About 200 technologies record what they took: how many people, for how many years, at what cost. The Manhattan Project took about 130,000 people; the Human Genome Project took 13 years and about $6 billion in today's dollars; Maxwell's equations took one person. Across the 178 research efforts since 1500, the person-years behind a breakthrough grew about 2.5-fold a century, and infrastructure and institutions took about 20 times as much as discoveries, techniques or devices. But the scatter dwarfs both: one standard deviation is a factor of 18. Bigger efforts took longer, but nowhere near in proportion: a hundred times the work took about twice as long, because most of the extra work came from more people at once. Costs rose faster than people, about 50-fold a century since 1900, as each researcher came with more equipment. That fits the finding of Bloom and colleagues that ideas are getting harder to find.

**Time after prerequisites.** Since 1950, technologies came a median of 12 years after the last thing they needed was in place, down from decades in the 19th century and centuries before 1800.

**The frontier from the outside.** Together these give two estimates for each future technology that ignore everything except the tree's history. One divides the work it probably still needs by the people on it now; the other adds the usual wait to when its prerequisites will be in place. Fusion power, with about a million person-years spent so far, comes out around 2052 from effort, against the tree's 2040. Where they disagree with the tree's window, one of them is worth a second look.

**Resources.** Each resource now has its world production, reserves, leading producers and processors, recycling rate and demand outlook, mostly from the USGS's 2026 summaries. From these the tree scores supply risk: how concentrated production or processing is among countries, how many years reserves last, how little is recycled, and how fast demand is growing. Technologies record how much they need (about 9 kg of lithium and 66 kg of graphite in a typical electric car's battery; solar panels take 17% of the world's silver) and take the rating of their riskiest resource. Lithium, graphite, rare earths, helium, gallium and germanium rate very high. Oil rates low, because many countries produce it; the price of oil is a political problem more than a supply one. **Display** can color the whole tree by supply risk or by what each technology took.

## Inspirations

Two earlier maps inspired this one, and copies of both are kept [on their own page](/apps/tech-tree/inspirations/), since neither is online at its original address any more:
- **The [Foresight Institute](https://foresight.org/)'s tech trees** (2022 to 2023) cover longevity, neurotechnology, nanotechnology, space and "intelligent cooperation". Each is a graph of goals, technologies, open challenges, spillover applications, and the labs and companies working on each.
- **Antimortality** (2022), by Kai Micah Mills, lays out three paths to much longer lives (prevention by preservation, extension by curing aging, and ascension by enhancement and uploading), each a checklist of concrete problems with the groups working on them.

This tree borrows several things from them:
- their checklists of steps and open problems;
- Foresight's spillover applications ("would also help with");
- steps that were missing here, such as the hallmarks of aging, clearing senescent cells in mice, brain preservation for later scanning, reviving a cryopreserved small mammal, and replacing the aging brain piece by piece;
- Foresight's habit of inviting edits.

What it adds is all of technology rather than one field, a time axis, sourced dates and windows, and the models above.

## Sources

Every technology lists its sources. The metrics come from:
- [Our World in Data](https://ourworldindata.org/) (CC BY);
- [Epoch AI](https://epoch.ai/) (CC BY);
- [METR](https://metr.org/) (the time horizons of AI agents);
- [IRENA](https://www.irena.org/), BloombergNEF and CSIS (energy and launch costs);
- the [UN World Population Prospects](https://population.un.org/wpp/) and the [Human Mortality Database](https://www.mortality.org/) (lifespan);
- the [National Human Genome Research Institute](https://www.genome.gov/about-genomics/fact-sheets/DNA-Sequencing-Costs-Data) (public domain);
- the [USGS Mineral Commodity Summaries](https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries) (public domain), the [IEA's Global Critical Minerals Outlook](https://www.iea.org/reports/global-critical-minerals-outlook-2025), the [UNEP recycling rates](https://www.resourcepanel.org/reports/recycling-rates-metals), the [World Nuclear Association](https://world-nuclear.org/) and the Energy Institute's Statistical Review (resources).

The forecasts draw on [Metaculus](https://www.metaculus.com/), the [AI Digest](https://theaidigest.org/) surveys, the [AI Futures Project](https://ai-futures.org/), expert surveys and the trends above. The structure and the judgment calls are mine; corrections and additions are welcome through the [contact page](../contact).

## Changelog

- **29 October 2026:** display options (color by field, status or kind; links; labels; node size; theme; date bars, track names and eras); trend lines no longer cover the tree; life expectancy at birth and at 65 by country income group, with UN and IHME projections. Later the same day: **What it takes**, with effort figures for about 200 technologies, models of effort and of the time after prerequisites, outside-view estimates for the frontier, and world supply data and supply-risk ratings for the resources, with how much of each technology needs; color the tree by supply risk or by effort. Then: copies of the Foresight Institute tech trees and Antimortality on an [inspirations page](/apps/tech-tree/inspirations/); steps and open problems for the biggest goals, with what else they'd help with; five new steps in longevity and preservation; a way to suggest changes.
- **28 October 2026:** tracks within each field; a detail control and a frontier view; concrete criteria, intermediate steps and alternative routes for future technologies; 34 milestones and trend lines for 23 measured series; about 200 more links, plus missing steps like carts, gears and the bicycle between the wheel and the car; faster drawing. Later the same day: forecasts from projections, surveys, markets and models drawn beside the trends; lifespan and AI benchmark series; every future window opens no sooner than it could be reached; sources checked; a detail slider from none to everything; trend lines get their own room, with compact and combined layouts; BC and AD.
- **27 October 2026:** first version, with landmark technologies across all of history and detailed histories of DNA sequencing and AI.
