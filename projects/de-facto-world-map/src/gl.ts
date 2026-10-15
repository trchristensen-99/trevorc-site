// Textured base maps (satellite, terrain, streets) drawn with MapLibre on a
// globe or a flat Mercator map, with the de facto layers on top. MapLibre
// loads on first use from vendor/ (see vendor.json), so the default atlas
// view doesn't pay for it.

import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MLMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import {
  detail,
  labelSize,
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
import type { Station } from "./types"

type MapLibre = typeof import("maplibre-gl")

export const BASES = {
  satellite: { label: "Satellite" },
  terrain: { label: "Terrain" },
  streets: { label: "Streets" },
} as const
export type BaseId = keyof typeof BASES
export const GL_PROJECTIONS: ProjectionId[] = ["globe", "mercator"]

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
const DATA_CREDIT = `De facto borders: <a href="/projects/de-facto-world-map" target="_top">trevorc.com</a> (CC BY-SA 4.0)`

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

// ------------------------------------------------------------ appearance

// How strongly the de facto layers cover each base map.
const LOOK = {
  satellite: { fill: 0.42, pattern: 0.9, border: "#ffffff", borderOpacity: 0.9, ink: "#ffffff", halo: "rgba(0,0,0,0.85)" },
  terrain: { fill: 0.42, pattern: 0.85, border: "#2a3138", borderOpacity: 0.85, ink: "#1d2329", halo: "#ffffff" },
  streets: { fill: 0.38, pattern: 0.85, border: "#3a4652", borderOpacity: 0.8, ink: "#1d2329", halo: "#ffffff" },
} as const
const STREETS_DARK = { ...LOOK.streets, fill: 0.55, border: "#c9d1d9", ink: "#eef1f4", halo: "#0e141a" }

// Elevation colors for the terrain map, ocean floor included.
const RELIEF: ExpressionSpecification = [
  "interpolate", ["linear"], ["elevation"],
  -10000, "#0b2b50", -5000, "#1f4f82", -2000, "#3f78ad", -200, "#7fb0d8", -1, "#acd0ea",
  0, "#9fc493", 200, "#bcd49b", 600, "#dfdca9", 1200, "#dcc596", 2000, "#c6a27c", 3000, "#ae8c78", 4200, "#dcd6d0", 5500, "#ffffff",
]

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const darken = (c: string, t: number) => "#" + hex(c).map((v) => Math.round(v * (1 - t)).toString(16).padStart(2, "0")).join("")

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

// ---------------------------------------------------------------- map

export async function createGlMap(container: HTMLElement, data: MapData, base: BaseId, theme: Theme) {
  const lib = await loadLibrary()
  const m = new GlMap(lib, container, data, base, theme)
  await m.ready
  return m
}

export class GlMap implements Renderer {
  onHover: (hit: Hit | null, at: [number, number]) => void = () => {}
  onSelect: (hit: Hit | null) => void = () => {}
  onStation: (s: Station) => void = () => {}
  onNeedDetail: () => void = () => {}
  onViewChange: () => void = () => {}

  readonly ready: Promise<void>
  private map: MLMap
  private d: Detail
  private projection: ProjectionId = "globe"
  private layers = new Set<LayerId>(["labels", "claims", "presence", "stations"])
  private styleLoaded = false

  constructor(
    lib: MapLibre,
    container: HTMLElement,
    private data: MapData,
    private base: BaseId,
    private theme: Theme,
  ) {
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
      const st = this.map.queryRenderedFeatures(e.point, { layers: this.has("dfm-stations") ? ["dfm-stations"] : [] })[0]
      const station = st && this.data.stations.find((s) => s.name === st.properties.name)
      if (station) this.onStation(station)
      else this.onSelect(this.hitAt(e))
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

  setTheme(t: Theme) {
    const changed = t.dark !== this.theme.dark
    this.theme = t
    // Only the street map has a dark version.
    if (changed && this.base === "streets") void this.restyle()
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
    const used = new Set(style.layers.map((l) => ("source" in l ? l.source : "")))
    if (this.layers.has("relief")) used.add("dem3d")
    const out = Object.entries(style.sources)
      .filter(([id]) => used.has(id))
      .map(([id, x]) => (id === "openmaptiles" ? "OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors" : "attribution" in x && x.attribution ? text(x.attribution) : ""))
      .filter(Boolean)
    return [...new Set(out)]
  }

  private look() {
    return this.base === "streets" && this.theme.dark ? STREETS_DARK : LOOK[this.base]
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
    const ofm = await ofmStyle(this.base === "streets" && this.theme.dark ? "dark" : "positron")
    const isPlace = (l: LayerSpecification) =>
      l.type === "symbol" && "source-layer" in l && l["source-layer"] === "place" && !/country|state/.test(l.id)
    let under: LayerSpecification[] = []
    let over: LayerSpecification[] = []
    const sources: StyleSpecification["sources"] = {
      openmaptiles: ofm.sources.openmaptiles,
      dem: dem(),
      dem3d: dem(),
    }

    if (this.base === "streets") {
      // The street map's own borders and country names would contradict
      // the de facto ones, so they go.
      const kept = ofm.layers.filter((l) => !/boundary|country|state/.test(l.id) && !("source" in l && l.source === "ne2_shaded"))
      const firstSymbol = kept.findIndex((l) => l.type === "symbol")
      under = kept.slice(0, firstSymbol)
      over = kept.slice(firstSymbol)
    } else if (this.base === "satellite") {
      sources.satellite = SATELLITE
      under = [
        { id: "space", type: "background", paint: { "background-color": "#0b1a2a" } },
        { id: "satellite", type: "raster", source: "satellite", paint: { "raster-fade-duration": 150 } },
      ]
      over = ofm.layers.filter(isPlace).map((l) => ({
        ...l,
        paint: { ...(l as { paint?: object }).paint, "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-width": 1.3 },
      })) as LayerSpecification[]
    } else {
      under = [
        { id: "sea", type: "background", paint: { "background-color": "#acd0ea" } },
        { id: "relief", type: "color-relief", source: "dem", paint: { "color-relief-color": RELIEF } },
        {
          id: "hillshade", type: "hillshade", source: "dem",
          paint: { "hillshade-exaggeration": 0.4, "hillshade-shadow-color": "#3a3328", "hillshade-highlight-color": "#ffffff" },
        },
        // Vector water on top keeps coastlines crisp where the elevation
        // tiles are coarse, while letting the sea floor show through.
        {
          id: "water", type: "fill", source: "openmaptiles", "source-layer": "water",
          paint: { "fill-color": "#9cc6e6", "fill-opacity": 0.6 },
        },
      ]
      over = ofm.layers.filter(isPlace)
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
        "dfm-borders": { type: "geojson", data: empty() },
        "dfm-claims": { type: "geojson", data: empty() },
        "dfm-presence": { type: "geojson", data: empty() },
        "dfm-stations": { type: "geojson", data: empty() },
        "dfm-labels": { type: "geojson", data: empty() },
      },
      layers: [...under, ...this.overlay(), ...over, ...this.labelLayers()],
    }
  }

  private overlay(): LayerSpecification[] {
    const L = this.look()
    const kinds = (...k: string[]): ExpressionSpecification => ["match", ["get", "k"], k, true, false]
    return [
      { id: "dfm-fill", type: "fill", source: "dfm-control", filter: kinds("control", "dependency", "lease", "international"), paint: { "fill-color": ["get", "col"], "fill-opacity": L.fill } },
      { id: "dfm-occ", type: "fill", source: "dfm-control", filter: kinds("occupation"), paint: { "fill-pattern": ["concat", "occ-", ["get", "c"]], "fill-opacity": L.pattern } },
      { id: "dfm-contested", type: "fill", source: "dfm-control", filter: kinds("contested"), paint: { "fill-pattern": "contested", "fill-opacity": L.pattern } },
      // Invisible copies that answer "what's under the pointer".
      { id: "dfm-hit", type: "fill", source: "dfm-control", paint: { "fill-opacity": 0 } },
      { id: "dfm-presence", type: "fill", source: "dfm-presence", paint: { "fill-pattern": ["concat", "pres-", ["get", "c"]], "fill-opacity": L.pattern } },
      { id: "dfm-presence-line", type: "line", source: "dfm-presence", paint: { "line-color": ["get", "col"], "line-width": 1, "line-opacity": 0.8 } },
      {
        id: "dfm-borders", type: "line", source: "dfm-borders", layout: { "line-join": "round" },
        paint: { "line-color": L.border, "line-opacity": L.borderOpacity, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 5, 1.2, 10, 2] },
      },
      { id: "dfm-claims-hit", type: "fill", source: "dfm-claims", paint: { "fill-opacity": 0 } },
      { id: "dfm-claims-halo", type: "line", source: "dfm-claims", paint: { "line-color": L.halo, "line-width": 3, "line-opacity": 0.5 } },
      { id: "dfm-claims", type: "line", source: "dfm-claims", paint: { "line-color": ["get", "ink"], "line-width": 1.6, "line-dasharray": [3, 2] } },
      {
        id: "dfm-stations", type: "circle", source: "dfm-stations",
        paint: { "circle-radius": 4, "circle-color": ["get", "col"], "circle-stroke-color": "#1d2329", "circle-stroke-width": 0.8 },
      },
    ]
  }

  // Names appear once their country is wide enough on screen to hold
  // them; each feature carries the zoom where that happens (mz), and one
  // layer per whole zoom level shows those that fit from that level on.
  private labelLayers(): LayerSpecification[] {
    const L = this.look()
    return Array.from({ length: 10 }, (_, z) => ({
      id: `dfm-labels-${z}`,
      type: "symbol" as const,
      source: "dfm-labels",
      minzoom: z,
      filter: ["==", ["get", "mz"], z] as ExpressionSpecification,
      layout: {
        "text-field": ["get", "name"] as ExpressionSpecification,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["get", "size"] as ExpressionSpecification,
        "symbol-sort-key": ["-", 0, ["get", "km2"]] as ExpressionSpecification,
        "text-max-width": 8,
      },
      paint: { "text-color": L.ink, "text-halo-color": L.halo, "text-halo-width": 1.6 },
    }))
  }

  private has(id: string) {
    return !!this.map.getLayer(id)
  }

  private applyLayers() {
    const vis = (ids: string[], on: boolean) => {
      for (const id of ids) if (this.has(id)) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    }
    vis(Array.from({ length: 10 }, (_, z) => `dfm-labels-${z}`), this.layers.has("labels"))
    vis(["dfm-claims", "dfm-claims-halo", "dfm-claims-hit"], this.layers.has("claims"))
    vis(["dfm-presence", "dfm-presence-line"], this.layers.has("presence"))
    vis(["dfm-stations"], this.layers.has("stations"))
    this.map.setTerrain(this.layers.has("relief") ? { source: "dem3d", exaggeration: 1.5 } : null)
  }

  // --------------------------------------------------------------- data

  private colorOf(c: string) {
    return this.data.entities[c]?.color ?? "#9a9a9a"
  }

  private pushData() {
    const d = this.d
    const withColor = (fs: F[]): FeatureCollection<Geometry> => ({
      type: "FeatureCollection",
      features: fs.map((f) => ({ ...f, properties: { ...f.properties, col: this.colorOf(f.properties.c), ink: darken(this.colorOf(f.properties.c), 0.15) } })),
    })
    const set = (id: string, fc: FeatureCollection<Geometry>) => (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(fc)
    set("dfm-control", withColor(d.control))
    set("dfm-borders", { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: d.borders }] })
    set("dfm-claims", withColor(d.claims))
    set("dfm-presence", withColor(d.presence))
    set("dfm-stations", {
      type: "FeatureCollection",
      features: this.data.stations.map((s) => ({ type: "Feature", properties: { name: s.name, col: this.colorOf(s.op) }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })),
    })
    const labels: Feature<Geometry>[] = []
    for (const [c, e] of Object.entries(this.data.entities)) {
      if (!e.label || !e.km2) continue
      const name = e.short ?? e.name ?? c
      const size = labelSize(e.km2)
      // Width of the name against the country's rough width at zoom 0
      // (512 px for the world's 40,075 km).
      const span = (Math.sqrt(e.km2) * 512) / 40075
      const mz = Math.max(0, Math.min(9, Math.ceil(Math.log2((name.length * size * 0.56) / (span * 1.4)))))
      labels.push({ type: "Feature", properties: { name, size, km2: e.km2, mz }, geometry: { type: "Point", coordinates: e.label } })
    }
    set("dfm-labels", { type: "FeatureCollection", features: labels })
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
    const q = (layer: string) =>
      this.has(layer) && this.map.getLayoutProperty(layer, "visibility") !== "none"
        ? this.map.queryRenderedFeatures(e.point, { layers: [layer] })
        : []
    const area = q("dfm-hit")[0]
    if (!area) return null
    const unique = (fs: MapGeoJSONFeature[]) => [...new Map(fs.map((f) => [f.properties.a, f])).values()] as unknown as F[]
    return {
      lonLat: [e.lngLat.lng, e.lngLat.lat],
      area: area as unknown as F,
      claims: unique(q("dfm-claims-hit")),
      presence: this.layers.has("presence") ? unique(this.map.queryRenderedFeatures(e.point, { layers: ["dfm-presence"] })) : [],
    }
  }
}

const empty = (): FeatureCollection => ({ type: "FeatureCollection", features: [] })
