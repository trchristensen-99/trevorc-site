// SVG renderer for the de facto map. Flat projections are drawn once and
// zoomed with a transform; the globe is re-projected on every rotation.
// Everything visual is set as attributes rather than CSS classes so an
// exported SVG looks exactly like the screen.

import {
  geoArea,
  geoBounds,
  geoContains,
  geoDistance,
  geoEqualEarth,
  geoGraticule10,
  geoOrthographic,
  geoPath,
  geoProjection,
  type GeoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
  type GeoRawProjection,
} from "d3-geo"
import { geoRobinson, geoWinkel3 } from "d3-geo-projection"
import { pointer, select, type Selection } from "d3-selection"
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
import { feature, mesh } from "topojson-client"
import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson"
import type { GeometryCollection, Topology } from "topojson-specification"
import type { Entity, FeatureProps, Kind, Station } from "./types"

type F = Feature<Geometry, FeatureProps>
type SVGSel<T extends Element> = Selection<T, unknown, null, undefined>

export const PROJECTIONS = {
  winkel: { label: "Winkel tripel", globe: false, make: () => geoWinkel3() },
  equalEarth: { label: "Equal Earth", globe: false, make: () => geoEqualEarth() },
  robinson: { label: "Robinson", globe: false, make: () => geoRobinson() },
  mercator: { label: "Mercator", globe: false, make: () => clampedMercator() },
  globe: { label: "Globe", globe: true, make: () => geoOrthographic().clipAngle(90) },
} as const
export type ProjectionId = keyof typeof PROJECTIONS

// Mercator sends the poles to infinity, so Antarctica (whose ring runs along
// the South Pole) turns inside out and covers the map. Clamp latitudes to
// ±85° first: the pole edge becomes a straight line just off the map.
function clampedMercator(): GeoProjection {
  const max = (85 * Math.PI) / 180
  const raw: GeoRawProjection = (x, y) => [x, Math.log(Math.tan(Math.PI / 4 + Math.max(-max, Math.min(max, y)) / 2))]
  raw.invert = (x, y) => [x, 2 * Math.atan(Math.exp(y)) - Math.PI / 2]
  return geoProjection(raw)
}

export type LayerId = "labels" | "claims" | "presence" | "stations" | "graticule"

export interface Theme {
  ocean: string
  graticule: string
  border: string
  coast: string
  labelInk: string
  labelHalo: string
  uncontrolled: string
  contested: string
}
export const LIGHT: Theme = {
  ocean: "#c9def0", graticule: "#b3cbe0", border: "#2f3640", coast: "#3a4652",
  labelInk: "#1d2329", labelHalo: "#ffffff", uncontrolled: "#f4f4ef", contested: "#9aa0a6",
}
export const DARK: Theme = {
  ocean: "#16222e", graticule: "#22313f", border: "#0b0f14", coast: "#0b0f14",
  labelInk: "#eef1f4", labelHalo: "#0e141a", uncontrolled: "#d9dbd4", contested: "#7c838a",
}

export interface Hit {
  lonLat: [number, number]
  area: F
  claims: F[]
  presence: F[]
}

export type MapTopology = Topology<{
  control: GeometryCollection<FeatureProps>
  claims: GeometryCollection<FeatureProps>
  presence: GeometryCollection<FeatureProps>
}>

export interface MapData {
  topo: MapTopology
  entities: Record<string, Entity>
  stations: Station[]
}

// One level of detail: the same features at some resolution, plus the
// lon/lat box of each so hit tests can skip most of them cheaply.
interface Detail {
  control: F[]
  claims: F[]
  presence: F[]
  borders: MultiLineString
  coast: MultiLineString
  boxes: WeakMap<F, [[number, number], [number, number]]>
}

