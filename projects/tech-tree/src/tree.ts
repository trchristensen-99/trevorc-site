// Draws the tech tree as SVG: time across, field lanes (and the tracks
// within them) down. Nodes keep their size on screen while the layout
// zooms, and more of them appear as you zoom in, in order of importance;
// the detail setting shifts how many show at each zoom. Selecting a node
// lights up everything it needs and everything it led to, at any zoom.
// Metrics can be shown as trend strips along the bottom, on the same time
// axis.

import { select, type Selection } from "d3-selection"
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
import { timeScale } from "./time"
import type { Edge, Lane, Metric, Node, Track, Tree } from "./types"

type Sel<T extends Element> = Selection<T, unknown, null, undefined>

export interface Filters {
  fields: Set<string> // empty = all
  statuses: Set<string> // empty = all
  kinds: Set<string> // empty = all
}

export interface Display {
  detail: number // the slider, 0 to 100: none, the default set (DETAIL_DEFAULT), everything
  grow: boolean // more appear as you zoom in
  frontier: boolean // everything not yet achieved shows at every zoom
  allLinks: boolean // every direct link among shown nodes, not the reduced set
  trends: string[] // metric ids shown along the bottom
  trendLayout: "auto" | "strips" | "compact" | "combined"
}

const ERAS: [number, string][] = [
  [-3.5e6, "Stone Age"],
  [-10000, "Neolithic and Bronze Age"],
  [-1200, "Iron Age and antiquity"],
  [500, "Middle Ages"],
  [1450, "Early modern"],
  [1760, "Industrial age"],
  [1945, "Information age"],
]
// Axis ticks: years ago in the deep past, calendar years after.
const DEEP_TICKS: [number, string][] = [[3e6, "3M years ago"], [1e6, "1M"], [3e5, "300k"], [1e5, "100k"], [3e4, "30k"], [1.2e4, "12k"]]
const TICKS = [-3000, -1000, 1, 1000, 1500, 1700, 1800, 1850, 1900, 1925, 1950, 1975, 2000, 2010, 2020, 2030, 2040, 2050, 2075, 2100, 2150, 2200]
const RADIUS = { 1: 7.5, 2: 5.5, 3: 4.2 } as const
// Alternative routes to a selected node, in order.
export const ROUTE_COLORS = ["#7b5ea7", "#d0587e", "#2f8fb0", "#8aa33a", "#c9772a"]
// Trend panel sizes: full strips, compact strips, or one combined chart.
const STRIP = { strips: 34, compact: 20 } as const
const STRIP_GAP = 3
const COMBINED_H = 150
// Lines in the combined chart, by position.
const PALETTE = ["#3d6fb6", "#e0a526", "#2a9d8f", "#d0587e", "#7b5ea7", "#c9772a", "#4f9a4a", "#c2534b", "#2f8fb0", "#8aa33a", "#6b7280", "#8d6e4f"]

// One shape per kind, as SVG path data around (0, 0) for radius r.
function shape(kind: Node["kind"], r: number): string {
  const poly = (pts: [number, number][]) => "M" + pts.map((p) => p.map((v) => v.toFixed(2)).join(",")).join("L") + "Z"
  switch (kind) {
    case "discovery":
      return `M${r},0A${r},${r} 0 1 1 ${-r},0A${r},${r} 0 1 1 ${r},0Z`
    case "technique":
      return poly([[0, -r * 1.2], [r * 1.2, 0], [0, r * 1.2], [-r * 1.2, 0]])
    case "device":
      return poly([[-r * 0.9, -r * 0.9], [r * 0.9, -r * 0.9], [r * 0.9, r * 0.9], [-r * 0.9, r * 0.9]])
    case "infrastructure":
      return poly(Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * r * 1.1, Math.sin((i * Math.PI) / 3) * r * 1.1] as [number, number]))
    case "institution":
      return poly([[0, -r * 1.25], [r * 1.15, r * 0.85], [-r * 1.15, r * 0.85]])
    case "milestone":
      // A flag on a pole.
      return poly([[-r * 0.75, r * 1.3], [-r * 0.75, -r * 1.25], [r * 1.15, -r * 0.65], [-r * 0.35, -r * 0.05], [-r * 0.35, r * 1.3]])
    case "resource":
      return poly([[0, r * 1.2], [r * 1.1, -r * 0.7], [-r * 1.1, -r * 0.7]])
    case "precondition":
      return `M${r},0A${r},${r} 0 1 1 ${-r},0A${r},${r} 0 1 1 ${r},0ZM${r * 0.45},0A${r * 0.45},${r * 0.45} 0 1 0 ${-r * 0.45},0A${r * 0.45},${r * 0.45} 0 1 0 ${r * 0.45},0Z`
  }
}
export const kindShape = shape

export const DETAIL_DEFAULT = 40
const unachieved = (n: Node) => n.status === "ongoing" || n.status === "speculative"

export class TreeView {
  onSelect: (n: Node | null) => void = () => {}
  // A node, or (for the trend strips) plain text.
  onHover: (n: Node | null, at: [number, number], text?: string) => void = () => {}
  onMetric: (m: Metric) => void = () => {}
  onViewChange: () => void = () => {}
  onRender: () => void = () => {}

