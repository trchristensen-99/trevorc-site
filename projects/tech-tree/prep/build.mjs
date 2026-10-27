// Builds ../data/tree.json from nodes/*.yaml and metrics/*.yaml (see
// SCHEMA.md): checks the links, places every node on the time axis and in
// its field lanes, works out which links to draw at each zoom level, and
// fits trend lines to the metrics.
//
//   npm install && npm run build

import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"

const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.join(HERE, "..", "data")
const NOW = 2026.8

const FIELDS = [
  { id: "math", name: "Mathematics", color: "#7b5ea7" },
  { id: "computing", name: "Computing and AI", color: "#3d6fb6" },
  { id: "electronics", name: "Electronics and communication", color: "#2f8fb0" },
  { id: "physics", name: "Physics", color: "#2a9d8f" },
  { id: "energy", name: "Energy", color: "#e0a526" },
  { id: "engineering", name: "Engineering and transport", color: "#c9772a" },
  { id: "materials", name: "Materials", color: "#8d6e4f" },
  { id: "chemistry", name: "Chemistry", color: "#c2534b" },
  { id: "biology", name: "Biology", color: "#4f9a4a" },
  { id: "medicine", name: "Medicine", color: "#d0587e" },
  { id: "agriculture", name: "Agriculture and food", color: "#8aa33a" },
  { id: "society", name: "Society and institutions", color: "#6b7280" },
]
const ROOTS = { id: "roots", name: "Roots", color: "#9a8466" }
const KINDS = ["precondition", "resource", "discovery", "technique", "device", "infrastructure", "institution"]
const STATUSES = ["achieved", "ongoing", "speculative", "lost"]
// The zoom (relative to the whole-tree view) at which each tier appears.
const TIER_ZOOM = { 1: 1, 2: 2.4, 3: 5 }

const warnings = []
const warn = (m) => warnings.push(m)
const readYaml = (f) => YAML.parse(fs.readFileSync(f, "utf8"))
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => path.join(dir, f)) : [])

// ------------------------------------------------------------------ load

const nodes = []
const byId = new Map()
// NODES and METRICS can point elsewhere, e.g. at sample data while
// developing the app.
const NODES = process.env.NODES ?? path.join(HERE, "nodes")
const METRICS = process.env.METRICS ?? path.join(HERE, "metrics")
for (const file of files(NODES)) {
  const list = readYaml(file) ?? []
  for (const n of list) {
    const where = `${path.basename(file)}: ${n?.id ?? "(no id)"}`
    if (!n?.id) { warn(`${where}: missing id`); continue }
    if (byId.has(n.id)) { warn(`${where}: duplicate id (also in ${byId.get(n.id)._file})`); continue }
    n._file = path.basename(file)
    nodes.push(n)
    byId.set(n.id, n)
  }
}
// Editorial links added at merge time (links.yaml).
if (fs.existsSync(path.join(HERE, "links.yaml")))
  for (const l of readYaml(path.join(HERE, "links.yaml")) ?? []) {
    const n = byId.get(l.id)
    if (!n) { warn(`links.yaml: unknown node ${l.id}`); continue }
    for (const key of ["requires", "helped_by", "uses", "competes"]) if (l[key]) n[key] = [...new Set([...(n[key] ?? []), ...l[key]])]
  }
const metrics = files(METRICS).map((f) => ({ ...readYaml(f), _file: path.basename(f) }))
const metricIds = new Set(metrics.map((m) => m.id))

// ----------------------------------------------------------------- check

const fieldIds = new Set(FIELDS.map((f) => f.id))
const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x])

// Dates: a year, [from, to], or { window: [from, to], likely }.
function parseDate(d, where) {
  const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/[,_ ]/g, "")))
  if (d == null) { warn(`${where}: missing date`); return null }
  if (typeof d === "object" && !Array.isArray(d)) {
    const [a, b] = (d.window ?? []).map(num)
    const likely = num(d.likely ?? (a + b) / 2)
    if (![a, b, likely].every(Number.isFinite)) { warn(`${where}: bad date ${JSON.stringify(d)}`); return null }
    return { from: Math.min(a, b), to: Math.max(a, b), at: likely }
  }
  if (Array.isArray(d)) {
    const [a, b] = d.map(num)
    if (![a, b].every(Number.isFinite)) { warn(`${where}: bad date ${JSON.stringify(d)}`); return null }
    // A range's point on the axis is its geometric middle in years ago, so
    // "3.3 to 2.6 million years ago" sits where it reads.
    const ya = (y) => Math.max(1, NOW - y)
    const at = a < NOW - 2000 && b < NOW - 2000 ? NOW - Math.sqrt(ya(a) * ya(b)) : (a + b) / 2
    return { from: Math.min(a, b), to: Math.max(a, b), at }
  }
  const y = num(d)
  if (!Number.isFinite(y)) { warn(`${where}: bad date ${JSON.stringify(d)}`); return null }
  return { from: y, to: y, at: y }
}