function detail(topo: MapTopology): Detail {
  const fc = (o: GeometryCollection<FeatureProps>) => (feature(topo, o) as FeatureCollection<Geometry, FeatureProps>).features
  const differs = (a: { properties?: FeatureProps | null }, b: { properties?: FeatureProps | null }) =>
    a !== b && (a.properties?.c !== b.properties?.c || a.properties?.k !== b.properties?.k)
  const d: Detail = {
    control: fc(topo.objects.control),
    claims: fc(topo.objects.claims),
    presence: fc(topo.objects.presence),
    borders: mesh(topo, topo.objects.control, (a, b) => differs(a as never, b as never)),
    coast: mesh(topo, topo.objects.control, (a, b) => a === b),
    boxes: new WeakMap(),
  }
  for (const f of [...d.control, ...d.claims, ...d.presence]) d.boxes.set(f, geoBounds(f))
  return d
}

// Whether a lon/lat box (which may cross the antimeridian) holds a point.
function inBox(b: [[number, number], [number, number]], [x, y]: [number, number]) {
  if (y < b[0][1] - 0.01 || y > b[1][1] + 0.01) return false
  return b[0][0] <= b[1][0] ? x >= b[0][0] - 0.01 && x <= b[1][0] + 0.01 : x >= b[0][0] - 0.01 || x <= b[1][0] + 0.01
}

// Flat maps switch to the full-detail file past this zoom.
const HI_ZOOM = 1.8

const MERCATOR_EXTENT: GeoPermissibleObjects = {
  type: "Polygon",
  coordinates: [[[-179.9, -58], [179.9, -58], [179.9, 82], [-179.9, 82], [-179.9, -58]]],
}

export class WorldMap {
  private svg: SVGSel<SVGSVGElement>
  private defs: SVGSel<SVGDefsElement>
  private root: SVGSel<SVGGElement>
  private lo: Detail
  private hi: Detail | null = null
  private labelFeature = new Map<string, F>()
  private projection!: GeoProjection
  private path!: GeoPath
  private projectionId: ProjectionId = "winkel"
  private transform: ZoomTransform = zoomIdentity
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>
  private rotation: [number, number] = [-10, -20]
  private globeScale = 1
  private width = 0
  private height = 0
  private frame = 0
  // Label sizes are tuned for a desktop-width map; shrink them on small maps.
  private labelScale = 1
  private layers = new Set<LayerId>(["labels", "claims", "presence", "stations"])
  theme: Theme = LIGHT

  onHover: (hit: Hit | null, at: [number, number]) => void = () => {}
  onSelect: (hit: Hit | null) => void = () => {}
  onStation: (s: Station) => void = () => {}

