// Your own tree: future windows moved by hand, and what follows from them.
// Each future technology's three dates (window start, best guess, end) are
// redone from what it needs and the AI milestones that speed it, with the
// work its window stands for (prep/forecast.mjs, sandbox): if what it needs
// comes three years later, so does it, less whatever AI arriving sooner
// makes up. Untouched, every date comes out as the tree's own.

import { shiftScenario } from "./scenarios"
import { timeScale } from "./time"
import type { Models, Node, SandboxNode, Tree } from "./types"

type Dates = [number, number, number] // window start, best guess, end
export const END = 3000 // the far edge for your own dates
type Mechanism = Models["forecasting"]["mechanisms"][number]

export class Sandbox {
  readonly edits = new Map<string, Dates>()
  private original = new Map<string, Dates>()
  private originalScenarios = new Map<object, { points: [number, number][]; low: [number, number][]; high: [number, number][] }>()
  private order: string[] = []
  private byId: Map<string, Node>
  private mech: Map<string, Mechanism>
  private data: Record<string, SandboxNode>
  private now: number
  private x: (year: number) => number

  constructor(private tree: Tree) {
    this.byId = new Map(tree.nodes.map((n) => [n.id, n]))
    this.data = tree.models.forecasting.sandbox
    this.mech = new Map(tree.models.forecasting.mechanisms.map((m) => [m.id, m]))
    this.now = tree.meta.now
    this.x = timeScale(tree).x
    for (const id of Object.keys(this.data)) {
      const n = this.byId.get(id)
      if (n) this.original.set(id, [n.from, n.at, n.to])
    }
    for (const m of tree.metrics)
      for (const line of m.series ?? [m])
        for (const sc of line.scenarios) if (sc.follows) this.originalScenarios.set(sc, { points: sc.points, low: sc.low, high: sc.high })
    // Everything after what it needs and the milestones that speed it. A
    // speedup can point back up a chain (superintelligence speeds the
    // superhuman coder's work, but needs AGI, which needs the coder), so a
    // milestone that itself depends on a technology doesn't go before it.
    const upstream = new Map<string, Set<string>>()
    const above = (id: string): Set<string> => {
      if (upstream.has(id)) return upstream.get(id)!
      const set = new Set<string>()
      upstream.set(id, set)
      for (const r of this.data[id]?.needs ?? []) for (const o of r.open) { set.add(o); for (const x of above(o)) set.add(x) }
      return set
    }
    const state = new Map<string, 1 | 2>()
    const visit = (id: string) => {
      if (state.has(id) || !this.data[id]) return
      state.set(id, 1)
      const d = this.data[id]
      for (const r of d.needs) r.open.forEach(visit)
      // A threshold the growth model dates waits on what its paths wait on.
      if (tree.models.forecasting.growth?.nodes[id]) tree.models.forecasting.growth.drivers.forEach(visit)
      for (const m of d.by ?? []) {
        const src = this.mech.get(m)!.from
        if (!above(src).has(id)) visit(src)
      }
      state.set(id, 2)
      this.order.push(id)
    }
    Object.keys(this.data).forEach(visit)
  }

  editable(id: string) {
    return !!this.data[id]
  }
  originalOf(id: string) {
    return this.original.get(id)
  }

  set(id: string, d: Dates) {
    const from = Math.max(this.now + 0.1, Math.min(d[0], d[1])), to = Math.max(d[1], d[2], from + 0.2)
    this.edits.set(id, [from, Math.min(Math.max(d[1], from), to), to])
  }
  clear(id?: string) {
    if (id) this.edits.delete(id)
    else this.edits.clear()
  }

  // After robots build robots: the growth model's mix of regimes, or one of
  // them (slow, gradual or fast), for the thresholds it dates.
  regime = ""
  setRegime(r: string) {
    this.regime = r
  }
  // A threshold's date: from its base (or, in one regime, where the model
  // puts it then), moved as far as the model says its drivers' moves take
  // it, and no later than END ("not by 3000").
  private grown(id: string, k: number, base: number, dateOf: (id: string, k: number) => number) {
    const g = this.tree.models.forecasting.growth!.nodes[id]
    let by = 0
    for (const [dr, s] of Object.entries(g.sens)) {
      const o = this.original.get(dr)?.[k] ?? this.byId.get(dr)?.at
      if (o != null) by += s[k] * (dateOf(dr, k) - o)
    }
    // In one regime: where the model puts it then.
    const r = this.regime ? g.regimes[this.regime] : null
    const at = r ? r[k] ?? END : base
    return Math.max(this.now + 0.1, Math.min(END, at + by))
  }