const kept = []
for (const n of nodes) {
  const where = `${n._file}: ${n.id}`
  n.fields = list(n.fields).filter((f) => {
    if (fieldIds.has(f)) return true
    warn(`${where}: unknown field ${f}`)
    return false
  })
  if (n.kind === "precondition" || n.kind === "resource") n.lane = "roots"
  else if (!n.fields.length) { warn(`${where}: no valid fields; put in society`); n.fields = ["society"] }
  if (!KINDS.includes(n.kind)) { warn(`${where}: unknown kind ${n.kind}`); n.kind = "technique" }
  if (!STATUSES.includes(n.status)) { warn(`${where}: unknown status ${n.status}`); n.status = "achieved" }
  n.tier = [1, 2, 3].includes(Number(n.tier)) ? Number(n.tier) : 3
  n._date = parseDate(n.date, where)
  if (!n._date) continue
  if (!n.sources?.length) warn(`${where}: no sources`)
  if (n.metric && !metricIds.has(n.metric)) { warn(`${where}: unknown metric ${n.metric}`); delete n.metric }
  kept.push(n)
}
const live = new Map(kept.map((n) => [n.id, n]))

// Links. Missing ids are reported, then dropped.
const missing = new Map()
const linkList = (n, key) =>
  list(n[key]).filter((id) => {
    if (live.has(id) && id !== n.id) return true
    if (id !== n.id) missing.set(id, [...(missing.get(id) ?? []), n.id])
    return false
  })
for (const n of kept) {
  n._requires = [...new Set([...linkList(n, "requires"), ...linkList(n, "uses")])]
  n._helped = [...new Set(linkList(n, "helped_by"))].filter((id) => !n._requires.includes(id))
  n._competes = [...new Set(linkList(n, "competes"))]
}
for (const [id, from] of missing) warn(`unknown id ${id}, referenced by ${from.join(", ")}`)

// Prerequisites should come first; report the ones that don't, and break
// any cycles (a cycle would make "everything this needs" infinite).
for (const n of kept)
  for (const id of n._requires) {
    const p = live.get(id)
    if (p.kind === "resource" || p.kind === "precondition") continue
    if (p._date.from > n._date.to + 1) warn(`${n.id} (${n._date.to}) requires ${id}, dated later (${p._date.from})`)
  }
{
  const state = new Map()
  const visit = (n, stack) => {
    state.set(n.id, 1)
    for (const id of [...n._requires]) {
      const s = state.get(id)
      if (s === 1) {
        warn(`cycle: ${[...stack, n.id, id].join(" -> ")}; dropped ${n.id} -> ${id}`)
        n._requires = n._requires.filter((x) => x !== id)
      } else if (!s) visit(live.get(id), [...stack, n.id])
    }
    state.set(n.id, 2)
  }
  for (const n of kept) if (!state.get(n.id)) visit(n, [])
}

// ---------------------------------------------------------------- layout

// Time: logarithmic in distance from now, so the deep past is compressed
// and the present and future get room. Beyond about 12,000 years ago it's
// compressed twice as hard, since few nodes live there.
const TAU = 12
const DEEP = Math.log10(1 + 12000 / TAU)
const FUTURE_GAIN = 1.25
function timeU(year) {
  const d = year - NOW
  if (d >= 0) return FUTURE_GAIN * Math.log10(1 + d / TAU)
  let u = Math.log10(1 + -d / TAU)
  if (u > DEEP) u = DEEP + (u - DEEP) * 0.5
  return -u
}
const years = kept.flatMap((n) => [n._date.from, n._date.to])
const uMin = timeU(Math.min(...years)) - 0.08
const uMax = Math.max(timeU(2100), timeU(Math.max(...years))) + 0.06
// World units are screen pixels at the starting zoom on a typical desktop
// (about 1,150 by 860 of map), so the spacing below is real spacing.
const WIDTH = 1150
const xOf = (year) => ((timeU(year) - uMin) / (uMax - uMin)) * WIDTH

// Lanes: one per field, from abstract to applied, with the roots below.
// Lanes get height in proportion to the square root of how many nodes
// they hold, with a floor, so busy fields have room without empty ones
// vanishing.
const laneOrder = [...FIELDS.map((f) => f.id), "roots"]
const laneOf = (n) => n.lane ?? n.fields[0]
const counts = Object.fromEntries(laneOrder.map((l) => [l, kept.filter((n) => laneOf(n) === l).length]))
const TOTAL_HEIGHT = 860
const lanes = []
{
  const weight = (id) => Math.sqrt(counts[id] + 1)
  const sum = laneOrder.reduce((a, id) => a + weight(id), 0)
  let y = 0
  for (const id of laneOrder) {
    const h = Math.max(34, (TOTAL_HEIGHT * weight(id)) / sum)
    const f = FIELDS.find((x) => x.id === id) ?? ROOTS
    lanes.push({ id, name: f.name, color: f.color, y0: y, y1: y + h, count: counts[id] })
    y += h
  }
}
const lane = (id) => lanes.find((l) => l.id === id)
const HEIGHT = lanes.at(-1).y1

