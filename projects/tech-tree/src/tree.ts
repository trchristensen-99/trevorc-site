// Draws the tech tree as SVG: time across, field lanes down. Nodes keep
// their size on screen while the layout zooms, and finer tiers appear as
// you zoom in (semantic zoom). Selecting a node lights up everything it
// needs and everything it led to, at any zoom.

import { select, type Selection } from "d3-selection"
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom"
import { timeScale } from "./time"
import type { Edge, Lane, Node, Tree } from "./types"

type Sel<T extends Element> = Selection<T, unknown, null, undefined>

export interface Filters {
  fields: Set<string> // empty = all
  statuses: Set<string> // empty = all
  kinds: Set<string> // empty = all
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
const TICKS = [-3000, -1000, 1, 1000, 1500, 1700, 1800, 1850, 1900, 1925, 1950, 1975, 2000, 2010, 2020, 2030, 2040, 2050, 2075, 2100]
const RADIUS = { 1: 7.5, 2: 5.5, 3: 4.2 } as const

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
    case "resource":
      return poly([[0, r * 1.2], [r * 1.1, -r * 0.7], [-r * 1.1, -r * 0.7]])
    case "precondition":
      return `M${r},0A${r},${r} 0 1 1 ${-r},0A${r},${r} 0 1 1 ${r},0ZM${r * 0.45},0A${r * 0.45},${r * 0.45} 0 1 0 ${-r * 0.45},0A${r * 0.45},${r * 0.45} 0 1 0 ${r * 0.45},0Z`
  }
}
export const kindShape = shape

export class TreeView {
  onSelect: (n: Node | null) => void = () => {}
  onHover: (n: Node | null, at: [number, number]) => void = () => {}
  onViewChange: () => void = () => {}

  private svg: Sel<SVGSVGElement>
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
  private color: (n: Node) => string
  private parents = new Map<string, string[]>()
  private children = new Map<string, string[]>()
  private selected: Node | null = null
  private lit: { up: Set<string>; down: Set<string> } | null = null
  private filters: Filters = { fields: new Set(), statuses: new Set(), kinds: new Set() }
  private search = ""
  showAllLinks = false
  dark = false

