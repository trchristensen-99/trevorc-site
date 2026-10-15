# Building the map data

Everything the app loads lives in `../data`, built from public sources plus
the curated files here. The site build doesn't run any of this; the output is
committed.

```sh
npm install
npm run fetch   # downloads the sources into raw/ (about 8 minutes)
npm run build   # writes ../data (about 5 minutes; the border step is cached)
```

## What goes in

- `raw/ne/`: Natural Earth 1:10m countries, disputed areas and provinces. It
  decides who holds what, since it draws de facto lines and features such as
  Somaliland or Northern Cyprus.
- `raw/overture/`: OpenStreetMap's country borders by way of Overture Maps.
  `base.mjs` redraws Natural Earth's countries with these borders, accurate to
  about 100 m instead of Natural Earth's kilometer or so.
- `raw/gb/`: geoBoundaries districts, used to draw areas held by armed groups
  and the like.
- `raw/osm/`: OpenStreetMap boundary relations named in the curated files,
  fetched on first use.
- `raw/deepstate/`: DeepStateMap's current snapshot, used only to decide which
  Ukrainian municipalities are occupied. Its geometry isn't shipped.
- `raw/comnap/`: Antarctic stations.

The curated files:

- `entities.json`: who's who (names, kinds, recognition, colors to keep).
- `areas.json`: every place where control differs from the base map, in order.
  Each area is carved out of whatever it overlaps.
- `claims.json`, `presence.json`, `bases.json`, `bases-abroad.json`.
- `zones/`: hand-drawn or traced shapes that areas refer to.

## Drawing an area

An area's `geometry` is a recipe. The full list is at the top of `build.mjs`;
the useful ones:

| Recipe | Gives |
| --- | --- |
| `{"gb": {"set": "YEM-ADM2", "names": [...], "within": ["YE-SD"], "except": [...]}}` | districts by name or province |
| `{"ne_disputed": "B16"}`, `{"ne_country": "PSX"}`, `{"ne_admin1": ["SY-SU"]}` | Natural Earth shapes |
| `{"osm_relation": 1473938}` | any OpenStreetMap boundary (a district, neighbourhood, park) by relation ID |
| `{"osm_border": ["EG", "XG"]}` | OpenStreetMap's border line between two countries |
| `{"line": [[lon, lat], ...]}` | a hand-drawn line |
| `{"buffer": {"of": r, "km": 0.4}}` | a line or area widened |
| `{"split": {"of": r, "by": line, "keep": [lon, lat]}}` | an area cut along a line, keeping one side |
| `{"file": "zones/x.geojson"}`, `{"polygon": [[lon, lat], ...]}` | your own shapes |
| `{"union": [...]}`, `{"minus": [...]}`, `{"intersect": [a, b]}`, `{"area": "id"}` | combinations |

Lines that follow real features are best drawn from OpenStreetMap: find the
relation for a district or neighbourhood on openstreetmap.org (the number in
its URL), or cut an area along a road or border with `split`. The Philadelphi
corridor, for example, is OpenStreetMap's Egypt-Gaza border widened to 400 m.

## Tracing a published map

Most control maps (Wikipedia's, news graphics) are images. `tools/trace.py`
fits an image to real coordinates from a few places visible on it and traces
one color into GeoJSON for `zones/`:

```sh
python3 -I tools/trace.py map.png points.json --color "#f0c75e" -o zones/name.geojson
```

Run it with `--help` for the options. It prints each control point's error in
meters; southern Lebanon was traced this way from the Guardian's map, to
within about 300 m.

## What comes out

- `map.topo.json`: simplified to 6 km, for the atlas and the first view.
- `map-hi.topo.json`: 300 m, for the globe and Mercator views.
- `cells/`: full detail, one file per zoom-6 map tile, loaded as you zoom in.
- `entities.json`, `details.json`, `bases.json`, `abroad.json`, `meta.json`.
- `export/`: the KMZ for Google Earth and My Maps, the GeoJSON, and the
  live link for Google Earth Pro (written by `export.mjs`).

The data is ODbL 1.0, since the borders come from OpenStreetMap.