// A node with several fields leans toward its other lanes, but stays in
// its main one so the lanes stay readable.
for (const n of kept) {
  const main = lane(laneOf(n))
  const mid = (l) => (l.y0 + l.y1) / 2
  let target = mid(main)
  const others = n.fields.slice(1).map(lane).filter(Boolean).filter((l) => l !== main)
  if (others.length && !n.lane) {
    const pull = others.reduce((s, l) => s + mid(l), 0) / others.length
    target = Math.max(main.y0 + 8, Math.min(main.y1 - 8, mid(main) + (pull - mid(main)) * 0.35))
  }
  n._x = xOf(n._date.at)
  n._target = target
  n._lane = main
}

// Place nodes so none overlap at the zoom where they first appear:
// landmarks first, then each finer tier around them.
const R = 7
const placed = []
for (const tier of [1, 2, 3]) {
  const s = TIER_ZOOM[tier]
  const gapX = (2 * R + 6) / s, gapY = (2 * R + 4) / s
  const group = kept.filter((n) => n.tier === tier).sort((a, b) => a._x - b._x)
  for (const n of group) {
    const { y0, y1 } = n._lane
    const free = (y) => placed.every((p) => Math.abs(p._x - n._x) >= Math.max(gapX, (2 * R + 6) / TIER_ZOOM[p.tier]) || Math.abs(p._y - y) >= Math.max(gapY, (2 * R + 4) / TIER_ZOOM[p.tier]))
    let y = n._target
    for (let i = 0, step = gapY / 2; i < 200; i++) {
      const cand = n._target + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step
      if (cand < y0 + R || cand > y1 - R) continue
      if (free(cand)) { y = cand; break }
    }
    n._y = y
    placed.push(n)
  }
}

// --------------------------------------------------------------- links

// At each zoom level only some nodes show. Draw a link between two shown
// nodes when one leads to the other through nodes hidden at that level,
// then drop links already implied by a longer chain (transitive
// reduction), so the overview shows the main structure, not a hairball.
const reqOf = (id) => live.get(id)._requires
function levelEdges(level) {
  const visible = (id) => live.get(id).tier <= level
  const parents = new Map()
  for (const n of kept) {
    if (!visible(n.id)) continue
    const found = new Set()
    const seen = new Set()
    const stack = [...reqOf(n.id)]
    while (stack.length) {
      const id = stack.pop()
      if (seen.has(id)) continue
      seen.add(id)
      if (visible(id)) found.add(id)
      else stack.push(...reqOf(id))
    }
    parents.set(n.id, found)
  }
  // Reduction: drop p -> n when p is reachable from another parent of n.
  const reach = new Map()
  const ancestors = (id) => {
    if (reach.has(id)) return reach.get(id)
    const out = new Set()
    reach.set(id, out)
    for (const p of parents.get(id) ?? []) {
      out.add(p)
      for (const a of ancestors(p)) out.add(a)
    }
    return out
  }
  const edges = []
  for (const [id, ps] of parents)
    for (const p of ps) {
      const implied = [...ps].some((q) => q !== p && ancestors(q).has(p))
      if (!implied) edges.push([p, id])
    }
  return edges
}
const edgeMap = new Map()
for (const level of [1, 2, 3])
  for (const [s, t] of levelEdges(level)) {
    const key = `${s}>${t}`
    const e = edgeMap.get(key) ?? { s, t, kind: live.get(s).kind === "resource" ? "uses" : "requires", levels: 0, direct: reqOf(t).includes(s) }
    e.levels |= 1 << (level - 1)
    edgeMap.set(key, e)
  }
// Direct links not in any reduced level (implied ones) still exist; the
// app shows them when a node is selected.
for (const n of kept)
  for (const s of n._requires) {
    const key = `${s}>${n.id}`
    if (!edgeMap.has(key)) edgeMap.set(key, { s, t: n.id, kind: live.get(s).kind === "resource" ? "uses" : "requires", levels: 0, direct: true })
  }
for (const n of kept)
  for (const s of n._helped) edgeMap.set(`${s}~${n.id}`, { s, t: n.id, kind: "helped", levels: 0, direct: true })
for (const n of kept)
  for (const s of n._competes)
    if (!edgeMap.has(`${n.id}!${s}`)) edgeMap.set(`${s}!${n.id}`, { s, t: n.id, kind: "competes", levels: 0, direct: true })