  private svg: Sel<SVGSVGElement>
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private g: Record<string, Sel<SVGGElement>> = {}
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>
  private t: ZoomTransform = zoomIdentity
  // Base scales: time fits the width and the lanes fill the height, so
  // the two axes scale separately; zooming then scales both together.
  private bx = 1
  private by = 1
  private left = 0
  private w = 0
  private h = 0
  private frame = 0
  private byId: Map<string, Node>
  private metrics: Map<string, Metric>
  private color: (n: Node) => string
  private fieldColor: Map<string, string>
  private parents = new Map<string, string[]>()
  private children = new Map<string, string[]>()
  private direct = new Map<string, Edge>()
  private reducedCache = new Map<string, Edge[]>()
  private selected: Node | null = null
  private lit: { up: Set<string>; down: Set<string> } | null = null
  private filters: Filters = { fields: new Set(), statuses: new Set(), kinds: new Set() }
  private display: Display = { detail: DETAIL_DEFAULT, grow: true, frontier: false, allLinks: false, trends: [], trendLayout: "auto" }
  // Nodes in the order they appear (by the zoom they first show at), and
  // each node's place in it.
  private order: Node[]
  private orderIndex = new Map<string, number>()
  private zSorted: number[]
  private search = ""
  private shownCount = 0
  dark = false

