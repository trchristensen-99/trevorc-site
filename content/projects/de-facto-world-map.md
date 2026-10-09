---
title: De Facto World Map
date: 2026-10-08
importance: 5
status: in progress
tags:
  - projects
  - maps
  - politics
  - war
---

Most world maps show borders as countries claim them. This one shows who actually controls the ground: breakaway states that govern themselves, territory held by occupying armies, and areas run by armed groups, with the claims they contradict drawn as dashed lines on top.

<div class="project-embed">
  <iframe src="/apps/de-facto-world-map/" title="De Facto World Map" loading="lazy"></iframe>
</div>

[Open the map full screen](/apps/de-facto-world-map/). Click any area for who controls it, how confident the assessment is, and the sources behind it. You can switch between flat projections and a globe, toggle the claims and insurgent-presence layers, and download the current view as an SVG. The address bar keeps track of the view, so a link like [this one](/apps/de-facto-world-map/#p=winkel&z=40,15,4) opens straight onto a region.

## How to read it

- **Solid color:** territory governed by a state or a self-governing entity. Each one gets an identity color drawn from its flag or the color it traditionally has on maps (saffron India, green Russia, blue France, gray Germany), adjusted automatically so that neighbors are always distinguishable.
- **Stripes in a state's color:** territory under that state's military occupation, including annexations most of the world doesn't recognize, such as Crimea and the Golan Heights.
- **Dashed outlines:** territory someone claims but doesn't control, in the claimant's color.
- **Thin hatching:** insurgent presence, where an armed group operates or governs the countryside without holding territory outright.
- **Pale gray:** no controlling state. Antarctica's seven claims are drawn as dashed sectors and its research stations as dots in their operators' colors.

## What counts as control

An entity gets its own color when the recognized government exercises no real authority over its territory and the entity doesn't take part in that government. That's true whether or not it claims independence or anyone recognizes it. Somaliland, Taiwan, Northern Cyprus and Wa State qualify; Iraqi Kurdistan, which sits in Iraq's parliament and shares its budget, doesn't.

Some of the calls are judgment calls:

- **Puntland and Jubaland** are colored separately from Somalia because both have broken with the federal government and run their own affairs, although neither claims independence.
- **Northeast Syria** is shown as government-held. The SDF announced its dissolution into the Syrian army in August 2026, but its former members still hold neighborhoods of Hasakah and Qamishli, so this may be premature.
- **The West Bank** is shown as Israeli-occupied in full, though the Palestinian Authority administers civil affairs in Areas A and B.
- **Western Sahara** west of the berm is shown as Moroccan-controlled rather than occupied, since it was never another recognized state's territory; the Sahrawi Republic's claim to it is drawn instead.
- **Rival governments** in a civil war (Yemen, Libya, Sudan) each claim the whole country, so those claims are left implicit rather than outlining every front line.
- **The Sahel** is shown as insurgent presence rather than control: JNIM and Islamic State dominate much of the countryside, but rarely hold towns for long.

## Data and sources

- **Base map:** [Natural Earth](https://www.naturalearthdata.com/) 1:10m countries and disputed areas (public domain), whose stated policy is to draw de facto borders.
- **Conflict zones:** assembled from administrative units in [geoBoundaries](https://www.geoboundaries.org/) (CC BY and CC BY-SA), each assigned to a controller based on current reporting. Every area lists its own sources, date, and a confidence level.
- **Ukraine:** municipalities that are mostly occupied on [DeepStateMap](https://deepstatemap.live/)'s current map. DeepStateMap is the reference for which units are held, but its own geometry isn't redistributed here, so the front line is approximate at the scale of a municipality.
- **Antarctic stations:** [COMNAP](https://github.com/PolarGeospatialCenter/comnap-antarctic-facilities) (COMNAP 2017), free for non-commercial use.

The map data is released under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), except the Antarctic stations layer, which keeps COMNAP's non-commercial terms. The control assessments are mine, and front lines move; corrections are welcome through the [contact page](../contact).

## Changelog

- **October 2026:** first version, with control as of early October 2026.