  // Start from the tree's dates, or from the pooled forecasts' (their 10th,
  // 50th and 90th percentiles, where the pool has more than base rates).
  base: "tree" | "pool" = "tree"
  private poolRef = new Map<string, Dates>()
  poolOf(id: string) {
    const p = this.data[id]?.pool
    if (!p || this.data[id].baseOnly || p.some((v) => v == null)) return null
    return p as number[]
  }
  private baseOf(id: string): Dates {
    const p = this.base === "pool" ? this.poolOf(id) : null
    return p ? [Math.max(this.now + 0.1, p[0]), p[2], p[4]] : this.original.get(id)!
  }

  // Every date, in order, with these edits: each technology not moved by
  // hand starts from its base dates and moves by as much as what it needs
  // and the milestones that speed it move the sum of its work.
  private compute(edits: Map<string, Dates>, mode: "on" | "off" | "base" = "on") {
    const dates = new Map<string, Dates>()
    const dateOf = (id: string, k: number) => {
      const d = dates.get(id)
      if (d) return d[k]
      const n = this.byId.get(id)
      return n ? (this.original.get(id)?.[k] ?? n.at) : this.now
    }
    // Where the work would finish with nothing moved: the tree's own dates
    // give back each window's (stored as `was`); the pool's need one pass.
    if (mode === "on" && this.base === "pool" && !this.poolRef.size) {
      const ref = this.compute(new Map(), "base")
      for (const id of this.order) {
        const s = this.data[id]
        this.poolRef.set(id, [0, 1, 2].map((k) => this.finishOf(s, k, (o) => (ref.get(o) ?? this.baseOfAny(o))[k])) as Dates)
      }
    }
    for (const id of this.order) {
      const orig = this.baseOf(id)
      let d: Dates
      if (mode === "off") d = this.original.get(id)!
      else if (mode === "base") d = orig
      else if (edits.has(id)) d = edits.get(id)!
      else {
        const s = this.data[id]
        const grown = this.tree.models.forecasting.growth?.nodes[id]
        if (grown) d = [0, 1, 2].map((k) => this.grown(id, k, orig[k], dateOf)) as Dates
        else d = [0, 1, 2].map((k) => {
          const ref = this.base === "pool" ? this.poolRef.get(id)![k] : s.work[k][1]
          return orig[k] + (this.finishOf(s, k, (o) => dateOf(o, k)) - ref)
        }) as Dates
        d[0] = Math.max(Math.min(orig[0], this.now + 0.1), d[0])
        d.sort((a, b) => a - b)
      }
      dates.set(id, d)
    }
    return dates
  }
  private baseOfAny(id: string): Dates {
    if (this.data[id]) return this.baseOf(id)
    const n = this.byId.get(id)
    const v = n ? n.at : this.now
    return [v, v, v]
  }
  private finishOf(s: SandboxNode, k: number, dateOf: (id: string) => number) {
    const ready = Math.min(...s.needs.map((r) => Math.max(r.done ?? -Infinity, ...r.open.map(dateOf))))
    const start = Math.max(this.now, Number.isFinite(ready) ? ready : this.now)
    return this.finish(s, start, s.work[k][0], dateOf)
  }

  setBase(b: "tree" | "pool") {
    this.base = b
  }