  constructor(private el: SVGSVGElement, private tree: Tree) {
    this.byId = new Map(tree.nodes.map((n) => [n.id, n]))
    this.order = tree.nodes.map((n, i) => ({ n, i })).sort((a, b) => a.n.z - b.n.z || a.i - b.i).map((x) => x.n)
    this.order.forEach((n, i) => this.orderIndex.set(n.id, i))
    this.zSorted = this.order.map((n) => n.z)
    this.metrics = new Map(tree.metrics.map((m) => [m.id, m]))
    this.fieldColor = new Map(tree.fields.map((f) => [f.id, f.color]))
    this.color = (n) => (n.lane === "roots" ? tree.roots.color : this.fieldColor.get(n.fields[0]) ?? "#888")
    for (const e of tree.edges) {
      if (e.kind !== "requires" && e.kind !== "uses") continue
      ;(this.parents.get(e.t) ?? this.parents.set(e.t, []).get(e.t)!).push(e.s)
      ;(this.children.get(e.s) ?? this.children.set(e.s, []).get(e.s)!).push(e.t)
      this.direct.set(`${e.s}>${e.t}`, e)
    }
    this.canvas = document.createElement("canvas")
    this.canvas.className = "tree-canvas"
    this.canvas.setAttribute("aria-hidden", "true")
    el.before(this.canvas)
    this.ctx = this.canvas.getContext("2d")!
    this.svg = select(el)
    this.svg.selectAll("*").remove()
    for (const name of ["tracks", "nodes", "labels", "trends", "axis", "lanelabels"]) this.g[name] = this.svg.append("g").attr("class", name)
    this.zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 60])
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.t = e.transform
        this.schedule()
        this.onViewChange()
      })
    this.svg.call(this.zoomer).on("dblclick.zoom", null)
    this.svg.on("click", (e: MouseEvent) => {
      if ((e.target as Element).closest(".node, .strip")) return
      this.select(null)
    })
  }

  // ------------------------------------------------------------- public

  resize() {
    const r = this.el.getBoundingClientRect()
    const first = this.w === 0
    this.w = Math.max(320, r.width)
    this.h = Math.max(240, r.height)
    this.dpr = Math.min(window.devicePixelRatio || 1, 3)
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    const { width, height } = this.tree.meta
    // The whole tree fits at zoom 1, clear of the options panel on wide
    // screens and the axis on top.
    this.left = this.w > 1000 ? 285 : 12
    this.bx = (this.w - this.left - 16) / width
    this.by = Math.min((this.h - 44 - this.stripsHeight()) / height, this.bx * 3)
    this.zoomer.scaleExtent([0.8, 60]).translateExtent([[-width * this.bx * 0.3, -height * this.by * 0.3], [width * this.bx * 1.3, height * this.by * 1.3]])
    if (first) this.svg.call(this.zoomer.transform, zoomIdentity.translate(this.left, 38))
    this.schedule()
  }

  // Centre on a point of the layout at a relative zoom.
  focus(x: number, y: number, k: number) {
    this.svg.call(this.zoomer.transform, zoomIdentity.translate(this.w / 2 - x * this.bx * k, this.h / 2 - y * this.by * k).scale(k))
  }
  focusNode(n: Node, rel = 4) {
    const k = Math.max(rel, this.t.k)
    // On phones the info panel covers the bottom half, so aim higher.
    const fy = this.w <= 640 ? 0.25 : 0.5
    this.svg.call(this.zoomer.transform, zoomIdentity.translate(this.w * 0.42 - n.x * this.bx * k, this.h * fy - n.y * this.by * k).scale(k))
  }
  view(): [number, number, number] {
    const k = this.t.k
    return [(this.w / 2 - this.t.x) / (this.bx * k), (this.h / 2 - this.t.y) / (this.by * k), k]
  }
  // How many nodes are showing (for the detail control's readout).
  get shown() {
    return this.shownCount
  }

  setFilters(f: Filters) {
    this.filters = f
    this.schedule()
  }
  setDisplay(d: Partial<Display>) {
    const before = this.stripsHeight()
    this.display = { ...this.display, ...d }
    // The trend panel takes room from the tree rather than covering it, so
    // when it changes size the tree rescales, keeping the same view.
    if (this.w && this.stripsHeight() !== before) {
      const [x, y, k] = this.view()
      this.resize()
      this.focus(x, y, k)
    }
    this.schedule()
  }
  setSearch(q: string) {
    this.search = q.trim().toLowerCase()
    this.schedule()
  }
  setDark(d: boolean) {
    this.dark = d
    this.schedule()
  }
  // The trend panel's layout: as asked, or (auto) full strips while they
  // fit in under a third of the screen, then compact ones, then one chart.
  private trendLayout(): "strips" | "compact" | "combined" {
    const n = this.display.trends.length
    const L = this.display.trendLayout
    if (L !== "auto") return L
    if (n * (STRIP.strips + STRIP_GAP) <= this.h * 0.3) return "strips"
    if (n * (STRIP.compact + STRIP_GAP) <= this.h * 0.3) return "compact"
    return "combined"
  }
  // Space the trend panel takes at the bottom.
  stripsHeight() {
    const n = this.display.trends.length
    if (!n || !this.h) return 0
    const L = this.trendLayout()
    return L === "combined" ? COMBINED_H + 6 : n * (STRIP[L] + STRIP_GAP) + 6
  }

  select(n: Node | null) {
    this.selected = n
    this.lit = n ? { up: this.closure(n.id, this.parents), down: this.closure(n.id, this.children) } : null
    this.onSelect(n)
    this.schedule()
  }

  get selection() {
    return this.selected
  }

  // Everything reachable from a node through prerequisite links.
  private closure(id: string, links: Map<string, string[]>) {
    const out = new Set<string>()
    const stack = [...(links.get(id) ?? [])]
    while (stack.length) {
      const x = stack.pop()!
      if (out.has(x)) continue
      out.add(x)
      stack.push(...(links.get(x) ?? []))
    }
    return out
  }

  // The links to draw among the shown nodes: one between two shown nodes
  // whenever one leads to the other through hidden ones, minus those
  // already implied by a longer chain (transitive reduction), so the
  // overview shows the main structure, not a hairball.
  private reduced(visible: Set<string>, key: string): Edge[] {
    const hit = this.reducedCache.get(key)
    if (hit) return hit
    const found = new Map<string, Set<string>>()
    for (const id of visible) {
      const out = new Set<string>()
      const seen = new Set<string>()
      const stack = [...(this.parents.get(id) ?? [])]
      while (stack.length) {
        const p = stack.pop()!
        if (seen.has(p)) continue
        seen.add(p)
        if (visible.has(p)) out.add(p)
        else stack.push(...(this.parents.get(p) ?? []))
      }
      found.set(id, out)
    }
    const reach = new Map<string, Set<string>>()
    const ancestors = (id: string): Set<string> => {
      const known = reach.get(id)
      if (known) return known
      const out = new Set<string>()
      reach.set(id, out)
      for (const p of found.get(id) ?? []) {
        out.add(p)
        for (const a of ancestors(p)) out.add(a)
      }
      return out
    }
    const edges: Edge[] = []
    for (const [id, ps] of found)
      for (const p of ps) {
        if ([...ps].some((q) => q !== p && ancestors(q).has(p))) continue
        edges.push(this.direct.get(`${p}>${id}`) ?? { s: p, t: id, kind: "requires", via: true })
      }
    if (this.reducedCache.size > 40) this.reducedCache.delete(this.reducedCache.keys().next().value!)
    this.reducedCache.set(key, edges)
    return edges
  }

  // ------------------------------------------------------------- render

  private schedule() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  // How many nodes show, in order of appearance. At the default detail it's
  // everything whose zoom has been reached (never fewer than the starting
  // set, even zoomed further out); less detail shows a fraction of that,
  // down to none at 0; more is like zooming in further, up to everything
  // at 100.
  private revealCount() {
    const { detail: v, grow } = this.display
    const N = this.order.length
    if (v <= 0) return 0
    if (v >= 100) return N
    const k = grow ? Math.max(1, this.t.k) : 1
    const upTo = (z: number) => {
      let lo = 0, hi = N
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (this.zSorted[mid] <= z + 1e-9) lo = mid + 1
        else hi = mid
      }
      return lo
    }
    const base = upTo(k)
    if (v <= DETAIL_DEFAULT) return Math.max(1, Math.round(base * (v / DETAIL_DEFAULT) ** 1.6))
    const zMax = this.zSorted[N - 1]
    return upTo(k * zMax ** ((v - DETAIL_DEFAULT) / (100 - DETAIL_DEFAULT)))
  }

  private passes(n: Node) {
    const f = this.filters
    if (f.fields.size && !n.fields.some((x) => f.fields.has(x)) && !(n.lane === "roots" && f.fields.has("roots"))) return false
    if (f.statuses.size && !f.statuses.has(n.status)) return false
    if (f.kinds.size && !f.kinds.has(n.kind)) return false
    return true
  }

  private render() {
    const { tree } = this
    const kx = this.t.k * this.bx, ky = this.t.k * this.by
    const sx = (x: number) => this.t.x + x * kx
    const sy = (y: number) => this.t.y + y * ky
    const lit = this.lit
    const q = this.search
    const matches = (n: Node) => !q || n.name.toLowerCase().includes(q) || n.id.includes(q)
    const count = this.revealCount()
    // What shows: nodes revealed at this zoom and detail (plus the frontier
    // if asked), plus, when something is selected, its whole chain.
    const inChain = (n: Node) => !!lit && (n === this.selected || lit.up.has(n.id) || lit.down.has(n.id))
    const base = (n: Node) => (this.orderIndex.get(n.id)! < count || (this.display.frontier && unachieved(n)) || (!!q && matches(n))) && this.passes(n)
    const flags = tree.nodes.map(base)
    const baseIds = new Set(tree.nodes.filter((_, i) => flags[i]).map((n) => n.id))
    const nodes = tree.nodes.filter((n, i) => flags[i] || (inChain(n) && this.passes(n)))
    const shownIds = new Set(nodes.map((n) => n.id))
    this.shownCount = baseIds.size
    const pad = 60
    const onScreen = (n: Node) => sx(n.x) > -pad && sx(n.x) < this.w + pad && sy(n.y) > -pad && sy(n.y) < this.h + pad
    const ink = this.dark ? "#e7ebef" : "#1d2329"
    const muted = this.dark ? "#8b96a2" : "#69737d"
    const halo = this.dark ? "#11161c" : "#ffffff"

    // The background, bars and links are painted on a canvas under the SVG,
    // which is much cheaper to redraw than SVG paths while zooming.
    const ctx = this.ctx
    const dpr = this.dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    ctx.setLineDash([])
    tree.lanes.forEach((l, i) => {
      ctx.fillStyle = i % 2 ? (this.dark ? "#161c23" : "#f4f5f2") : (this.dark ? "#12171d" : "#fbfbf9")
      ctx.fillRect(0, sy(l.y0), this.w, (l.y1 - l.y0) * ky)
    })
    const overview = this.t.k < 1.4
    type T = Track & { lane: Lane; first: boolean }
    const tracks: T[] = tree.lanes.flatMap((l) => l.tracks.map((t, i) => ({ ...t, lane: l, first: i === 0 })))
      .filter((t) => (t.y1 - t.y0) * ky >= 15 && sy(t.y1) > 36 && sy(t.y0) < this.h)
    if (!overview) {
      ctx.strokeStyle = this.dark ? "#232b34" : "#e3e5e0"
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      for (const t of tracks) if (!t.first) { ctx.moveTo(0, Math.round(sy(t.y0)) + 0.5); ctx.lineTo(this.w, Math.round(sy(t.y0)) + 0.5) }
      ctx.stroke()
      ctx.setLineDash([])
    }
    const trackX = overview ? this.left + 8 : 24
    this.g.tracks.selectAll<SVGTextElement, T>("text").data(overview ? [] : tracks, (t) => t.id).join("text")
      .attr("x", trackX).attr("y", (t) => Math.max(sy(t.y0) + 9, 44)).attr("dominant-baseline", "central")
      .attr("font-size", 9.5).attr("letter-spacing", "0.03em").attr("fill", muted).attr("opacity", 0.9)
      .attr("stroke", halo).attr("stroke-width", 3).attr("paint-order", "stroke").attr("pointer-events", "none")
      .text((t) => t.name.toUpperCase())
    const ts = timeScale(tree)
    const nowX = sx(ts.x(tree.meta.now))
    const eraX = ERAS.map(([y, name]) => [sx(ts.x(y)), name] as [number, string])
    const top = Math.max(0, sy(0)), bottom = Math.min(this.h, sy(tree.meta.height))
    ctx.strokeStyle = this.dark ? "#2a323b" : "#e1e3de"
    ctx.beginPath()
    for (const [x] of eraX) if (x > 0 && x < this.w) { ctx.moveTo(Math.round(x) + 0.5, top); ctx.lineTo(Math.round(x) + 0.5, bottom) }
    ctx.stroke()
    const accent = this.dark ? "#8fb0ff" : "#3d6fb6"
    if (nowX < this.w) {
      const fade = ctx.createLinearGradient(nowX, 0, Math.max(nowX + 1, sx(tree.meta.width)), 0)
      fade.addColorStop(0, this.dark ? "rgba(143,176,255,0.07)" : "rgba(61,111,182,0.07)")
      fade.addColorStop(1, "rgba(0,0,0,0)")
      ctx.fillStyle = fade
      ctx.fillRect(Math.max(0, nowX), top, this.w, bottom - top)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(nowX, top)
      ctx.lineTo(nowX, bottom)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Axis along the top, in screen space: era names, then years that fit.
    const axis = this.g.axis
    axis.selectAll<SVGRectElement, number>("rect").data([0]).join("rect").attr("x", 0).attr("y", 0).attr("width", this.w).attr("height", 34)
      .attr("fill", this.dark ? "rgba(14,19,25,0.92)" : "rgba(255,255,255,0.92)")
    const eraLabels = eraX.map(([x, name], i) => ({ x: Math.max(x, 4), end: i + 1 < eraX.length ? eraX[i + 1][0] : nowX, name }))
      .filter((d) => d.end - d.x > d.name.length * 6.3 + 12)
    axis.selectAll<SVGTextElement, (typeof eraLabels)[number]>("text.era").data(eraLabels, (d) => d.name).join("text").attr("class", "era")
      .attr("x", (d) => d.x + 4).attr("y", 13).text((d) => d.name).attr("fill", this.dark ? "#9aa6b2" : "#5b6672").attr("font-size", 11)
    let last = -Infinity
    const all = [
      ...DEEP_TICKS.map(([ago, label]) => ({ key: label, x: sx(ts.x(tree.meta.now - ago)), label })),
      ...TICKS.map((y) => ({ key: String(y), x: sx(ts.x(y)), label: y < 0 ? `${-y} BC` : y === 1 ? "AD 1" : String(y) })),
    ]
    const ticks = all.filter((d) => {
      if (d.x < 0 || d.x > this.w || d.x - last < d.label.length * 3.2 + 34) return false
      last = d.x
      return true
    })
    axis.selectAll<SVGTextElement, (typeof ticks)[number]>("text.tick").data(ticks, (d) => d.key).join("text").attr("class", "tick")
      .attr("x", (d) => d.x).attr("y", 28).attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", ink)
      .text((d) => d.label)
    axis.selectAll<SVGTextElement, number>("text.nowlabel").data(nowX > 0 && nowX < this.w ? [0] : []).join("text").attr("class", "nowlabel")
      .attr("x", nowX + 4).attr("y", 46).attr("font-size", 10.5).attr("fill", this.dark ? "#8fb0ff" : "#3d6fb6").text("Now")

    // Lane names. Zoomed out they sit just right of the options panel with
    // a backing; zoomed in, where they'd cover nodes, each lane's name runs
    // up a colored tab at the left edge.
    const laneLabels = tree.lanes.map((l) => ({ ...l, cy: Math.max(sy(l.y0) + 10, Math.min(sy(l.y1) - 6, (sy(l.y0) + sy(l.y1)) / 2)) }))
      .filter((l) => sy(l.y1) > 40 && sy(l.y0) < this.h && (l.y1 - l.y0) * ky > 14 && (!overview || l.cy > 46))
    const lab = this.g.lanelabels.selectAll<SVGGElement, (typeof laneLabels)[number]>("g").data(laneLabels, (d) => d.id).join((en) => {
      const g = en.append("g").attr("pointer-events", "none")
      g.append("rect").attr("class", "back")
      g.append("rect").attr("class", "tab")
      g.append("text")
      return g
    })
    const lx = this.left + 6
    lab.select("text")
      .attr("transform", (d) => (overview ? null : `translate(10.5,${(Math.max(36, sy(d.y0)) + Math.min(this.h, sy(d.y1))) / 2}) rotate(-90)`))
      .attr("x", overview ? lx + 6 : 0).attr("y", (d) => (overview ? d.cy : 0))
      .attr("text-anchor", overview ? "start" : "middle").attr("dominant-baseline", "central")
      .attr("font-size", overview ? 11.5 : 10).attr("font-weight", 600)
      .attr("fill", (d) => (overview ? d.color : "#ffffff"))
      .text((d) => {
        const room = Math.min(this.h, sy(d.y1)) - Math.max(36, sy(d.y0))
        return overview || d.name.length * 6 < room ? d.name : room > 40 ? d.name.split(" ")[0] : ""
      })
    lab.select("rect.back").attr("display", overview ? null : "none").attr("x", lx).attr("y", (d) => d.cy - 9).attr("height", 18).attr("rx", 4)
      .attr("width", (d) => d.name.length * 6.2 + 12).attr("fill", this.dark ? "rgba(14,19,25,0.85)" : "rgba(255,255,255,0.85)")
    lab.select("rect.tab").attr("display", overview ? "none" : null).attr("x", 0).attr("width", 17)
      .attr("y", (d) => Math.max(36, sy(d.y0)) + 1).attr("height", (d) => Math.max(0, Math.min(this.h, sy(d.y1)) - Math.max(36, sy(d.y0)) - 2))
      .attr("fill", (d) => d.color).attr("opacity", 0.85)

    // Links: the reduced set for what's showing (or every direct link, if
    // asked); a selection's chain is drawn whole, its routes in color.
    const sel = this.selected
    let edges: Edge[]
    if (lit && sel) {
      const up = (id: string) => id === sel.id || lit.up.has(id)
      const down = (id: string) => id === sel.id || lit.down.has(id)
      edges = tree.edges.filter((e) => {
        if (!shownIds.has(e.s) || !shownIds.has(e.t)) return false
        if (e.kind === "helped" || e.kind === "competes") return e.s === sel.id || e.t === sel.id
        return (up(e.s) && up(e.t)) || (down(e.s) && down(e.t))
      })
    } else if (this.display.allLinks) {
      edges = tree.edges.filter((e) => shownIds.has(e.s) && shownIds.has(e.t))
    } else {
      edges = this.reduced(baseIds, flags.map((f) => (f ? 1 : 0)).join(""))
    }
    const edgeColor = (e: Edge) => {
      if (e.kind === "competes") return "#c2534b"
      if (!lit || !sel) return this.dark ? "#56606b" : "#a7adb3"
      if (e.t === sel.id && e.routes?.length) return ROUTE_COLORS[e.routes[0] % ROUTE_COLORS.length]
      return lit.down.has(e.t) || e.s === sel.id ? "#2a9d8f" : "#d08a1e"
    }

    const dim = (n: Node) => (lit && !inChain(n)) || (q && !matches(n))
    // Date ranges and future windows as bars behind the nodes.
    for (const n of nodes) {
      if (n.to <= n.from || !onScreen(n)) continue
      const x0 = sx(ts.x(n.from)), x1 = sx(ts.x(n.to))
      if (x1 - x0 <= 6) continue
      ctx.globalAlpha = (unachieved(n) ? 0.35 : 0.22) * (dim(n) ? 0.3 : 1)
      ctx.fillStyle = this.color(n)
      ctx.beginPath()
      // roundRect is missing before Safari 16.
      if (ctx.roundRect) ctx.roundRect(x0, sy(n.y) - 2, x1 - x0, 4, 2)
      else ctx.rect(x0, sy(n.y) - 2, x1 - x0, 4)
      ctx.fill()
    }
    // Links as curves, skipping any wholly off screen, batched by style
    // (one stroke per style is far cheaper than one per link).
    const batches = new Map<string, { color: string; width: number; alpha: number; dash: number[]; path: Path2D }>()
    for (const e of edges) {
      const a = this.byId.get(e.s)!, b = this.byId.get(e.t)!
      const x1 = sx(a.x), y1 = sy(a.y), x2 = sx(b.x), y2 = sy(b.y)
      if ((x1 < 0 && x2 < 0) || (x1 > this.w && x2 > this.w) || (y1 < 0 && y2 < 0) || (y1 > this.h && y2 > this.h)) continue
      const color = edgeColor(e)
      const width = lit ? (e.routes && e.t === sel?.id ? 2.2 : 1.6) : e.kind === "uses" ? 0.8 : 1.1
      const alpha = lit ? 0.85 : e.kind === "uses" ? 0.35 : e.via ? 0.4 : 0.55
      const key = `${color}|${width}|${alpha}|${e.kind}`
      let batch = batches.get(key)
      if (!batch) {
        batch = { color, width, alpha, dash: e.kind === "helped" ? [4, 3] : e.kind === "competes" ? [2, 3] : e.kind === "uses" ? [1, 3] : [], path: new Path2D() }
        batches.set(key, batch)
      }
      const dx = Math.max(24, Math.abs(x2 - x1) * 0.5)
      batch.path.moveTo(x1, y1)
      batch.path.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2)
    }
    for (const bt of batches.values()) {
      ctx.strokeStyle = bt.color
      ctx.lineWidth = bt.width
      ctx.globalAlpha = bt.alpha
      ctx.setLineDash(bt.dash)
      ctx.stroke(bt.path)
    }
    ctx.globalAlpha = 1
    ctx.setLineDash([])

    // Nodes. Achieved: solid; being worked on: half-filled; not yet:
    // dashed outline; lost: gray.
    const vis = nodes.filter(onScreen)
    const nodeSel = this.g.nodes.selectAll<SVGPathElement, Node>("path").data(vis, (n) => n.id).join((en) =>
      en.append("path").attr("class", "node")
        .on("click", (e: MouseEvent, n) => { e.stopPropagation(); this.select(this.selected === n ? null : n) })
        .on("pointerenter", (e: PointerEvent, n) => this.onHover(n, [e.offsetX, e.offsetY]))
        .on("pointerleave", () => this.onHover(null, [0, 0])),
    )
    nodeSel.attr("transform", (n) => `translate(${sx(n.x)},${sy(n.y)})`)
      .attr("d", (n) => shape(n.kind, RADIUS[n.tier] * (n === sel ? 1.4 : 1)))
      .attr("fill-rule", "evenodd")
      .attr("fill", (n) => (n.status === "speculative" ? halo : n.status === "lost" ? (this.dark ? "#4b5158" : "#c9cbc6") : this.color(n)))
      .attr("fill-opacity", (n) => (n.status === "ongoing" ? 0.42 : 1))
      .attr("stroke", (n) => (n.status === "achieved" ? (n === sel ? ink : halo) : this.color(n)))
      .attr("stroke-width", (n) => (n.status === "speculative" || n.status === "ongoing" ? 1.6 : n === sel ? 2 : 1))
      .attr("stroke-dasharray", (n) => (n.status === "speculative" ? "2 1.5" : null))
      .attr("opacity", (n) => (dim(n) ? 0.18 : 1))
      .style("cursor", "pointer")

    // Labels: as many as fit, the selection and its chain first, then by
    // importance.
    const priority = (n: Node) => (n === sel ? -1e9 : inChain(n) ? -1e6 : 0) + n.z + (dim(n) ? 1e6 : 0)
    const placed: [number, number, number, number][] = []
    const size = (n: Node) => (n.tier === 1 ? 12 : n.tier === 2 ? 11 : 10.5)
    const labels = vis.filter((n) => !dim(n) || n === sel).sort((a, b) => priority(a) - priority(b) || a.x - b.x).filter((n) => {
      const s = size(n)
      const x = sx(n.x) + RADIUS[n.tier] + 4, y = sy(n.y)
      const box: [number, number, number, number] = [x - 2, y - s / 2 - 1, x + n.name.length * s * 0.55 + 2, y + s / 2 + 1]
      if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) return false
      placed.push(box)
      return true
    })
    this.g.labels.selectAll<SVGTextElement, Node>("text").data(labels, (n) => n.id).join("text")
      .attr("x", (n) => sx(n.x) + RADIUS[n.tier] + 4).attr("y", (n) => sy(n.y))
      .attr("dominant-baseline", "central")
      .attr("font-size", size)
      .attr("font-weight", (n) => (n.tier === 1 || n === sel ? 650 : 500))
      .attr("font-style", (n) => (n.status === "speculative" ? "italic" : null))
      .attr("fill", ink).attr("stroke", halo).attr("stroke-width", 3).attr("paint-order", "stroke").attr("stroke-linejoin", "round")
      .attr("pointer-events", "none")
      .text((n) => n.name)

    this.renderTrends(sx, ts.x, ink, muted, halo, overview)
    this.onRender()
  }

  // The chosen metrics along the bottom, as strips (each its own scale) or
  // one combined chart (each line scaled to its own range): the data, the
  // fitted trend carried forward (dashed), forecast scenarios (dotted, with
  // their bands) and, on strips, the milestones.
  private geometry(m: Metric, y0: number, H: number, sx: (x: number) => number, tx: (year: number) => number, withMarks: boolean) {
    const f = (v: number) => (m.log ? Math.log10(v) : v)
    const ok = (v: number) => !m.log || v > 0
    const pts = m.points.filter(([, v]) => ok(v))
    const ms = withMarks ? m.milestones.map((id) => this.byId.get(id)).filter((n): n is Node => !!n && !!n.threshold) : []
    const scen = m.scenarios ?? []
    const vals = [...pts.map(([, v]) => f(v)), ...ms.map((n) => f(n.threshold!.value))]
    for (const sc of scen) for (const [x, v] of [...sc.points, ...sc.low, ...sc.high]) if (x <= 2100 && ok(v)) vals.push(f(v))
    // Room for the trend to run on a dozen years past the data.
    if (m.trend && pts.length) vals.push(m.trend.slope * (pts.at(-1)![0] + 12) + m.trend.intercept)
    let lo = Math.min(...vals), hi = Math.max(...vals)
    if (m.log && hi - lo < 0.5) { lo -= 0.25; hi += 0.25 }
    if (!m.log) { const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad }
    const py = (u: number) => y0 + 3 + (1 - (u - lo) / (hi - lo)) * (H - 6)
    const line = (list: [number, number][]) => list.filter(([, v]) => ok(v)).map(([x, v], j) => `${j ? "L" : "M"}${sx(tx(x)).toFixed(1)},${py(f(v)).toFixed(1)}`).join("")
    const data = line(pts)
    let ext = ""
    if (m.trend && pts.length) {
      const span = hi - lo
      const seg: string[] = []
      for (let x = pts.at(-1)![0]; x <= 2100; x += 0.5) {
        const u = m.trend.slope * x + m.trend.intercept
        if (u < lo - span * 0.02 || u > hi + span * 0.02) break
        seg.push(`${seg.length ? "L" : "M"}${sx(tx(x)).toFixed(1)},${py(u).toFixed(1)}`)
      }
      ext = seg.join("")
    }
    const scenarios = scen.map((sc) => {
      const band = sc.low.length > 1 && sc.high.length > 1 ? line(sc.low) + line([...sc.high].reverse()).replace(/^M/, "L") + "Z" : ""
      const end = sc.points.filter(([, v]) => ok(v)).at(-1)
      return { id: sc.id, name: sc.name, d: line(sc.points), band, end: end ? [sx(tx(end[0])), py(f(end[1]))] as [number, number] : null }
    })
    // Milestone labels that would overlap the one before are left out.
    let end = -Infinity
    const marks = ms.map((n) => ({ x: sx(n.x), label: n.threshold!.label ?? n.name, done: n.status === "achieved", id: n.id }))
      .sort((a, b) => a.x - b.x)
      .map((mk) => {
        const show = mk.x + 3 > end + 4
        if (show) end = mk.x + 3 + mk.label.length * 5.3
        return { ...mk, label: show ? mk.label : "" }
      })
    return { data, ext, scenarios, marks, py, f }
  }

  private renderTrends(sx: (x: number) => number, tx: (year: number) => number, ink: string, muted: string, halo: string, overview: boolean) {
    const list = this.display.trends.map((id) => this.metrics.get(id)).filter((m): m is Metric => !!m)
    const layout = this.trendLayout()
    const now = this.tree.meta.now
    const labelX = overview ? this.left + 8 : 24
    const nowX = sx(tx(now))
    const accent = this.dark ? "#8fb0ff" : "#3d6fb6"
    const bg = this.dark ? "#11161c" : "#ffffff"
    const edge = this.dark ? "#26303a" : "#e1e3de"
    const g = this.g.trends
    g.selectAll("*").remove()
    if (!list.length) return
    const top = this.h - this.stripsHeight()
    g.append("rect").attr("x", 0).attr("y", top).attr("width", this.w).attr("height", this.h - top).attr("fill", bg).attr("stroke", edge)
    // Hover: the data point nearest the pointer, over all lines shown.
    const hover: { x: number; y: number; text: string }[] = []
    const addHover = (m: Metric, py: (u: number) => number, f: (v: number) => number) => {
      for (const [x, v] of m.points) if (!m.log || v > 0) hover.push({ x: sx(tx(x)), y: py(f(v)), text: `${m.name}: ${fmtValue(v, m.unit)} in ${Math.round(x)}` })
    }
    const drawLines = (sel: Sel<SVGGElement>, geo: ReturnType<TreeView["geometry"]>, color: string, labels: boolean) => {
      for (const sc of geo.scenarios) {
        if (sc.band) sel.append("path").attr("d", sc.band).attr("fill", color).attr("opacity", 0.1)
        sel.append("path").attr("d", sc.d).attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.2).attr("stroke-dasharray", "1.5 2.5").attr("opacity", 0.9)
      }
      sel.append("path").attr("d", geo.ext).attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.3).attr("stroke-dasharray", "4 3").attr("opacity", 0.75)
      sel.append("path").attr("d", geo.data).attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.8)
      if (labels) {
        let lastY = -Infinity
        for (const sc of [...geo.scenarios].filter((x) => x.end).sort((a, b) => a.end![1] - b.end![1])) {
          if (sc.end![1] - lastY < 9) continue
          lastY = sc.end![1]
          sel.append("text").attr("x", sc.end![0] + 3).attr("y", sc.end![1]).attr("dominant-baseline", "central").attr("font-size", 9).attr("fill", muted)
            .attr("stroke", halo).attr("stroke-width", 2.5).attr("paint-order", "stroke").text(sc.name)
        }
      }
    }
    if (layout === "combined") {
      // Legend chips along the top, then every line in one chart.
      const chips = g.append("g")
      let cx = labelX, cy = top + 13
      list.forEach((m, i) => {
        const w = m.short.length * 6.2 + 22
        if (cx + w > this.w - 8) { cx = labelX; cy += 16 }
        const chip = chips.append("g").attr("class", "strip").style("cursor", "pointer").on("click", (e: MouseEvent) => { e.stopPropagation(); this.onMetric(m) })
        chip.append("rect").attr("x", cx).attr("y", cy - 6).attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", PALETTE[i % PALETTE.length])
        chip.append("text").attr("x", cx + 14).attr("y", cy).attr("dominant-baseline", "central").attr("font-size", 10.5).attr("fill", ink).text(m.short)
        cx += w
      })
      const y0 = cy + 12, H = this.h - 6 - y0
      const area = g.append("g")
      area.append("line").attr("x1", nowX).attr("x2", nowX).attr("y1", y0).attr("y2", y0 + H).attr("stroke", accent).attr("stroke-dasharray", "3 3").attr("opacity", 0.6)
      list.forEach((m, i) => {
        const geo = this.geometry(m, y0, H, sx, tx, false)
        drawLines(area.append("g"), geo, PALETTE[i % PALETTE.length], false)
        addHover(m, geo.py, geo.f)
      })
      area.append("text").attr("x", this.w - 8).attr("y", y0 + H - 4).attr("text-anchor", "end").attr("font-size", 9.5).attr("fill", muted)
        .text("Each line on its own scale. Dashed: trend; dotted: forecasts.")
    } else {
      const H = STRIP[layout]
      list.forEach((m, i) => {
        const y0 = top + 3 + i * (H + STRIP_GAP)
        const color = (m.field && this.fieldColor.get(m.field)) || ink
        const strip = g.append("g").attr("class", "strip").style("cursor", "pointer").on("click", (e: MouseEvent) => { e.stopPropagation(); this.onMetric(m) })
        strip.append("rect").attr("x", 0).attr("y", y0).attr("width", this.w).attr("height", H).attr("fill", bg).attr("fill-opacity", 0)
        if (i) strip.append("line").attr("x1", 0).attr("x2", this.w).attr("y1", y0 - 1.5).attr("y2", y0 - 1.5).attr("stroke", edge)
        strip.append("line").attr("x1", nowX).attr("x2", nowX).attr("y1", y0).attr("y2", y0 + H).attr("stroke", accent).attr("stroke-dasharray", "3 3").attr("opacity", 0.6)
        const geo = this.geometry(m, y0, H, sx, tx, true)
        drawLines(strip, geo, color, layout === "strips")
        addHover(m, geo.py, geo.f)
        for (const mk of geo.marks) {
          strip.append("line").attr("x1", mk.x).attr("x2", mk.x).attr("y1", y0 + 2).attr("y2", y0 + H - 2)
            .attr("stroke", color).attr("stroke-width", 1.2).attr("stroke-dasharray", mk.done ? null : "2 2")
          if (mk.label && layout === "strips") strip.append("text").attr("x", mk.x + 3).attr("y", y0 + H - 5).attr("font-size", 9.5).attr("fill", muted)
            .attr("stroke", halo).attr("stroke-width", 2.5).attr("paint-order", "stroke").text(mk.label)
        }
        const last = m.points.at(-1)
        strip.append("text").attr("x", labelX).attr("y", y0 + (layout === "strips" ? 12 : H / 2)).attr("dominant-baseline", layout === "strips" ? null : "central")
          .attr("font-size", layout === "strips" ? 11 : 10).attr("font-weight", 650).attr("fill", color)
          .attr("stroke", halo).attr("stroke-width", 3).attr("paint-order", "stroke")
          .text(layout === "strips" ? m.short : `${m.short}${last ? `  ${fmtValue(last[1], m.unit)} (${Math.round(last[0])})` : ""}`)
        if (layout === "strips" && last)
          strip.append("text").attr("x", labelX).attr("y", y0 + 25).attr("font-size", 10).attr("fill", muted)
            .attr("stroke", halo).attr("stroke-width", 3).attr("paint-order", "stroke").text(`${fmtValue(last[1], m.unit)} (${Math.round(last[0])})`)
      })
    }
    // One invisible layer on top catches the pointer for the tooltip, and
    // passes clicks through to the strip or chip under it.
    g.on("pointermove", (e: PointerEvent) => {
      let best: (typeof hover)[number] | null = null, bd = 30 * 30
      for (const h of hover) {
        const d = (h.x - e.offsetX) ** 2 + ((h.y - e.offsetY) * 0.5) ** 2
        if (d < bd) { bd = d; best = h }
      }
      this.onHover(null, [e.offsetX, e.offsetY - 40], best?.text)
    }).on("pointerleave", () => this.onHover(null, [0, 0]))
  }
}

// "1.2 billion USD" style, compact.
export function fmtValue(v: number, unit: string) {
  const abs = Math.abs(v)
  const s = abs >= 1e15 ? v.toExponential(1).replace("e+", "e") : abs >= 1e12 ? `${+(v / 1e12).toPrecision(3)}T` : abs >= 1e9 ? `${+(v / 1e9).toPrecision(3)}B` : abs >= 1e6 ? `${+(v / 1e6).toPrecision(3)}M` : abs >= 1e3 ? `${+(v / 1e3).toPrecision(3)}k` : abs >= 0.01 || abs === 0 ? `${+v.toPrecision(3)}` : v.toExponential(1)
  if (unit === "USD") return `$${s}`
  if (unit.startsWith("USD/") || unit.startsWith("USD per")) return `$${s}/${unit.replace(/^USD ?(\/|per) ?/, "")}`
  return `${s} ${unit}`
}
