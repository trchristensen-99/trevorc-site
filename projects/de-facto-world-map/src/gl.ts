// The globe and Mercator views, drawn with MapLibre: a base (plain,
// satellite imagery or a street map), optional terrain shading, the de facto
// layers, and reference features from OpenStreetMap (cities, states, parks,
// Indigenous lands, military areas, roads, airports) that can be switched on
// like Google Maps' layers. MapLibre loads on first use from vendor/ (see
// vendor.json), so the default atlas view doesn't pay for it.

import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MLMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import { GeoJSONVT, type GeoJSONVTTile } from "@maplibre/geojson-vt"
import { fromGeojsonVt } from "@maplibre/vt-pbf"
import { feature as topoFeature } from "topojson-client"
import type { GeometryCollection, Topology } from "topojson-specification"
import {
  detail,
  labelSize,
  regionNames,
  type Detail,
  type F,
  type Hit,
  type LayerId,
  type MapData,
  type MapTopology,
  type ProjectionId,
  type Renderer,
  type Theme,
} from "./map"
import type { BaseAbroad, FeatureProps, Station } from "./types"

type MapLibre = typeof import("maplibre-gl")

export const GL_PROJECTIONS: ProjectionId[] = ["globe", "mercator"]

export const BASES = { plain: "Plain", satellite: "Satellite", streets: "Streets" } as const
export type BaseId = keyof typeof BASES
export const COUNTRY_STYLES = { fill: "Filled", outline: "Colored outlines", lines: "Borders only", off: "Hidden" } as const
export type CountryStyle = keyof typeof COUNTRY_STYLES
export const MAP_FEATURES = {
  cities: "Cities and towns",
  states: "States and provinces",
  parks: "Parks and protected areas",
  indigenous: "Indigenous lands",
  military: "Military areas",
  roads: "Major roads",
  airports: "Airports",
} as const
export type MapFeature = keyof typeof MAP_FEATURES

export interface GlOptions {
  base: BaseId
  terrain: boolean // relief shading, plus elevation colors on the plain base
  relief3d: boolean
  countries: CountryStyle
  features: Set<MapFeature>
}

// ------------------------------------------------------------- sources

const OFM = "https://tiles.openfreemap.org"
const SAT_YEAR = 2025
const SATELLITE: SourceSpecification = {
  type: "raster",
  tiles: [`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${SAT_YEAR}_3857/default/g/{z}/{y}/{x}.jpg`],
  tileSize: 256,
  maxzoom: 15,
  attribution:
    `<a href="https://cloudless.eox.at" target="_blank">EOxCloudless ${SAT_YEAR}</a> by EOX IT Services GmbH ` +
    `(contains modified Copernicus Sentinel data ${SAT_YEAR})`,
}
const dem = (): SourceSpecification => ({
  type: "raster-dem",
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  tileSize: 256,
  maxzoom: 15,
  encoding: "terrarium",
  attribution:
    `<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Terrain Tiles</a> ` +
    `(Mapzen; SRTM, GMTED2010, ETOPO1 and others)`,
})
const DATA_CREDIT = `De facto borders: <a href="/projects/de-facto-world-map" target="_top">trevorc.com</a>, from © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors`
const OSM_CREDIT = "OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors"

// OpenFreeMap's styles supply the street map, place names and fonts.
const styleCache = new Map<string, Promise<StyleSpecification>>()
function ofmStyle(name: "positron" | "dark") {
  if (!styleCache.has(name))
    styleCache.set(name, fetch(`${OFM}/styles/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${r.status} loading the ${name} street style`)
      return r.json()
    }))
  return styleCache.get(name)!
}

let library: Promise<MapLibre> | null = null
function loadLibrary(): Promise<MapLibre> {
  if (!library) {
    const base = new URL("./vendor/maplibre/", import.meta.url)
    const css = document.createElement("link")
    css.rel = "stylesheet"
    css.href = new URL("maplibre-gl.css", base).href
    document.head.append(css)
    library = import(/* @vite-ignore */ new URL("maplibre-gl.mjs", base).href) as Promise<MapLibre>
  }
  return library
}

// --------------------------------------------------------- full detail

// From this zoom on, the control layer comes from full-resolution cells
// (one file per zoom-6 tile, written by prep/cells.mjs), cut into map tiles
// here in the browser through a "dfm://" tile protocol. Below it, the 300 m
// data in map-hi.topo.json is plenty.
const DETAIL_Z = 6
const cellUrl = (f: string) => new URL(`./data/cells/${f}`, import.meta.url).href
let cellList: Promise<Set<string>> | null = null
const cells = new Map<string, Promise<GeoJSONVT | null>>()
let cellColors: Record<string, string> = {}