// ---------------------------------------------------------------- metrics

// Exponential trend (Moore's-law style): a straight line through log10 of
// the values against the year, reported as a doubling or halving time.
function fitTime(points) {
  const pts = points.filter(([x, y]) => Number.isFinite(x) && y > 0)
  if (pts.length < 3) return null
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => Math.log10(p[1]))
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx, r2: (sxy * sxy) / (sxx * syy), years: Math.log10(2) / Math.abs(slope), from: Math.min(...xs), to: Math.max(...xs) }
}
// Learning curve (Wright's law): price against cumulative production on a
// log-log scale; the learning rate is the price drop per doubling.
function fitWright(price, cumulative) {
  const cum = new Map(cumulative.points.map(([x, y]) => [Math.round(x), y]))
  const pts = price.points.filter(([x, y]) => cum.has(Math.round(x)) && y > 0 && cum.get(Math.round(x)) > 0)
  if (pts.length < 3) return null
  const fit = fitTime(pts.map(([x, y]) => [Math.log10(cum.get(Math.round(x))), y]))
  return fit && { exponent: fit.slope, learningRate: 1 - 2 ** fit.slope, r2: fit.r2, points: pts.length }
}
const metricsOut = metrics.map((m) => {
  const points = (m.points ?? []).map(([x, y]) => [Number(x), Number(y)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0])
  if (points.length < 2) warn(`metric ${m.id}: fewer than two points`)
  // `fit` can limit the trend to a period, or fit the cheapest (or best)
  // value each year where several rival products share a year. Trends
  // that don't fit (r² under 0.5) aren't shown.
  let fitPts = points.filter(([x]) => (m.fit?.from == null || x >= m.fit.from) && (m.fit?.to == null || x <= m.fit.to))
  if (m.fit?.envelope) {
    const best = new Map()
    for (const [x, y] of fitPts) {
      const k = Math.round(x)
      if (!best.has(k) || (m.fit.envelope === "min" ? y < best.get(k) : y > best.get(k))) best.set(k, y)
    }
    fitPts = [...best].sort((a, b) => a[0] - b[0])
  }
  let trend = fitTime(fitPts)
  if (trend && trend.r2 < 0.5) {
    warn(`metric ${m.id}: trend fits poorly (r² ${trend.r2.toFixed(2)}), not shown`)
    trend = null
  }
  const cumulative = m.cumulative && metrics.find((x) => x.id === m.cumulative)
  const wright = cumulative ? fitWright({ points }, { points: cumulative.points.map(([x, y]) => [Number(x), Number(y)]) }) : null
  return {
    id: m.id, name: m.name, unit: m.unit, better: m.better ?? "higher", log: m.log !== false, points,
    trend, wright, source: m.source, license: m.license, note: m.note,
  }
})

// ----------------------------------------------------------------- write

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d
const out = {
  meta: {
    built: new Date().toISOString().slice(0, 10), now: NOW,
    width: WIDTH, height: HEIGHT,
    time: { tau: TAU, deep: DEEP, futureGain: FUTURE_GAIN, uMin, uMax },
    tierZoom: TIER_ZOOM,
  },
  fields: FIELDS, roots: ROOTS, lanes,
  nodes: kept.map((n) => ({
    id: n.id, name: n.name, kind: n.kind, fields: n.fields, status: n.status, tier: n.tier,
    date: n.date, from: n._date.from, to: n._date.to, at: round(n._date.at, 2),
    x: round(n._x), y: round(n._y), lane: n._lane.id,
    summary: n.summary, efforts: n.efforts, effort: n.effort, forecast: n.forecast, lost: n.lost,
    scarcity: n.scarcity, note: n.note, metric: n.metric, sources: n.sources,
  })),
  edges: [...edgeMap.values()],
  metrics: metricsOut,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "tree.json"), JSON.stringify(out))

const by = (key) => Object.entries(kept.reduce((m, n) => ({ ...m, [n[key]]: (m[n[key]] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ")
console.log(`${kept.length} nodes (${by("kind")}); tiers ${by("tier")}; status ${by("status")}`)
console.log(`${out.edges.length} links; ${metricsOut.length} metrics; tree.json ${(fs.statSync(path.join(OUT, "tree.json")).size / 1024).toFixed(0)} KB`)
for (const m of metricsOut) if (m.trend) console.log(`  ${m.id}: ${m.trend.slope < 0 ? "halves" : "doubles"} every ${m.trend.years.toFixed(2)} years (r² ${m.trend.r2.toFixed(2)})${m.wright ? `; learning rate ${(m.wright.learningRate * 100).toFixed(0)}%` : ""}`)
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ` + warnings.slice(0, 80).join("\n  ") + (warnings.length > 80 ? `\n  ... and ${warnings.length - 80} more` : ""))
