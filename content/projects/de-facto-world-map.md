---
title: De Facto World Map
date: 2026-10-08
modified: 2026-10-20
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

[Open the map full screen](/apps/de-facto-world-map/). Click any area for who controls it, how confident the assessment is, and the sources behind it.

The Winkel tripel, Equal Earth and Robinson projections show a flat-color atlas. The **Globe** and **Mercator** views work like Google Maps' layers, and the choices combine freely:
- a **base map**: plain, satellite imagery or a street map;
- **terrain**: relief shading, plus elevation colors on the plain base;
- **3D** terrain;
- a **country style**: filled, colored outlines, borders only or hidden;
- **map features** from OpenStreetMap: cities, states and provinces, parks and protected areas, Indigenous lands, military areas, major roads and airports.

Occupied, contested and insurgent regions have their own names and shading, which can be switched off. The borders follow OpenStreetMap's to within about 100 m, and full detail loads as you zoom in. You can download the current view as an image. The address bar keeps track of the view, so a link like [this one](/apps/de-facto-world-map/#p=winkel&z=40,15,4) opens straight onto a region.

## How to read it

- **Solid color:** territory governed by a state or a self-governing entity. Each one gets an identity color drawn from its flag or the color it traditionally has on maps (saffron India, green Russia, blue France, gray Germany), adjusted automatically so that neighbors are always distinguishable.
- **Stripes in a state's color:** territory under that state's military occupation, including annexations most of the world doesn't recognize, such as Crimea and the Golan Heights.
- **Dashed outlines:** territory someone claims but doesn't control, in the claimant's color.
- **Thin hatching:** insurgent presence, where an armed group operates or governs the countryside without holding territory outright.
- **Pale gray:** no controlling state. Antarctica's seven claims are drawn as dashed sectors and its research stations as dots in their operators' colors.

## Use it in Google Earth or Google Maps

The same layers are available as files you can open in Google's tools, with each area's controller, status, confidence, notes and sources attached:

- [**KMZ**](/apps/de-facto-world-map/data/export/de-facto-world-map.kmz) for Google Earth and Google My Maps
- [**GeoJSON**](/apps/de-facto-world-map/data/export/de-facto-world-map.geojson) for QGIS and other GIS tools
- [**Live link**](/apps/de-facto-world-map/data/export/de-facto-world-map-live.kml) for Google Earth Pro, which re-downloads the map daily so a saved copy stays current

To use them:

- **Google Earth on the web:** open [earth.google.com](https://earth.google.com/web/), choose **Projects**, then **New project** › **Import KML file from computer**, and pick the KMZ.
- **Google Earth Pro:** **File** › **Open** the KMZ, or the live link to keep it up to date.
- **Google My Maps:** at [mymaps.google.com](https://www.google.com/maps/d/), create a map, click **Import** under the first layer, and upload the KMZ. If the areas all come in one color, choose **Style by data column** › **controller**. Maps made this way also appear in the Google Maps app under **Saved** › **Maps**.

## How the borders are drawn

Who controls what comes from [Natural Earth](https://www.naturalearthdata.com/), which draws de facto lines, and from the curated areas below. The lines themselves come from [OpenStreetMap](https://www.openstreetmap.org/), so they match the street map and satellite imagery underneath. Areas held by armed groups are drawn from district boundaries ([geoBoundaries](https://www.geoboundaries.org/)) or OpenStreetMap features: the Philadelphi corridor, for example, is OpenStreetMap's Egypt–Gaza border widened to 400 m. Where the best source is a published map, as with Israel's line in southern Lebanon, it's traced from the image after fitting the image to known places. The tools for all this are described in the project's [data README](https://github.com/trchristensen-99/trevorc-site/tree/main/projects/de-facto-world-map/prep).

## What counts as control

An entity gets its own color when the recognized government exercises no real authority over its territory and the entity doesn't take part in that government. That's true whether or not it claims independence or anyone recognizes it. Somaliland, Taiwan, Northern Cyprus and Wa State qualify; Iraqi Kurdistan, which sits in Iraq's parliament and shares its budget, doesn't.

Some of the calls are judgment calls:

- **Puntland and Jubaland** are colored separately from Somalia. Neither claims independence, but both have refused the federal government's authority since 2024, and in 2026 Puntland seized federal bases while Jubaland rewrote its constitution to call itself a government rather than a federal state.
- **Northeast Syria** is shown as government-held. Damascus took over Raqqa, Deir ez-Zor, Hasakah, Qamishli and Kobani during 2026, and the SDF's former units now serve as army brigades after its dissolution in August. Islamic State cells still raid in the desert but hold no ground.
- **The West Bank** is shown as Israeli-occupied in full, though the Palestinian Authority administers civil affairs in Areas A and B.
- **Western Sahara** west of the berm is shown as Moroccan-controlled rather than occupied, since it was never another recognized state's territory; the Sahrawi Republic's claim to it is drawn instead.
- **North Korea** no longer claims the South: its March 2026 constitution dropped reunification and bounds its territory by the Republic of Korea. South Korea's claim to the whole peninsula is still drawn.
- **Rival governments** in a civil war (Yemen, Libya, Sudan) each claim the whole country, so those claims are left implicit rather than outlining every front line.
- **The Sahel** is shown as insurgent presence rather than control: JNIM and Islamic State dominate much of the countryside, but rarely hold towns for long.

## Data and sources

- **Countries:** [Natural Earth](https://www.naturalearthdata.com/) 1:10m countries and disputed areas (public domain), whose stated policy is to draw de facto borders, redrawn with [OpenStreetMap](https://www.openstreetmap.org/copyright)'s country borders by way of [Overture Maps](https://overturemaps.org/) (ODbL).
- **Conflict zones:** assembled from administrative units in [geoBoundaries](https://www.geoboundaries.org/) (CC BY and CC BY-SA), each assigned to a controller based on current reporting. Every area lists its own sources, date, and a confidence level.
- **Ukraine:** municipalities that are mostly occupied on [DeepStateMap](https://deepstatemap.live/)'s current map. DeepStateMap is the reference for which units are held, but its own geometry isn't redistributed here, so the front line is approximate at the scale of a municipality.
- **Antarctic stations:** [COMNAP](https://github.com/PolarGeospatialCenter/comnap-antarctic-facilities) (COMNAP 2017), free for non-commercial use.
- **Military bases abroad:** compiled from Wikipedia's lists of overseas military bases, with coordinates from Wikipedia and Wikidata, as of October 2026. Bases whose status is unclear, such as US bases in the Gulf after the Iran war, are marked uncertain.
- **Map features:** cities, states, parks, Indigenous lands, military areas, roads and airports from [OpenStreetMap](https://www.openstreetmap.org/copyright) through [OpenFreeMap](https://openfreemap.org).
- **Base maps:** satellite imagery from [EOxCloudless 2025](https://cloudless.eox.at) by EOX IT Services (modified Copernicus Sentinel-2 data, CC BY-NC-SA 4.0); elevation from [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, from SRTM, GMTED2010, ETOPO1 and others); streets and place names from [OpenFreeMap](https://openfreemap.org) and [OpenStreetMap](https://www.openstreetmap.org/copyright); drawn with [MapLibre](https://maplibre.org).

The map data is released under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/), since its borders come from OpenStreetMap; credit "© OpenStreetMap contributors" along with this site. The Antarctic stations layer keeps COMNAP's non-commercial terms. The control assessments are mine, and front lines move; corrections are welcome through the [contact page](../contact).

## Changelog

- **15 October 2026:** borders redrawn from OpenStreetMap, accurate to about 100 m, with full detail when zoomed in; the Philadelphi corridor, which separates Hamas-held Gaza from Egypt; map layers that combine like Google Maps' (base, terrain, country style, and OpenStreetMap features such as cities, states, parks, Indigenous lands and military areas); names for occupied, contested and insurgent regions; a layer of military bases abroad.
- **15 October 2026:** satellite, terrain and street base maps on a 3D globe, with optional 3D terrain; downloads for Google Earth, Google My Maps and GIS tools.
- **8 October 2026:** Houthi gains on the Red Sea coast and around Taiz, and a Yemeni front-line layer; Israel's occupation of southern Lebanon; a retraced Gaza yellow line on a more accurate outline of the Strip; Sudan, Somalia, Congo and Myanmar updated to late-September reporting; full-resolution borders when zoomed in; Mercator fixed.
- **October 2026:** first version, with control as of early October 2026.