type CellTopology = Topology<{
  control: GeometryCollection<FeatureProps>
  outline: GeometryCollection<{ c: string }>
  borders: GeometryCollection
}>

function loadCell(key: string) {
  if (!cells.has(key))
    cells.set(key, (async () => {
      cellList ??= fetch(cellUrl("index.json")).then((r) => r.json()).then((j: { cells: string[] }) => new Set(j.cells))
      if (!(await cellList).has(key)) return null
      const r = await fetch(cellUrl(`${key}.json`))
      if (!r.ok) throw new Error(`${r.status} loading detail cell ${key}`)
      const topo = (await r.json()) as CellTopology
      const color = (c: string) => cellColors[c] ?? "#9a9a9a"
      const control = (topoFeature(topo, topo.objects.control) as FeatureCollection<Geometry, FeatureProps>).features
        .map((f) => ({ ...f, properties: { ...f.properties, _l: "control", col: color(f.properties.c) } }))
      const outline = (topoFeature(topo, topo.objects.outline) as FeatureCollection<Geometry, { c: string }>).features
        .map((f) => ({ ...f, properties: { _l: "outline", c: f.properties.c, col: color(f.properties.c) } }))
      const borders = (topoFeature(topo, topo.objects.borders) as unknown as Feature<Geometry>).geometry
      return new GeoJSONVT(
        { type: "FeatureCollection", features: [...control, ...outline, { type: "Feature", properties: { _l: "borders" }, geometry: borders }] },
        { maxZoom: 14, indexMaxZoom: DETAIL_Z, tolerance: 1, extent: 4096, buffer: 64 },
      )
    })())
  return cells.get(key)!
}

let protocolAdded = false
function addDetailProtocol(lib: MapLibre) {
  if (protocolAdded) return
  protocolAdded = true
  lib.addProtocol("dfm", async (params) => {
    const [z, x, y] = params.url.replace("dfm://", "").split("/").map(Number)
    const shift = z - DETAIL_Z
    const index = shift >= 0 ? await loadCell(`${x >> shift}-${y >> shift}`) : null
    const tile = index?.getTile(z, x, y)
    const layers: Record<string, { features: unknown[] }> = { control: { features: [] }, outline: { features: [] }, borders: { features: [] } }
    for (const f of tile?.features ?? []) layers[(f.tags as { _l: string })._l]?.features.push(f)
    return { data: fromGeojsonVt(layers as unknown as Record<string, GeoJSONVTTile>, { version: 2, extent: 4096 }) }
  })
}

// ------------------------------------------------------------ appearance

interface Look {
  land: string
  sea: string
  fill: number // opacity of country fills
  border: string
  ink: string // label text
  halo: string
  regionInk: "dark" | "light" // which tint of a region's color its name uses
  road: string
}
function lookFor(base: BaseId, dark: boolean): Look {
  if (base === "satellite")
    return { land: "#0b1a2a", sea: "#0b1a2a", fill: 0.42, border: "#ffffff", ink: "#ffffff", halo: "rgba(0,0,0,0.85)", regionInk: "light", road: "rgba(255,236,170,0.75)" }
  return dark
    ? { land: "#262b31", sea: "#121c26", fill: base === "streets" ? 0.55 : 0.62, border: "#c9d1d9", ink: "#eef1f4", halo: "#0e141a", regionInk: "light", road: "#58616b" }
    : { land: "#efede6", sea: "#b9d3e6", fill: base === "streets" ? 0.38 : 0.62, border: "#3a4652", ink: "#1d2329", halo: "#ffffff", regionInk: "dark", road: "#b5b0a6" }
}

// Elevation colors for the plain base with terrain on, sea floor included.
const RELIEF: ExpressionSpecification = [
  "interpolate", ["linear"], ["elevation"],
  -10000, "#0b2b50", -5000, "#1f4f82", -2000, "#3f78ad", -200, "#7fb0d8", -1, "#acd0ea",
  0, "#9fc493", 200, "#bcd49b", 600, "#dfdca9", 1200, "#dcc596", 2000, "#c6a27c", 3000, "#ae8c78", 4200, "#dcd6d0", 5500, "#ffffff",
]

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
const mix = (c: string, d: string, t: number) => {
  const a = hex(c), b = hex(d)
  return toHex(a.map((v, i) => v + (b[i] - v) * t))
}

// A tileable square of diagonal stripes, for occupation, contested and
// presence fills. `gap` is the color between stripes (alpha 0 for none).
function stripes(ink: [number, number, number, number], gap: [number, number, number, number], width: number, flip = false) {
  const size = 16
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const on = ((flip ? x - y + size : x + y) % size) < width
      data.set(on ? ink : gap, (y * size + x) * 4)
    }
  return { width: size, height: size, data }
}

const PLACE_NAME: ExpressionSpecification = [
  "case", ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
  ["coalesce", ["get", "name_en"], ["get", "name"]],
]