  constructor(
    private el: SVGSVGElement,
    private data: MapData,
  ) {
    this.lo = detail(data.topo)

    // The label for each controller sits in its largest piece.
    const best = new Map<string, number>()
    for (const f of this.lo.control) {
      const c = f.properties.c
      const area = geoArea(f)
      if (area > (best.get(c) ?? -1)) {
        best.set(c, area)
        this.labelFeature.set(c, f)
      }
    }

    this.svg = select(el)
    this.svg.selectAll("*").remove()
    this.defs = this.svg.append("defs")
    this.root = this.svg.append("g")
    for (const g of ["ocean", "graticule", "control", "presence", "borders", "claims", "stations", "labels"])
      this.root.append("g").attr("data-layer", g)

    this.zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 500])
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => this.zoomed(e))
    this.svg.call(this.zoomer).on("dblclick.zoom", null)

    this.svg.on("pointermove", (e: PointerEvent) => {
      if (e.buttons) return
      const at = pointer(e, el) as [number, number]
      this.onHover(this.hitAt(at), at)
    })
    this.svg.on("pointerleave", () => this.onHover(null, [0, 0]))
    this.svg.on("click", (e: MouseEvent) => {
      if ((e.target as Element).closest("[data-layer=stations]")) return
      this.onSelect(this.hitAt(pointer(e, el) as [number, number]))
    })
  }

  // ---------------------------------------------------------------- public

  setProjection(id: ProjectionId) {
    this.projectionId = id
    this.projection = PROJECTIONS[id].make()
    this.path = geoPath(this.projection)
    this.transform = zoomIdentity
    this.globeScale = 1
    this.root.attr("transform", null)
    this.svg.call(this.zoomer.transform, zoomIdentity)
    this.resize()
  }

  // Called once the full-detail file has loaded.
  setDetail(topo: MapTopology) {
    this.hi = detail(topo)
    if (this.wantsHi) this.render()
  }

  // Asked for the first time the map is zoomed in on a flat projection.
  onNeedDetail: () => void = () => {}

  private get wantsHi() {
    return !this.isGlobe && this.transform.k >= HI_ZOOM
  }

  // The level of detail the map is drawn with right now.
  private get d(): Detail {
    return this.wantsHi && this.hi ? this.hi : this.lo
  }
  private drawn: Detail | null = null

  setLayer(id: LayerId, on: boolean) {
    if (on) this.layers.add(id)
    else this.layers.delete(id)
    this.render()
  }

  setTheme(t: Theme) {
    this.theme = t
    this.render()
  }

  resize() {
    const r = this.el.getBoundingClientRect()
    this.width = Math.max(320, r.width)
    this.height = Math.max(240, r.height)
    this.svg.attr("viewBox", `0 0 ${this.width} ${this.height}`)
    this.labelScale = Math.max(0.6, Math.min(1, Math.min(this.width, this.height * 1.8) / 1100))
    this.fit()
    this.render()
  }

  // Centre the view on a point at a zoom factor (1 = whole world).
  focus(lonLat: [number, number], k: number) {
    if (this.isGlobe) {
      this.rotation = [-lonLat[0], -lonLat[1]]
      this.svg.call(this.zoomer.transform, zoomIdentity.scale(k))
      this.projection.rotate([this.rotation[0], this.rotation[1], 0])
      this.render()
      return
    }
    const p = this.projection(lonLat)
    if (!p) return
    const t = zoomIdentity.translate(this.width / 2 - p[0] * k, this.height / 2 - p[1] * k).scale(k)
    this.svg.call(this.zoomer.transform, t)
  }

  // The current centre and zoom, for sharing a view.
  view(): [number, number, number] | null {
    const k = this.isGlobe ? this.globeScale : this.transform.k
    const c: [number, number] = this.isGlobe
      ? [this.width / 2, this.height / 2]
      : this.transform.invert([this.width / 2, this.height / 2])
    const ll = this.projection.invert?.(c)
    return ll ? [ll[0], ll[1], k] : null
  }

  get isGlobe() {
    return PROJECTIONS[this.projectionId].globe
  }

  // A standalone SVG of what's on screen, with the current view baked in.
  exportSVG(title: string): string {
    const clone = this.el.cloneNode(true) as SVGSVGElement
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    clone.setAttribute("width", String(this.width))
    clone.setAttribute("height", String(this.height))
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title")
    t.textContent = title
    clone.insertBefore(t, clone.firstChild)
    return new XMLSerializer().serializeToString(clone)
  }

  // ----------------------------------------------------------- projection

  private fit() {
    const pad = 12
    const box: [[number, number], [number, number]] = [[pad, pad], [this.width - pad, this.height - pad]]
    if (this.isGlobe) {
      this.projection.fitExtent(box, { type: "Sphere" }).rotate([this.rotation[0], this.rotation[1], 0])
      this.baseScale = this.projection.scale()
      this.projection.scale(this.baseScale * this.globeScale)
    } else if (this.projectionId === "mercator") {
      this.projection.fitExtent(box, MERCATOR_EXTENT)
    } else {
      this.projection.fitExtent(box, { type: "Sphere" })
    }
  }
  private baseScale = 1

  private zoomed(e: D3ZoomEvent<SVGSVGElement, unknown>) {
    const prev = this.transform
    this.transform = e.transform
    if (this.isGlobe) {
      // Drag rotates the globe; wheel and pinch change its scale.
      const k = e.transform.k
      if (e.sourceEvent && e.sourceEvent.type !== "wheel" && k === prev.k) {
        // One screen pixel at the globe's centre spans 1/scale radians.
        const degPerPx = 57.2958 / (this.baseScale * this.globeScale)
        this.rotation = [
          this.rotation[0] + (e.transform.x - prev.x) * degPerPx,
          Math.max(-90, Math.min(90, this.rotation[1] - (e.transform.y - prev.y) * degPerPx)),
        ]
      }
      this.globeScale = k
      this.projection.rotate([this.rotation[0], this.rotation[1], 0]).scale(this.baseScale * this.globeScale)
      this.schedule()
    } else {
      this.root.attr("transform", e.transform.toString())
      if (this.wantsHi && !this.hi) this.onNeedDetail()
      this.schedule(this.d === this.drawn)
    }
  }

  private schedule(lightweight = false) {
    this.full ||= !lightweight
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (this.full) this.render()
      else this.restyleForZoom()
      this.full = false
    })
  }
  private full = false

  private hitAt(at: [number, number]): Hit | null {
    const p = this.isGlobe ? at : this.transform.invert(at)
    const ll = this.projection.invert?.(p)
    if (!ll || Number.isNaN(ll[0])) return null
    const lonLat = ll as [number, number]
    if (this.isGlobe && geoDistance(lonLat, [-this.rotation[0], -this.rotation[1]]) > Math.PI / 2) return null
    const d = this.d
    const inside = (f: F) => inBox(d.boxes.get(f)!, lonLat) && geoContains(f, lonLat)
    const area = d.control.find(inside)
    if (!area) return null
    return {
      lonLat,
      area,
      claims: this.layers.has("claims") ? d.claims.filter(inside) : [],
      presence: this.layers.has("presence") ? d.presence.filter(inside) : [],
    }
  }

  // --------------------------------------------------------------- render

  private colorOf(c: string): string {
    return this.data.entities[c]?.color ?? "#9a9a9a"
  }

  // One pattern per color: stripes of `ink` over `ground`.
  private pattern(id: string, ground: string, ink: string, width: number, gap: number) {
    const pid = `p-${id}`
    if (this.defs.select(`#${CSS.escape(pid)}`).empty()) {
      const p = this.defs
        .append("pattern")
        .attr("id", pid)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", gap)
        .attr("height", gap)
        .attr("data-gap", gap)
      p.append("rect").attr("width", gap).attr("height", gap).attr("fill", ground)
      p.append("rect").attr("width", width).attr("height", gap).attr("fill", ink)
    }
    return `url(#${pid})`
  }

  private fillFor(c: string, k: Kind | undefined): string {
    const t = this.theme
    if (k === "uncontrolled" || c === "none") return k === "contested" ? this.pattern("contested", t.uncontrolled, t.contested, 1.2, 5) : t.uncontrolled
    if (k === "contested") return this.pattern(`contested-${c}`, t.uncontrolled, t.contested, 1.2, 5)
    const color = this.colorOf(c)
    if (k === "occupation") return this.pattern(`occ-${c}`, mix(color, "#ffffff", 0.45), color, 2.2, 5)
    return color
  }

  private render() {
    if (!this.projection) return
    const t = this.theme
    const d = (this.drawn = this.d)
    const layer = (name: string) => this.root.select<SVGGElement>(`[data-layer=${name}]`)
    this.defs.selectAll("pattern").remove()

    layer("ocean").selectAll("path").data([0]).join("path")
      .attr("d", this.path({ type: "Sphere" }) ?? "")
      .attr("fill", t.ocean)

    layer("graticule").selectAll("path").data(this.layers.has("graticule") ? [0] : []).join("path")
      .attr("d", this.path(geoGraticule10()) ?? "")
      .attr("fill", "none").attr("stroke", t.graticule).attr("stroke-width", 0.5)
      .attr("vector-effect", "non-scaling-stroke")

    layer("control").selectAll<SVGPathElement, F>("path").data(d.control, (f) => f.properties.a).join("path")
      .attr("d", (f) => this.path(f) ?? "")
      .attr("fill", (f) => this.fillFor(f.properties.c, f.properties.k))

    layer("presence").selectAll<SVGPathElement, F>("path")
      .data(this.layers.has("presence") ? d.presence : [], (f) => f.properties.a).join("path")
      .attr("d", (f) => this.path(f) ?? "")
      .attr("fill", (f) => this.pattern(`pres-${f.properties.c}`, "transparent", this.colorOf(f.properties.c), 1.6, 6))
      .attr("stroke", (f) => this.colorOf(f.properties.c)).attr("stroke-width", 0.6).attr("stroke-opacity", 0.8)
      .attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none")

    const b = layer("borders")
    b.selectAll<SVGPathElement, MultiLineString>("path.coast").data([d.coast]).join("path").attr("class", "coast")
      .attr("d", (m) => this.path(m) ?? "")
      .attr("fill", "none").attr("stroke", t.coast).attr("stroke-width", 0.45).attr("stroke-opacity", 0.75)
      .attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none")
    b.selectAll<SVGPathElement, MultiLineString>("path.border").data([d.borders]).join("path").attr("class", "border")
      .attr("d", (m) => this.path(m) ?? "")
      .attr("fill", "none").attr("stroke", t.border).attr("stroke-width", 0.7).attr("stroke-linejoin", "round")
      .attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none")

    // Claims: a pale halo under a dashed line in the claimant's color.
    const claims = this.layers.has("claims") ? d.claims : []
    layer("claims").selectAll<SVGPathElement, F>("path.halo").data(claims, (f) => f.properties.a).join("path").attr("class", "halo")
      .attr("d", (f) => this.path(f) ?? "")
      .attr("fill", "none").attr("stroke", t.labelHalo).attr("stroke-width", 2.6).attr("stroke-opacity", 0.55)
      .attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none")
    layer("claims").selectAll<SVGPathElement, F>("path.line").data(claims, (f) => f.properties.a).join("path").attr("class", "line")
      .attr("d", (f) => this.path(f) ?? "")
      .attr("fill", "none").attr("stroke", (f) => darken(this.colorOf(f.properties.c), 0.15))
      .attr("stroke-width", 1.4).attr("stroke-dasharray", "4 3")
      .attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none")

    this.renderStations()
    this.renderLabels()
    this.restyleForZoom()
  }

  private visible(lonLat: [number, number]) {
    return !this.isGlobe || geoDistance(lonLat, [-this.rotation[0], -this.rotation[1]]) < Math.PI / 2 - 0.02
  }

  private renderStations() {
    const shown = this.layers.has("stations") ? this.data.stations.filter((s) => this.visible([s.lon, s.lat])) : []
    const g = this.root.select<SVGGElement>("[data-layer=stations]")
    g.selectAll<SVGCircleElement, Station>("circle").data(shown, (d) => d.name).join("circle")
      .attr("transform", (d) => {
        const p = this.projection([d.lon, d.lat])
        return p ? `translate(${p[0]},${p[1]})` : "translate(-999,-999)"
      })
      .attr("fill", (d) => this.colorOf(d.op)).attr("stroke", this.theme.border).attr("stroke-width", 0.8)
      .attr("vector-effect", "non-scaling-stroke").attr("cursor", "pointer")
      .on("click", (e: MouseEvent, d) => { e.stopPropagation(); this.onStation(d) })
      .selectAll("title").data((d) => [d]).join("title")
      .text((d) => `${d.name} (${this.data.entities[d.op]?.name ?? d.op})`)
  }

  private renderLabels() {
    const t = this.theme
    const items = this.layers.has("labels")
      ? Object.entries(this.data.entities).filter(([, e]) => e.label && (e.km2 ?? 0) > 0 && this.visible(e.label))
      : []
    this.root.select<SVGGElement>("[data-layer=labels]")
      .selectAll<SVGTextElement, [string, Entity]>("text").data(items, (d) => d[0]).join("text")
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("font-family", "'Avenir Next', 'Segoe UI', system-ui, sans-serif")
      .attr("font-weight", 600).attr("fill", t.labelInk)
      .attr("stroke", t.labelHalo).attr("stroke-width", 2.5).attr("stroke-linejoin", "round")
      .attr("paint-order", "stroke").attr("pointer-events", "none")
      .attr("data-base", (d) => labelSize(d[1].km2 ?? 0) * this.labelScale)
      .attr("data-span", ([c]) => {
        const f = this.labelFeature.get(c)
        const bb = f ? this.path.bounds(f) : [[0, 0], [0, 0]]
        return Math.min(bb[1][0] - bb[0][0], 2.4 * (bb[1][1] - bb[0][1]))
      })
      .attr("x", (d) => this.projection(d[1].label!)?.[0] ?? -999)
      .attr("y", (d) => this.projection(d[1].label!)?.[1] ?? -999)
      .attr("data-km2", (d) => d[1].km2 ?? 0)
      .text((d) => d[1].short ?? d[1].name ?? d[0])
  }

  // Zoom-dependent styling for flat maps: keep text and stripe widths
  // constant on screen, and only show labels that fit their country.
  private restyleForZoom() {
    const k = this.isGlobe ? 1 : this.transform.k
    const texts = this.root.select("[data-layer=labels]").selectAll<SVGTextElement, unknown>("text").nodes()
    texts.sort((a, b) => +(b.getAttribute("data-km2") ?? 0) - +(a.getAttribute("data-km2") ?? 0))
    // Boxes in screen pixels; a label is shown only if it fits inside its
    // country and doesn't overlap a larger country's label.
    const placed: [number, number, number, number][] = []
    // Labels grow a little when zoomed far in, so small places stay legible.
    const grow = Math.min(1.8, Math.max(1, k ** 0.2))
    for (const t of texts) {
      const size = Math.min(22, +(t.getAttribute("data-base") ?? 10) * grow)
      const span = +(t.getAttribute("data-span") ?? 0) * k
      const w = (t.textContent ?? "").length * size * 0.56
      const x = +(t.getAttribute("x") ?? 0) * k
      const y = +(t.getAttribute("y") ?? 0) * k
      const box: [number, number, number, number] = [x - w / 2 - 2, y - size / 2 - 1, x + w / 2 + 2, y + size / 2 + 1]
      const fits = w < span * 1.05 || (span > size * 6 && size > 10)
      const clear = placed.every((p) => box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3])
      const show = fits && clear
      if (show) placed.push(box)
      t.setAttribute("font-size", String(size / k))
      t.setAttribute("stroke-width", String(2.5 / k))
      t.setAttribute("display", show ? "inline" : "none")
    }
    this.root.select("[data-layer=stations]").selectAll("circle").attr("r", 3.2 / k)
    this.defs.selectAll<SVGPatternElement, unknown>("pattern").each(function () {
      const gap = +(this.getAttribute("data-gap") ?? 5)
      this.setAttribute("patternTransform", `rotate(45) scale(${1 / k})`)
      this.setAttribute("width", String(gap))
    })
  }
}

function labelSize(km2: number) {
  return Math.max(8, Math.min(17, 6.5 + 2.4 * Math.log10(Math.max(1, km2 / 1000))))
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  const m = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`
}
function darken(a: string, t: number) {
  return mix(a, "#000000", t)
}