  // Redo every date and write them into the tree's nodes (and the forecast
  // paths that follow a node). Returns the ids that moved from their base.
  apply(on = true): Set<string> {
    const dates = this.compute(this.edits, on ? "on" : "off")
    const moved = new Set<string>()
    for (const id of this.order) {
      const d = dates.get(id)!, b = on ? this.baseOf(id) : this.original.get(id)!
      const n = this.byId.get(id)!
      if (Math.abs(d[1] - b[1]) > 0.05 || Math.abs(d[0] - b[0]) > 0.05 || Math.abs(d[2] - b[2]) > 0.05) moved.add(id)
      n.from = d[0]
      n.at = d[1]
      n.to = d[2]
      n.x = this.x(d[1])
    }
    for (const [sc, o] of this.originalScenarios) {
      const f = (sc as { follows?: { node: string; at: number; from: number; to: number; base: string } }).follows!
      const line = this.lineOf(sc)
      const base = line?.scenarios.find((x) => x.id === f.base)
      const n = this.byId.get(f.node)
      if (!base || !n) continue
      const s = sc as { points: [number, number][]; low: [number, number][]; high: [number, number][] }
      s.points = shiftScenario(o.points, base.points, n.at - f.at)
      s.high = shiftScenario(o.high, base.points, n.from - f.from)
      s.low = shiftScenario(o.low, base.points, n.to - f.to)
    }
    return moved
  }

  // What one of your edits moves on its own: the technologies whose best
  // guess shifts by more than half a year, most first.
  effectsOf(id: string) {
    const d = this.edits.get(id)
    if (!d) return []
    const alone = this.compute(new Map([[id, d]]))
    const none = this.compute(new Map())
    return this.order
      .filter((x) => x !== id)
      .map((x) => ({ id: x, by: alone.get(x)![1] - none.get(x)![1] }))
      .filter((e) => Math.abs(e.by) > 0.5)
      .sort((a, b) => Math.abs(b.by) - Math.abs(a.by))
  }

  private lineOf(sc: object) {
    for (const m of this.tree.metrics) for (const line of m.series ?? [m]) if (line.scenarios.includes(sc as never)) return line
    return null
  }

  // The year `work` years of work at today's pace is done, from `start`,
  // with each mechanism's milestone arriving when `arrive` says (the same
  // sums as prep/forecast.mjs).
  private finish(s: SandboxNode, start: number, work: number, arrive: (id: string) => number) {
    const ms = (s.by ?? []).map((id) => this.mech.get(id)!).filter(Boolean)
    if (!s.shares || !ms.length) return start + work
    const list = Object.entries(s.shares).map(([w, sh]) => [w, sh, ms.filter((m) => m.speedup[w])] as const)
    const speed = (w: string, group: readonly Mechanism[], t: number) => {
      let k = 1
      for (const m of group) {
        const e = arrive(m.from)
        if (!(t > e)) continue
        k = Math.max(k, m.speedup[w] ** (m.ramp > 0 ? Math.min(1, (t - e) / m.ramp) : 1))
      }
      return k
    }
    const rate = (t: number) => 1 / list.reduce((a, [w, sh, g]) => a + (g.length ? sh / speed(w, g, t) : sh), 0)
    const breaks: number[] = []
    for (const m of ms) {
      const e = arrive(m.from)
      if (Number.isFinite(e)) for (let i = 0; i <= 4; i++) breaks.push(e + (m.ramp * i) / 4)
    }
    let t = start, left = work
    for (const b of [...breaks.filter((x) => x > start).sort((a, b) => a - b), Infinity]) {
      const r = rate(b === Infinity ? t + 1e-6 : (t + b) / 2)
      if (left <= (b - t) * r) return t + left / r
      left -= (b - t) * r
      t = b
    }
    return t + left
  }

  // For the link: id:start:best:end, one decimal, comma separated, after
  // "@pool" when starting from the pooled forecasts.
  encode() {
    return [...(this.base === "pool" ? ["@pool"] : []), ...(this.regime ? [`@g=${this.regime}`] : []), ...[...this.edits].map(([id, d]) => `${id}:${d.map((v) => v.toFixed(1)).join(":")}`)].join(",")
  }
  decode(s: string) {
    for (const part of s.split(",")) {
      if (part === "@pool") { this.base = "pool"; continue }
      if (part.startsWith("@g=")) { this.regime = part.slice(3); continue }
      const [id, ...v] = part.split(":")
      const d = v.map(Number)
      if (this.editable(id) && d.length === 3 && d.every(Number.isFinite)) this.set(id, d as Dates)
    }
  }
}