// Which style layers belong to each switchable feature (city layers are
// added as the style is built, since they come from OpenFreeMap's style).
const FEATURE_LAYERS: Record<MapFeature, string[]> = {
  cities: [],
  states: ["ref-states-line", "ref-states-label"],
  parks: ["ref-parks-fill", "ref-parks-line", "ref-parks-label"],
  indigenous: ["ref-indigenous-line", "ref-indigenous-label"],
  military: ["ref-military-fill", "ref-military-line", "ref-military-label"],
  roads: ["ref-roads"],
  airports: ["ref-airports"],
}

// ---------------------------------------------------------------- map

export async function createGlMap(container: HTMLElement, data: MapData, options: GlOptions, theme: Theme) {
  const lib = await loadLibrary()
  addDetailProtocol(lib)
  cellColors = Object.fromEntries(Object.entries(data.entities).map(([c, e]) => [c, e.color]))
  const m = new GlMap(lib, container, data, options, theme)
  await m.ready
  return m
}

export class GlMap implements Renderer {
  onHover: (hit: Hit | null, at: [number, number]) => void = () => {}
  onSelect: (hit: Hit | null) => void = () => {}
  onStation: (s: Station) => void = () => {}
  onBase: (b: BaseAbroad) => void = () => {}
  onNeedDetail: () => void = () => {}
  onViewChange: () => void = () => {}

  readonly ready: Promise<void>
  private map: MLMap
  private d: Detail
  private projection: ProjectionId = "globe"
  private layers = new Set<LayerId>(["labels", "regions", "shading", "claims", "presence", "stations", "bases"])
  private styleLoaded = false
  private options: GlOptions
  private cityLayers: string[] = []

  constructor(lib: MapLibre, container: HTMLElement, private data: MapData, options: GlOptions, private theme: Theme) {
    this.options = { ...options, features: new Set(options.features) }
    this.d = detail(data.topo)
    this.map = new lib.Map({
      container,
      style: { version: 8, sources: {}, layers: [] },
      center: [20, 20],
      zoom: 1,
      attributionControl: {},
      canvasContextAttributes: { preserveDrawingBuffer: true },
      maxZoom: 18,
    })
    this.map.addControl(new lib.NavigationControl({ visualizePitch: true }), "bottom-right")
    this.map.setMissingStyleImageResolver((id) => this.makeImage(id))
    this.map.on("moveend", () => this.onViewChange())
    this.map.on("mousemove", (e) => this.onHover(this.hitAt(e), [e.point.x, e.point.y]))
    this.map.getCanvas().addEventListener("mouseleave", () => this.onHover(null, [0, 0]))
    this.map.on("click", (e) => {
      const point = this.visibleLayers(["dfm-bases", "dfm-stations"])
      const p = point.length ? this.map.queryRenderedFeatures(e.point, { layers: point })[0] : undefined
      if (p?.layer.id === "dfm-bases") {
        const b = this.data.abroad[p.properties.i as number]
        if (b) return this.onBase(b)
      }
      if (p?.layer.id === "dfm-stations") {
        const s = this.data.stations.find((x) => x.name === p.properties.name)
        if (s) return this.onStation(s)
      }
      this.onSelect(this.hitAt(e))
    })
    // Phones start with the credits folded behind MapLibre's (i) button,
    // where they'd otherwise cover the legend. MapLibre opens them when it
    // first fills them in, so this waits for an idle frame after that.
    const fold = () => {
      const credits = container.querySelector(".maplibregl-ctrl-attrib")
      if (!credits || !matchMedia("(max-width: 640px)").matches) return this.map.off("idle", fold)
      if (credits.classList.contains("maplibregl-attrib-empty")) return
      credits.classList.remove("maplibregl-compact-show")
      credits.removeAttribute("open")
      this.map.off("idle", fold)
    }
    this.map.on("idle", fold)
    this.ready = this.restyle()
  }

  get isGlobe() {
    return this.projection === "globe"
  }

  // ------------------------------------------------------------ public

  setProjection(id: ProjectionId) {
    this.projection = id === "globe" ? "globe" : "mercator"
    if (this.styleLoaded) this.map.setProjection({ type: this.projection })
  }

  setLayer(id: LayerId, on: boolean) {
    if (on) this.layers.add(id)
    else this.layers.delete(id)
    if (this.styleLoaded) this.applyLayers()
  }

  // Base and terrain changes rebuild the style; the rest only switch layers
  // on and off.
  setOptions(o: GlOptions) {
    const rebuild = o.base !== this.options.base || o.terrain !== this.options.terrain
    this.options = { ...o, features: new Set(o.features) }
    if (rebuild) void this.restyle()
    else if (this.styleLoaded) this.applyLayers()
  }