  constructor(private el: SVGSVGElement, private tree: Tree) {
    this.byId = new Map(tree.nodes.map((n) => [n.id, n]))
    const fieldColor = new Map(tree.fields.map((f) => [f.id, f.color]))
    this.color = (n) => (n.lane === "roots" ? tree.roots.color : fieldColor.get(n.fields[0]) ?? "#888")
    for (const e of tree.edges) {
      if (e.kind !== "requires" && e.kind !== "uses") continue
      ;(this.parents.get(e.t) ?? this.parents.set(e.t, []).get(e.t)!).push(e.s)
      ;(this.children.get(e.s) ?? this.children.set(e.s, []).get(e.s)!).push(e.t)
    }
    this.svg = select(el)
    this.svg.selectAll("*").remove()
    const defs = this.svg.append("defs")
    defs.append("linearGradient").attr("id", "future-fade").call((gr) => {
      gr.append("stop").attr("offset", "0").attr("stop-color", "currentColor").attr("stop-opacity", 0.07)
      gr.append("stop").attr("offset", "1").attr("stop-color", "currentColor").attr("stop-opacity", 0.0)
    })
    for (const name of ["lanes", "eras", "edges", "bars", "nodes", "labels", "axis", "lanelabels"]) this.g[name] = this.svg.append("g").attr("class", name)
    this.zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 60])
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.t = e.transform
        this.schedule()
        this.onViewChange()
      })
    this.svg.call(this.zoomer).on("dblclick.zoom", null)
    this.svg.on("click", (e: MouseEvent) => {
      if ((e.target as Element).closest(".node")) return
      this.select(null)
    })
  }

  // ------------------------------------------------------------- public

  resize() {
    const r = this.el.getBoundingClientRect()
    const first = this.w === 0
    this.w = Math.max(320, r.width)
    this.h = Math.max(240, r.height)
    const { width, height } = this.tree.meta
    // The whole tree fits at zoom 1, clear of the options panel on wide
    // screens and the axis on top.
    this.left = this.w > 1000 ? 285 : 12
    this.bx = (this.w - this.left - 16) / width
    this.by = Math.min((this.h - 44) / height, this.bx * 3)
    this.zoomer.scaleExtent([0.8, 60]).translateExtent([[-width * this.bx * 0.3, -height * this.by * 0.3], [width * this.bx * 1.3, height * this.by * 1.3]])
    if (first) this.svg.call(this.zoomer.transform, zoomIdentity.translate(this.left, 38))
    this.schedule()
  }

  // Centre on a year and lane position at a relative zoom.
  focus(x: number, y: number, k: number) {
    this.svg.call(this.zoomer.transform, zoomIdentity.translate(this.w / 2 - x * this.bx * k, this.h / 2 - y * this.by * k).scale(k))
  }
  focusNode(n: Node, rel = 4) {
    const k = Math.max(rel, this.t.k)
    this.svg.call(this.zoomer.transform, zoomIdentity.translate(this.w * 0.42 - n.x * this.bx * k, this.h / 2 - n.y * this.by * k).scale(k))
  }
  view(): [number, number, number] {
    const k = this.t.k
    return [(this.w / 2 - this.t.x) / (this.bx * k), (this.h / 2 - this.t.y) / (this.by * k), k]
  }

  setFilters(f: Filters) {
    this.filters = f
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

  // ------------------------------------------------------------- render

  private schedule() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private rel() {
    return this.t.k
  }

  // The finest tier showing at the current zoom.
  private level() {
    const r = this.rel()
    const z = this.tree.meta.tierZoom
    return r >= z[3] * 0.95 ? 3 : r >= z[2] * 0.95 ? 2 : 1
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
    const level = this.level()
    const lit = this.lit
    const q = this.search
    const matches = (n: Node) => !q || n.name.toLowerCase().includes(q) || n.id.includes(q)
    // What shows: nodes of the tiers in view, plus, when something is
    // selected, its whole chain whatever the tier.
    const inChain = (n: Node) => !!lit && (n === this.selected || lit.up.has(n.id) || lit.down.has(n.id))
    const shown = (n: Node) => (n.tier <= level || inChain(n) || (!!q && matches(n))) && this.passes(n)
    const nodes = tree.nodes.filter(shown)
    const shownIds = new Set(nodes.map((n) => n.id))
    const pad = 60
    const onScreen = (n: Node) => sx(n.x) > -pad && sx(n.x) < this.w + pad && sy(n.y) > -pad && sy(n.y) < this.h + pad
    const ink = this.dark ? "#e7ebef" : "#1d2329"
    const halo = this.dark ? "#11161c" : "#ffffff"

    // Lanes and eras.
    this.g.lanes.selectAll<SVGRectElement, Lane>("rect").data(tree.lanes, (d) => d.id).join("rect")
      .attr("x", sx(0) - 4000).attr("width", tree.meta.width * kx + 8000)
      .attr("y", (d) => sy(d.y0)).attr("height", (d) => (d.y1 - d.y0) * ky)
      .attr("fill", (_, i) => (i % 2 ? (this.dark ? "#161c23" : "#f4f5f2") : (this.dark ? "#12171d" : "#fbfbf9")))
    const ts = timeScale(tree)
    const nowX = sx(ts.x(tree.meta.now))
    const eraX = ERAS.map(([y, name]) => [sx(ts.x(y)), name] as [number, string])
    this.g.eras.selectAll<SVGLineElement, [number, string]>("line").data(eraX).join("line")
      .attr("x1", (d) => d[0]).attr("x2", (d) => d[0]).attr("y1", sy(0)).attr("y2", sy(tree.meta.height))
      .attr("stroke", this.dark ? "#2a323b" : "#e1e3de").attr("stroke-width", 1)
    this.g.eras.selectAll<SVGRectElement, number>("rect.future").data([0]).join("rect").attr("class", "future")
      .attr("x", nowX).attr("width", Math.max(0, sx(tree.meta.width) - nowX + 2000)).attr("y", sy(0)).attr("height", tree.meta.height * ky)
      .attr("fill", "url(#future-fade)").style("color", this.dark ? "#8fb0ff" : "#3d6fb6")
    this.g.eras.selectAll<SVGLineElement, number>("line.now").data([0]).join("line").attr("class", "now")
      .attr("x1", nowX).attr("x2", nowX).attr("y1", sy(0)).attr("y2", sy(tree.meta.height))
      .attr("stroke", this.dark ? "#8fb0ff" : "#3d6fb6").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 3")

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
      ...TICKS.map((y) => ({ key: String(y), x: sx(ts.x(y)), label: y < 0 ? `${-y} BCE` : y === 1 ? "1 CE" : String(y) })),
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
    // a backing; zoomed in, where they'd cover nodes, they shrink to a
    // colored tab and faint text at the left edge.
    const overview = this.t.k < 1.4
    const laneLabels = tree.lanes.map((l) => ({ ...l, cy: Math.max(sy(l.y0) + 10, Math.min(sy(l.y1) - 6, (sy(l.y0) + sy(l.y1)) / 2)) }))
      .filter((l) => sy(l.y1) > 40 && sy(l.y0) < this.h && (l.y1 - l.y0) * ky > 14)
    const lab = this.g.lanelabels.selectAll<SVGGElement, (typeof laneLabels)[number]>("g").data(laneLabels, (d) => d.id).join((en) => {
      const g = en.append("g").attr("pointer-events", "none")
      g.append("rect").attr("class", "back")
      g.append("rect").attr("class", "tab")
      g.append("text")
      return g
    })
    // Zoomed in, each lane's name runs up a colored tab at the left edge.
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
      .attr("width", (d) => d.name.length * 6.6 + 12).attr("fill", this.dark ? "rgba(14,19,25,0.85)" : "rgba(255,255,255,0.85)")
    lab.select("rect.tab").attr("display", overview ? "none" : null).attr("x", 0).attr("width", 17)
      .attr("y", (d) => Math.max(36, sy(d.y0)) + 1).attr("height", (d) => Math.max(0, Math.min(this.h, sy(d.y1)) - Math.max(36, sy(d.y0)) - 2))
      .attr("fill", (d) => d.color).attr("opacity", 0.85)

    // Links: the reduced set for the zoom level (or every link, if asked),
    // between shown nodes; a selection's chain is drawn whole.
    const bit = 1 << (level - 1)
    const edges = tree.edges.filter((e) => {
      if (!shownIds.has(e.s) || !shownIds.has(e.t)) return false
      if (lit) {
        const sel = this.selected!.id
        const up = (id: string) => id === sel || lit.up.has(id)
        const down = (id: string) => id === sel || lit.down.has(id)
        if (e.kind === "helped" || e.kind === "competes") return e.s === sel || e.t === sel
        return (up(e.s) && up(e.t) && e.direct) || (down(e.s) && down(e.t) && e.direct)
      }
      if (e.kind === "helped" || e.kind === "competes") return this.showAllLinks
      return this.showAllLinks ? e.direct : (e.levels & bit) !== 0
    })
    const curve = (e: Edge) => {
      const a = this.byId.get(e.s)!, b = this.byId.get(e.t)!
      const x1 = sx(a.x), y1 = sy(a.y), x2 = sx(b.x), y2 = sy(b.y)
      const dx = Math.max(24, Math.abs(x2 - x1) * 0.5)
      return `M${x1},${y1}C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
    }
    const edgeColor = (e: Edge) => {
      if (e.kind === "competes") return "#c2534b"
      if (!lit) return this.dark ? "#56606b" : "#a7adb3"
      const sel = this.selected!.id
      return lit.down.has(e.t) || e.s === sel ? "#2a9d8f" : "#d08a1e"
    }
    this.g.edges.selectAll<SVGPathElement, Edge>("path").data(edges, (e) => `${e.s}>${e.t}>${e.kind}`).join("path")
      .attr("d", curve).attr("fill", "none")
      .attr("stroke", edgeColor)
      .attr("stroke-width", (e) => (lit ? 1.6 : e.kind === "uses" ? 0.8 : 1.1))
      .attr("stroke-opacity", (e) => (lit ? 0.85 : e.kind === "uses" ? 0.35 : 0.55))
      .attr("stroke-dasharray", (e) => (e.kind === "helped" ? "4 3" : e.kind === "competes" ? "2 3" : e.kind === "uses" ? "1 3" : null))

    // Date ranges and future windows as bars behind the nodes.
    const ranged = nodes.filter((n) => n.to > n.from && (sx(ts.x(n.to)) - sx(ts.x(n.from))) > 6 && onScreen(n))
    this.g.bars.selectAll<SVGRectElement, Node>("rect").data(ranged, (n) => n.id).join("rect")
      .attr("x", (n) => sx(ts.x(n.from))).attr("width", (n) => sx(ts.x(n.to)) - sx(ts.x(n.from)))
      .attr("y", (n) => sy(n.y) - 2).attr("height", 4).attr("rx", 2)
      .attr("fill", (n) => this.color(n)).attr("opacity", (n) => (n.status === "speculative" || n.status === "ongoing" ? 0.35 : 0.22))

    // Nodes.
    const dim = (n: Node) => (lit && !inChain(n)) || (q && !matches(n))
    const vis = nodes.filter(onScreen)
    const sel = this.g.nodes.selectAll<SVGPathElement, Node>("path").data(vis, (n) => n.id).join((en) =>
      en.append("path").attr("class", "node")
        .on("click", (e: MouseEvent, n) => { e.stopPropagation(); this.select(this.selected === n ? null : n) })
        .on("pointerenter", (e: PointerEvent, n) => this.onHover(n, [e.offsetX, e.offsetY]))
        .on("pointerleave", () => this.onHover(null, [0, 0])),
    )
    sel.attr("transform", (n) => `translate(${sx(n.x)},${sy(n.y)})`)
      .attr("d", (n) => shape(n.kind, RADIUS[n.tier] * (n === this.selected ? 1.4 : 1)))
      .attr("fill-rule", "evenodd")
      .attr("fill", (n) => (n.status === "speculative" ? halo : n.status === "lost" ? (this.dark ? "#4b5158" : "#c9cbc6") : this.color(n)))
      .attr("stroke", (n) => (n.status === "speculative" || n.status === "lost" ? this.color(n) : n === this.selected ? ink : halo))
      .attr("stroke-width", (n) => (n.status === "speculative" ? 1.6 : n === this.selected ? 2 : 1))
      .attr("stroke-dasharray", (n) => (n.status === "speculative" ? "2 1.5" : null))
      .attr("opacity", (n) => (dim(n) ? 0.18 : 1))
      .classed("ongoing", (n) => n.status === "ongoing")
      .style("cursor", "pointer")

    // Labels: as many as fit, landmarks and the selection first.
    const priority = (n: Node) => (n === this.selected ? -1 : inChain(n) ? 0 : n.tier) + (dim(n) ? 10 : 0)
    const placed: [number, number, number, number][] = []
    const labels = vis.filter((n) => !dim(n) || n === this.selected).sort((a, b) => priority(a) - priority(b) || a.x - b.x).filter((n) => {
      const size = n.tier === 1 ? 12 : n.tier === 2 ? 11 : 10.5
      const x = sx(n.x) + RADIUS[n.tier] + 4, y = sy(n.y)
      const box: [number, number, number, number] = [x - 2, y - size / 2 - 1, x + n.name.length * size * 0.55 + 2, y + size / 2 + 1]
      if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) return false
      placed.push(box)
      return true
    })
    this.g.labels.selectAll<SVGTextElement, Node>("text").data(labels, (n) => n.id).join("text")
      .attr("x", (n) => sx(n.x) + RADIUS[n.tier] + 4).attr("y", (n) => sy(n.y))
      .attr("dominant-baseline", "central")
      .attr("font-size", (n) => (n.tier === 1 ? 12 : n.tier === 2 ? 11 : 10.5))
      .attr("font-weight", (n) => (n.tier === 1 || n === this.selected ? 650 : 500))
      .attr("font-style", (n) => (n.status === "speculative" ? "italic" : null))
      .attr("fill", ink).attr("stroke", halo).attr("stroke-width", 3).attr("paint-order", "stroke").attr("stroke-linejoin", "round")
      .attr("pointer-events", "none")
      .text((n) => n.name)
  }
}