  setTheme(t: Theme) {
    const changed = t.dark !== this.theme.dark
    this.theme = t
    // The satellite base looks the same either way.
    if (changed && this.options.base !== "satellite") void this.restyle()
  }

  setDetail(topo: MapTopology) {
    this.d = detail(topo)
    if (this.styleLoaded) this.pushData()
  }

  resize() {
    this.map.resize()
  }

  // The zoom at which the whole world fits, so `k` means the same here as
  // in the atlas view (1 = whole world).
  private worldZoom() {
    const c = this.map.getContainer()
    const w = c.clientWidth || 800
    const h = c.clientHeight || 500
    return this.isGlobe ? Math.log2((0.9 * Math.min(w, h) * Math.PI) / 512) : Math.log2(w / 512)
  }

  focus(lonLat: [number, number], k: number) {
    this.map.jumpTo({ center: lonLat, zoom: this.worldZoom() + Math.log2(Math.max(1, k)) })
  }

  view(): [number, number, number] {
    const c = this.map.getCenter()
    return [c.lng, c.lat, 2 ** (this.map.getZoom() - this.worldZoom())]
  }

  async exportImage(title: string) {
    await new Promise<void>((r) => {
      this.map.once("idle", () => r())
      this.map.triggerRepaint()
    })
    const src = this.map.getCanvas()
    const out = document.createElement("canvas")
    out.width = src.width
    out.height = src.height
    const g = out.getContext("2d")!
    g.drawImage(src, 0, 0)
    // Keep the credits with the image.
    const credits = [title, ...this.credits()].join("  ·  ")
    const px = Math.max(11, Math.round(out.width / 140))
    g.font = `${px}px system-ui, sans-serif`
    const w = g.measureText(credits).width
    g.fillStyle = "rgba(255,255,255,0.8)"
    g.fillRect(out.width - w - px * 1.2, out.height - px * 1.8, w + px * 1.2, px * 1.8)
    g.fillStyle = "#1d2329"
    g.fillText(credits, out.width - w - px * 0.6, out.height - px * 0.55)
    const blob = await new Promise<Blob>((r, j) => out.toBlob((b) => (b ? r(b) : j(new Error("export failed"))), "image/png"))
    return { blob, ext: "png" }
  }

  destroy() {
    this.map.remove()
  }

  // --------------------------------------------------------------- style

  // Credits for the sources actually on screen.
  private credits() {
    const text = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&copy;/g, "©")
    const style = this.map.getStyle()
    const used = new Set(
      style.layers
        .filter((l) => (l.layout as { visibility?: string } | undefined)?.visibility !== "none")
        .map((l) => ("source" in l ? l.source : "")),
    )
    if (this.options.relief3d) used.add("dem3d")
    const out = Object.entries(style.sources)
      .filter(([id]) => used.has(id))
      .map(([id, x]) => (id === "openmaptiles" ? OSM_CREDIT : "attribution" in x && x.attribution ? text(x.attribution) : ""))
      .filter(Boolean)
    return [...new Set(out)]
  }

  private look() {
    return lookFor(this.options.base, this.theme.dark)
  }

  private async restyle() {
    const style = await this.buildStyle()
    this.styleLoaded = false
    await new Promise<void>((resolve) => {
      this.map.once("style.load", () => resolve())
      this.map.setStyle(style, { diff: false })
    })
    this.styleLoaded = true
    this.pushData()
    this.applyLayers()
    this.onNeedDetail()
  }

  private async buildStyle(): Promise<StyleSpecification> {
    const { base, terrain } = this.options
    const L = this.look()
    const ofm = await ofmStyle(this.theme.dark && base !== "satellite" ? "dark" : "positron")
    const sources: StyleSpecification["sources"] = { openmaptiles: ofm.sources.openmaptiles, dem: dem(), dem3d: dem() }
    const hillshade = (strength: number): LayerSpecification => ({
      id: "hillshade", type: "hillshade", source: "dem",
      paint: {
        "hillshade-exaggeration": strength, "hillshade-shadow-color": "#3a3328", "hillshade-highlight-color": "#ffffff",
        "hillshade-illumination-anchor": "map",
      },
    })

    let under: LayerSpecification[] = [] // below the country fills
    let between: LayerSpecification[] = [] // above the fills, below lines
    if (base === "plain") {
      under = [{ id: "land", type: "background", paint: { "background-color": L.land } }]
      if (terrain) under.push({ id: "relief", type: "color-relief", source: "dem", paint: { "color-relief-color": RELIEF } })
      // Water goes over the country fills, so coastlines follow
      // OpenStreetMap's rather than the coarser ones in the border data.
      between = [
        {
          id: "water", type: "fill", source: "openmaptiles", "source-layer": "water",
          filter: ["!=", ["get", "brunnel"], "tunnel"],
          paint: { "fill-color": terrain ? "#9cc6e6" : L.sea, "fill-opacity": terrain ? 0.6 : 1 },
        },
        {
          id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway", minzoom: 6,
          filter: ["match", ["get", "class"], ["river", "canal"], true, false],
          paint: { "line-color": L.sea, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 12, 2] },
        },
      ]
      if (terrain) between.push(hillshade(0.35))
    } else if (base === "satellite") {
      sources.satellite = SATELLITE
      under = [
        { id: "space", type: "background", paint: { "background-color": L.land } },
        { id: "satellite", type: "raster", source: "satellite", paint: { "raster-fade-duration": 150 } },
      ]
      if (terrain) under.push(hillshade(0.25))
    } else {
      // The street map minus its own borders and country, state and place
      // names, which would contradict or duplicate the layers here. Its
      // water and roads go over the country fills.
      const kept = ofm.layers.filter(
        (l) =>
          !/boundary|country|state/.test(l.id) &&
          !("source" in l && l.source === "ne2_shaded") &&
          !(l.type === "symbol" && "source-layer" in l && l["source-layer"] === "place"),
      )
      const bg = kept.findIndex((l) => l.type === "background")
      under = kept.slice(0, bg + 1)
      between = kept.slice(bg + 1)
      if (terrain) between.splice(between.findIndex((l) => l.id === "water") + 1, 0, hillshade(0.3))
    }

    return {
      version: 8,
      glyphs: ofm.glyphs,
      sprite: ofm.sprite,
      projection: { type: this.projection },
      sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
      sources: {
        ...sources,
        "dfm-control": { type: "geojson", data: empty(), attribution: DATA_CREDIT },
        "dfm-detail": { type: "vector", tiles: ["dfm://{z}/{x}/{y}"], minzoom: DETAIL_Z, maxzoom: 14 },
        "dfm-borders": { type: "geojson", data: empty() },
        "dfm-claims": { type: "geojson", data: empty() },
        "dfm-presence": { type: "geojson", data: empty() },
        "dfm-stations": { type: "geojson", data: empty() },
        "dfm-bases": { type: "geojson", data: empty() },
        "dfm-labels": { type: "geojson", data: empty() },
        "dfm-regions": { type: "geojson", data: empty() },
      },
      layers: [
        ...under,
        ...this.fills(),
        ...between.filter((l) => l.type !== "symbol"),
        ...this.featureAreas(),
        ...this.lines(),
        ...this.points(),
        ...between.filter((l) => l.type === "symbol"), // street and water names
        ...this.featureLabels(ofm),
        ...this.labelLayers(),
      ],
    }
  }

  private fills(): LayerSpecification[] {
    const L = this.look()
    const control = (id: string, rest: object) => both(id, "control", rest)
    return [
      ...control("dfm-fill", { type: "fill", paint: { "fill-color": ["get", "col"], "fill-opacity": L.fill } }),
      ...control("dfm-occ", { type: "fill", filter: ["==", ["get", "k"], "occupation"], paint: { "fill-pattern": ["concat", "occ-", ["get", "c"]], "fill-opacity": 0.9 } }),
      ...control("dfm-contested", { type: "fill", filter: ["==", ["get", "k"], "contested"], paint: { "fill-pattern": "contested", "fill-opacity": 0.9 } }),
      { id: "dfm-presence", type: "fill", source: "dfm-presence", paint: { "fill-pattern": ["concat", "pres-", ["get", "c"]], "fill-opacity": 0.9 } },
      // Invisible copies that answer "what's under the pointer".
      ...control("dfm-hit", { type: "fill", paint: { "fill-opacity": 0 } }),
      { id: "dfm-claims-hit", type: "fill", source: "dfm-claims", paint: { "fill-opacity": 0 } },
    ]
  }

  private featureAreas(): LayerSpecification[] {
    const sat = this.options.base === "satellite"
    return [
      {
        id: "ref-parks-fill", type: "fill", source: "openmaptiles", "source-layer": "park",
        paint: { "fill-color": "#3f9a4f", "fill-opacity": sat ? 0.18 : 0.22 },
      },
      { id: "ref-parks-line", type: "line", source: "openmaptiles", "source-layer": "park", paint: { "line-color": "#2f7a3e", "line-width": 0.8, "line-opacity": 0.8 } },
      {
        id: "ref-military-fill", type: "fill", source: "openmaptiles", "source-layer": "landuse",
        filter: ["==", ["get", "class"], "military"], paint: { "fill-color": "#b03a2e", "fill-opacity": 0.22 },
      },
      {
        id: "ref-military-line", type: "line", source: "openmaptiles", "source-layer": "landuse",
        filter: ["==", ["get", "class"], "military"], paint: { "line-color": "#b03a2e", "line-width": 1, "line-dasharray": [2, 1] },
      },
      {
        id: "ref-roads", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 4,
        filter: ["all", ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false], ["!=", ["get", "brunnel"], "tunnel"]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": this.look().road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, ["match", ["get", "class"], "motorway", 0.8, 0.4], 10, ["match", ["get", "class"], "motorway", 2.4, 1.4], 14, 4],
        },
      },
    ]
  }

  private lines(): LayerSpecification[] {
    const L = this.look()
    return [
      { id: "dfm-presence-line", type: "line", source: "dfm-presence", paint: { "line-color": ["get", "col"], "line-width": 1, "line-opacity": 0.8 } },
      {
        id: "ref-states-line", type: "line", source: "openmaptiles", "source-layer": "boundary", minzoom: 2,
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": L.border, "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 8, 1.2], "line-dasharray": [3, 2] },
      },
      {
        id: "ref-indigenous-line", type: "line", source: "openmaptiles", "source-layer": "boundary",
        filter: ["==", ["get", "class"], "aboriginal_lands"],
        paint: { "line-color": "#a0522d", "line-width": 1.4, "line-dasharray": [4, 2] },
      },
      // Each controller's edge drawn just inside its territory, so a shared
      // border shows both sides' colors.
      ...both("dfm-outline", "outline", {
        type: "line", filter: ["!=", ["get", "c"], "none"],
        layout: { "line-join": "round" },
        paint: {
          "line-color": ["get", "col"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 6, 2.6, 10, 3.5],
          "line-offset": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 1.3, 10, 1.75],
        },
      }),
      ...both("dfm-borders", "borders", {
        type: "line", layout: { "line-join": "round" },
        paint: { "line-color": L.border, "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 5, 1.2, 10, 2] },
      }),
      { id: "dfm-claims-halo", type: "line", source: "dfm-claims", paint: { "line-color": L.halo, "line-width": 3, "line-opacity": 0.5 } },
      { id: "dfm-claims", type: "line", source: "dfm-claims", paint: { "line-color": ["get", "ink"], "line-width": 1.6, "line-dasharray": [3, 2] } },
    ]
  }

  private points(): LayerSpecification[] {
    return [
      {
        id: "dfm-stations", type: "circle", source: "dfm-stations",
        paint: { "circle-radius": 4, "circle-color": ["get", "col"], "circle-stroke-color": "#1d2329", "circle-stroke-width": 0.8 },
      },
      {
        id: "dfm-bases", type: "circle", source: "dfm-bases",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.6, 6, 4.5],
          "circle-color": ["get", "col"], "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 1, 1, 6, 1.6],
        },
      },
    ]
  }

  // Place names and the labels of the switchable features, from
  // OpenFreeMap's tiles.
  private featureLabels(ofm: StyleSpecification): LayerSpecification[] {
    const L = this.look()
    const text = { "text-color": L.ink, "text-halo-color": L.halo, "text-halo-width": 1.3 }
    // City, town and village names follow the street style's own rules for
    // when each class appears, recolored for the base. Names are in Latin
    // script with the local script beneath.
    const places = ofm.layers
      .filter((l) => l.type === "symbol" && "source-layer" in l && l["source-layer"] === "place" && !/country|state/.test(l.id))
      .map((l) => ({ ...l, id: `ref-cities-${l.id}`, paint: { ...(l as { paint?: object }).paint, ...text } }) as LayerSpecification)
    this.cityLayers = places.map((l) => l.id)
    const italic = (color: string) => ({ "text-color": color, "text-halo-color": L.halo, "text-halo-width": 1.2 })
    const sat = this.options.base === "satellite"
    return [
      ...places,
      {
        id: "ref-states-label", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 3,
        filter: ["==", ["get", "class"], "state"],
        layout: { "text-field": PLACE_NAME, "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 7, 13], "text-transform": "uppercase", "text-letter-spacing": 0.08, "text-max-width": 8 },
        paint: { ...text, "text-opacity": 0.75 },
      },
      {
        id: "ref-parks-label", type: "symbol", source: "openmaptiles", "source-layer": "park", minzoom: 6,
        layout: { "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]], "text-font": ["Noto Sans Italic"], "text-size": 11, "text-max-width": 8 },
        paint: italic(sat ? "#bdf0c4" : "#2f6b3a"),
      },
      {
        id: "ref-indigenous-label", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 5,
        filter: ["==", ["get", "class"], "aboriginal_lands"],
        layout: { "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]], "text-font": ["Noto Sans Italic"], "text-size": 11.5, "text-max-width": 8 },
        paint: italic(sat ? "#f3c9a8" : "#8a4422"),
      },
      {
        id: "ref-military-label", type: "symbol", source: "openmaptiles", "source-layer": "aerodrome_label", minzoom: 6,
        filter: ["==", ["get", "class"], "military"],
        layout: { "text-field": ["concat", "✈ ", ["coalesce", ["get", "name_en"], ["get", "name"]]], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-max-width": 9 },
        paint: italic(sat ? "#ffb4ab" : "#9b2c22"),
      },
      {
        id: "ref-airports", type: "symbol", source: "openmaptiles", "source-layer": "aerodrome_label", minzoom: 6,
        filter: ["match", ["get", "class"], ["international", "public", "regional"], true, false],
        layout: {
          "text-field": ["concat", "✈ ", ["coalesce", ["get", "iata"], ["get", "name_en"], ["get", "name"]]],
          "text-font": ["Noto Sans Regular"], "text-size": 11,
        },
        paint: text,
      },
    ]
  }

  // Country and region names appear once the area is wide enough on screen
  // to hold them; each feature carries the zoom where that happens (mz),
  // and one layer per whole zoom level shows those that fit from then on.
  private labelLayers(): LayerSpecification[] {
    const L = this.look()
    const countries = Array.from({ length: 10 }, (_, z): LayerSpecification => ({
      id: `dfm-labels-${z}`,
      type: "symbol",
      source: "dfm-labels",
      minzoom: z,
      filter: ["==", ["get", "mz"], z],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["get", "size"],
        "symbol-sort-key": ["-", 0, ["get", "km2"]],
        "text-max-width": 8,
      },
      paint: { "text-color": L.ink, "text-halo-color": L.halo, "text-halo-width": 1.6 },
    }))
    const regions = Array.from({ length: 12 }, (_, z): LayerSpecification => ({
      id: `dfm-regions-${z}`,
      type: "symbol",
      source: "dfm-regions",
      minzoom: z,
      filter: ["==", ["get", "mz"], z],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Italic"],
        "text-size": ["get", "size"],
        "symbol-sort-key": ["-", 0, ["get", "km2"]],
        "text-max-width": 7,
      },
      paint: { "text-color": ["get", L.regionInk], "text-halo-color": L.halo, "text-halo-width": 1.5 },
    }))
    return [...regions, ...countries]
  }

  private has(id: string) {
    return !!this.map.getLayer(id)
  }

  private visibleLayers(ids: string[]) {
    return ids.filter((id) => this.has(id) && this.map.getLayoutProperty(id, "visibility") !== "none")
  }

  private applyLayers() {
    const vis = (ids: string[], on: boolean) => {
      for (const id of ids) if (this.has(id)) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    }
    const o = this.options
    const shading = this.layers.has("shading")
    const L = this.look()

    // Countries: filled, outlined in their colors, borders only, or hidden.
    // Without shading, occupied land shows as its occupier's and contested
    // land as nobody's.
    const kinds = ["control", "dependency", "lease", "international", ...(shading ? [] : ["occupation"])]
    const controlled: FilterSpecification = ["all", ["match", ["get", "k"], kinds, true, false], ["!=", ["get", "c"], "none"]]
    const pair = (id: string) => [id, `${id}-d`]
    for (const id of pair("dfm-fill")) this.map.setFilter(id, controlled)
    vis(pair("dfm-fill"), o.countries === "fill")
    vis(pair("dfm-outline"), o.countries === "outline")
    vis(pair("dfm-borders"), o.countries !== "off")
    const thin = o.countries === "outline"
    for (const id of pair("dfm-borders")) {
      this.map.setPaintProperty(id, "line-color", thin ? (this.theme.dark || o.base === "satellite" ? "#0b0f14" : "#ffffff") : L.border)
      this.map.setPaintProperty(id, "line-opacity", thin ? 0.5 : 0.9)
    }
    vis([...pair("dfm-occ"), ...pair("dfm-contested")], shading)

    vis(Array.from({ length: 10 }, (_, z) => `dfm-labels-${z}`), this.layers.has("labels"))
    vis(Array.from({ length: 12 }, (_, z) => `dfm-regions-${z}`), this.layers.has("regions"))
    vis(["dfm-claims", "dfm-claims-halo", "dfm-claims-hit"], this.layers.has("claims"))
    vis(["dfm-presence", "dfm-presence-line"], this.layers.has("presence"))
    vis(["dfm-stations"], this.layers.has("stations"))
    vis(["dfm-bases"], this.layers.has("bases"))
    for (const [f, ids] of Object.entries(FEATURE_LAYERS) as [MapFeature, string[]][])
      vis(f === "cities" ? this.cityLayers : ids, o.features.has(f) && !(f === "roads" && o.base === "streets"))
    this.map.setTerrain(o.relief3d ? { source: "dem3d", exaggeration: 1.5 } : null)
  }

  // --------------------------------------------------------------- data

  private colorOf(c: string) {
    return this.data.entities[c]?.color ?? "#9a9a9a"
  }

  private pushData() {
    const d = this.d
    const withColor = (fs: F[]): FeatureCollection<Geometry> => ({
      type: "FeatureCollection",
      features: fs.map((f) => ({ ...f, properties: { ...f.properties, col: this.colorOf(f.properties.c), ink: mix(this.colorOf(f.properties.c), "#000000", 0.15) } })),
    })
    const set = (id: string, fc: FeatureCollection<Geometry>) => (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(fc)
    const point = (coords: [number, number], properties: Record<string, unknown>): Feature<Geometry> => ({ type: "Feature", properties, geometry: { type: "Point", coordinates: coords } })
    set("dfm-control", withColor(d.control))
    set("dfm-borders", { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: d.borders }] })
    set("dfm-claims", withColor(d.claims))
    set("dfm-presence", withColor(d.presence))
    set("dfm-stations", { type: "FeatureCollection", features: this.data.stations.map((s) => point([s.lon, s.lat], { name: s.name, col: this.colorOf(s.op) })) })
    set("dfm-bases", { type: "FeatureCollection", features: this.data.abroad.map((b, i) => point([b.lon, b.lat], { i, col: this.colorOf(b.op) })) })

    // The zoom at which a name of this length fits an area of this size:
    // its width against the area's rough width at zoom 0 (512 px for the
    // world's 40,075 km).
    const fitZoom = (name: string, size: number, km2: number, max: number, slack: number) =>
      Math.max(0, Math.min(max, Math.ceil(Math.log2((name.length * size * 0.56) / (((Math.sqrt(km2) * 512) / 40075) * slack)))))
    const labels: Feature<Geometry>[] = []
    for (const [c, e] of Object.entries(this.data.entities)) {
      if (!e.label || !e.km2) continue
      const name = e.short ?? e.name ?? c
      const size = labelSize(e.km2)
      labels.push(point(e.label, { name, size, km2: e.km2, mz: fitZoom(name, size, e.km2, 9, 1.4) }))
    }
    set("dfm-labels", { type: "FeatureCollection", features: labels })
    set("dfm-regions", {
      type: "FeatureCollection",
      features: regionNames(this.data).map((r) => {
        const size = Math.max(9, labelSize(r.km2) - 1.5)
        return point(r.at, { name: r.name, size, km2: r.km2, mz: fitZoom(r.name, size, r.km2, 11, 1.6), dark: mix(r.color, "#000000", 0.35), light: mix(r.color, "#ffffff", 0.5) })
      }),
    })
  }

  // Stripe images are made on demand, the first time a layer asks.
  private makeImage(id: string) {
    if (this.map.hasImage(id)) return
    const rgba = (c: string, a: number): [number, number, number, number] => [...hex(c), Math.round(a * 255)]
    let img
    if (id === "contested") img = stripes([138, 144, 150, 230], [255, 255, 255, 70], 4)
    else if (id.startsWith("occ-")) {
      const c = this.colorOf(id.slice(4))
      img = stripes(rgba(c, 0.95), rgba(c, 0.3), 6)
    } else if (id.startsWith("pres-")) img = stripes(rgba(this.colorOf(id.slice(5)), 0.9), [0, 0, 0, 0], 3, true)
    else return
    this.map.addImage(id, img, { pixelRatio: 2 })
  }

  // ---------------------------------------------------------- hit tests

  private hitAt(e: MapMouseEvent): Hit | null {
    const q = (layers: string[]) => {
      const on = this.visibleLayers(layers)
      return on.length ? this.map.queryRenderedFeatures(e.point, { layers: on }) : []
    }
    const area = q(["dfm-hit", "dfm-hit-d"])[0]
    if (!area) return null
    const unique = (fs: MapGeoJSONFeature[]) => [...new Map(fs.map((f) => [f.properties.a, f])).values()] as unknown as F[]
    return {
      lonLat: [e.lngLat.lng, e.lngLat.lat],
      area: area as unknown as F,
      claims: unique(q(["dfm-claims-hit"])),
      presence: unique(q(["dfm-presence"])),
    }
  }
}

const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] })

// A layer drawn from the 300 m GeoJSON below DETAIL_Z and from the
// full-detail tiles above it ("-d"). The GeoJSON borders and outlines come
// from their own sources; in the tiles they're layers of one source.
function both(id: string, tileLayer: "control" | "outline" | "borders", rest: object): LayerSpecification[] {
  const geojson = { control: "dfm-control", outline: "dfm-control", borders: "dfm-borders" }[tileLayer]
  return [
    { id, source: geojson, maxzoom: DETAIL_Z, ...rest } as LayerSpecification,
    { id: `${id}-d`, source: "dfm-detail", "source-layer": tileLayer, minzoom: DETAIL_Z, ...rest } as LayerSpecification,
  ]
}
