// Builds ../data/tree.json from nodes/*.yaml and metrics/*.yaml (see
// SCHEMA.md): checks the links, fits trend lines to the metrics (and dates
// the milestones that sit on them), ranks the nodes by importance, and
// places every node on the time axis and in its field's lane and track.
// The app works out which links to draw for whatever is showing.
//
//   npm install && npm run build

import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { forecasting, LEVELS, WEIGHTS, SLIP, SLIP_HIGH } from "./forecast.mjs"

const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.join(HERE, "..", "data")
const NOW = 2026.8

// Fields are the lanes, from abstract to applied. Each has tracks
// (sub-lanes, top to bottom) so related technologies sit together; nodes
// are assigned to tracks in tracks.yaml or with their own `track:`.
const FIELDS = [
  { id: "math", name: "Mathematics", color: "#7b5ea7", tracks: [["geometry-analysis", "Geometry and analysis"], ["number-algebra", "Number and algebra"], ["probability-statistics", "Probability and statistics"], ["logic", "Logic"], ["cryptography", "Cryptography"]] },
  { id: "computing", name: "Computing and AI", color: "#3d6fb6", tracks: [["computing-theory", "Theory"], ["classic-ai", "Early AI and machine learning"], ["deep-learning", "Deep learning"], ["bioinformatics", "Bioinformatics"], ["software", "Software"], ["networks", "Networks"], ["computers", "Computers"]] },
  { id: "electronics", name: "Electronics and communication", color: "#2f8fb0", tracks: [["processors", "Processors"], ["components", "Components and memory"], ["chipmaking", "Chipmaking"], ["communication", "Communication"], ["neurotech", "Neurotechnology"]] },
  { id: "physics", name: "Physics", color: "#2a9d8f", tracks: [["quantum-atomic", "Quantum and atomic"], ["em-optics", "Electromagnetism and optics"], ["astronomy", "Astronomy"], ["earth-climate", "Earth and climate"], ["mechanics-heat", "Mechanics and heat"], ["nuclear-particle", "Nuclear and particle"]] },
  { id: "energy", name: "Energy", color: "#e0a526", tracks: [["nuclear-energy", "Nuclear"], ["renewables", "Renewables"], ["grid", "Electricity and the grid"], ["storage-fuels", "Storage and fuels"], ["carbon", "Carbon removal"], ["fossil-fuels", "Fossil fuels"], ["engines", "Fire and engines"]] },
  { id: "engineering", name: "Engineering and transport", color: "#c9772a", tracks: [["space", "Space"], ["aviation", "Aviation"], ["land-transport", "Land transport"], ["sea-transport", "Sea transport"], ["machines", "Machines and manufacturing"], ["construction", "Construction"]] },
  { id: "materials", name: "Materials", color: "#8d6e4f", tracks: [["metals", "Metals"], ["traditional-materials", "Stone, fiber and ceramics"], ["modern-materials", "Modern materials"], ["nanotech", "Nanotechnology"]] },
  { id: "chemistry", name: "Chemistry", color: "#c2534b", tracks: [["classical-chemistry", "Classical chemistry"], ["industrial-chemistry", "Industrial chemistry"], ["analytical-chemistry", "Analytical and biochemistry"]] },
  { id: "biology", name: "Biology", color: "#4f9a4a", tracks: [["sequencing", "Sequencing"], ["single-molecule", "Single-molecule sequencing"], ["genomics", "Genomics"], ["molecular-biology", "Molecular biology"], ["synthetic-biology", "Synthetic biology"], ["life-science", "Cells, evolution and the brain"]] },
  { id: "medicine", name: "Medicine", color: "#d0587e", tracks: [["genetic-medicine", "Genetic medicine"], ["drugs", "Drugs and trials"], ["longevity", "Aging and longevity"], ["surgery-organs", "Surgery and organs"], ["public-health", "Vaccines and public health"]] },
  { id: "agriculture", name: "Agriculture and food", color: "#8aa33a", tracks: [["crops", "Crops"], ["soil-water", "Soil and water"], ["farm-machines", "Farm machines"], ["animals-food", "Animals and food"]] },
  { id: "society", name: "Society and institutions", color: "#6b7280", tracks: [["research", "Science and research"], ["economy", "Money and markets"], ["law-governance", "Law and governance"], ["records", "Language and records"]] },
]
const ROOTS = { id: "roots", name: "Roots", color: "#9a8466", tracks: [["preconditions", "Preconditions"], ["resources", "Natural resources"]] }
const KINDS = ["precondition", "resource", "discovery", "technique", "device", "infrastructure", "institution", "milestone"]
const STATUSES = ["achieved", "ongoing", "speculative", "lost"]
// Zoomed all the way out, the landmarks (tier 1) show; the rest appear in
// order of importance as you zoom in, all of them by this zoom.
const FULL_ZOOM = 5

const warnings = []
const warn = (m) => warnings.push(m)
const readYaml = (f) => YAML.parse(fs.readFileSync(f, "utf8"))
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => path.join(dir, f)) : [])
const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x])

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
// Patches (patches/*.yaml): each entry replaces the fields it gives on an
// existing node, so a node can be reworded or re-dated without editing the
// file that defines it. `remove: true` deletes the node.
for (const file of files(path.join(HERE, "patches")))
  for (const p of readYaml(file) ?? []) {
    const n = byId.get(p.id)
    if (!n) { warn(`patches/${path.basename(file)}: unknown node ${p.id}`); continue }
    if (p.remove) { nodes.splice(nodes.indexOf(n), 1); byId.delete(p.id); continue }
    for (const [k, v] of Object.entries(p)) if (k !== "id") n[k] = v
    n._patched = path.basename(file)
  }
// Editorial links (links.yaml and links-*.yaml): each entry adds to a
// node's own lists.
// `drop` removes links that were wrong; drops apply after every addition,
// so the order of the files doesn't matter.
const linkEntries = files(HERE).filter((f) => /^links(-.*)?\.ya?ml$/.test(path.basename(f))).flatMap((file) => (readYaml(file) ?? []).map((l) => ({ ...l, _from: path.basename(file) })))
const LINK_KEYS = ["requires", "helped_by", "uses", "competes"]
for (const l of linkEntries) {
  const n = byId.get(l.id)
  if (!n) { warn(`${l._from}: unknown node ${l.id}`); continue }
  for (const key of LINK_KEYS) if (l[key]) n[key] = [...new Set([...(n[key] ?? []), ...l[key]])]
}
for (const l of linkEntries) {
  const n = byId.get(l.id)
  if (n) for (const key of LINK_KEYS) if (l.drop?.[key]) n[key] = (n[key] ?? []).filter((x) => !l.drop[key].includes(x))
}
// Effort (effort.yaml): what each technology took, merged key by key into
// the node's own `effort`, so the figures can be reviewed in one place.
const optional = (f) => (fs.existsSync(path.join(HERE, f)) ? readYaml(path.join(HERE, f)) ?? [] : [])
for (const e of optional("effort.yaml")) {
  const n = byId.get(e.id)
  if (!n) { warn(`effort.yaml: unknown node ${e.id}`); continue }
  const { id, ...rest } = e
  n.effort = { ...(n.effort ?? {}), ...rest }
  for (const [k, v] of Object.entries(n.effort)) if (v === null) delete n.effort[k]
}
// Supply (supply.yaml): world production, reserves and producers for each
// resource. Resource use (resource-use.yaml): how much of a resource a
// technology needs, and what share of the world's supply goes to it; each
// entry also adds the `uses` link.
for (const [id, s] of Object.entries(optional("supply.yaml"))) {
  const n = byId.get(id)
  if (!n) { warn(`supply.yaml: unknown node ${id}`); continue }
  if (n.kind !== "resource") warn(`supply.yaml: ${id} isn't a resource`)
  n.supply = s
}
const resourceUse = optional("resource-use.yaml")
for (const u of resourceUse) {
  const n = byId.get(u.tech), r = byId.get(u.resource)
  if (!n || !r) { warn(`resource-use.yaml: unknown node ${n ? u.resource : u.tech}`); continue }
  n.uses = [...new Set([...list(n.uses), u.resource])]
}
// Tracks (tracks.yaml): which sub-lane of its field each node sits in.
const trackOf = new Map()
for (const [track, ids] of Object.entries(readYaml(path.join(HERE, "tracks.yaml")) ?? {}))
  for (const id of ids ?? []) {
    if (!byId.has(id)) warn(`tracks.yaml: unknown node ${id}`)
    trackOf.set(id, track)
  }
const metrics = files(METRICS).map((f) => ({ ...readYaml(f), _file: path.basename(f) }))
const metricIds = new Set(metrics.map((m) => m.id))


// --------------------------------------------------------------- metrics

// Exponential trend (Moore's-law style): a straight line through log10 of
// the values against the year, reported as a doubling or halving time.
// `sd` is the scatter around the line, in log10 units.
// With log false, the line is fitted to the values themselves (steady
// growth, like life expectancy) and `slope` is per year.
function fitTime(points, log = true) {
  const pts = points.filter(([x, y]) => Number.isFinite(x) && (!log || y > 0))
  if (pts.length < 3) return null
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => (log ? Math.log10(p[1]) : p[1]))
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  const slope = sxy / sxx, intercept = my - slope * mx
  const sd = Math.sqrt(ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0) / Math.max(1, ys.length - 2))
  return { slope, intercept, r2: (sxy * sxy) / (sxx * syy), sd, years: log ? Math.log10(2) / Math.abs(slope) : null, linear: !log, from: Math.min(...xs), to: Math.max(...xs) }
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
// Forecast scenarios on a metric: a central path, optionally a band.
const SCENARIO_KINDS = ["trend", "projection", "survey", "market", "model", "judgment"]
function scenariosOf(m, points) {
  const pts = (list) => (list ?? []).map(([x, y]) => [Number(x), Number(y)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0])
  const last = points.at(-1)?.[0] ?? -Infinity
  return (m.scenarios ?? []).map((sc, i) => {
    const where = `metric ${m.id}: scenario ${sc.id ?? i + 1}`
    if (!sc.id || !sc.name) warn(`${where}: needs an id and a name`)
    if (!SCENARIO_KINDS.includes(sc.kind)) warn(`${where}: unknown kind ${sc.kind}`)
    const p = pts(sc.points)
    if (p.length < 2) warn(`${where}: needs at least two points`)
    if (p.length && p[0][0] < last - 1) warn(`${where}: starts in ${p[0][0]}, before the data ends (${last})`)
    if (!sc.sources?.length && sc.kind !== "judgment" && sc.kind !== "trend") warn(`${where}: no sources`)
    return { id: sc.id ?? `s${i + 1}`, name: sc.name ?? `Scenario ${i + 1}`, kind: sc.kind, points: p, low: pts(sc.low), high: pts(sc.high), note: sc.note && era(sc.note), sources: sc.sources }
  })
}
// The year a path first reaches a value (interpolating between its
// points, on the metric's own scale), or null if it never does.
function pathCrossing(m, path, value) {
  const f = (v) => (m.log !== false ? Math.log10(Math.max(v, 1e-300)) : v)
  const beats = (y) => (m.better === "lower" ? y <= value : y >= value)
  for (let i = 0; i < path.length; i++) {
    if (!beats(path[i][1])) continue
    if (i === 0) return path[0][0]
    const [x0, y0] = path[i - 1], [x1, y1] = path[i]
    const t = (f(value) - f(y0)) / (f(y1) - f(y0) || 1)
    return x0 + t * (x1 - x0)
  }
  return null
}

// A measured line: its points, and the trend fitted to them. `fit` can
// limit the trend to a period, or fit the cheapest (or best) value each
// year where several rival products share a year; `fit: false` fits none.
// Trends that don't fit (r² under 0.5) aren't shown.
function lineOf(m, src, where) {
  const points = (src.points ?? []).map(([x, y]) => [Number(x), Number(y)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).sort((a, b) => a[0] - b[0])
  if (points.length < 2) warn(`${where}: fewer than two points`)
  const fit = src.fit !== undefined ? src.fit : m.fit
  let fitPts = points.filter(([x]) => (!fit || fit.from == null || x >= fit.from) && (!fit || fit.to == null || x <= fit.to))
  if (fit?.envelope) {
    const best = new Map()
    for (const [x, y] of fitPts) {
      const k = Math.round(x)
      if (!best.has(k) || (fit.envelope === "min" ? y < best.get(k) : y > best.get(k))) best.set(k, y)
    }
    fitPts = [...best].sort((a, b) => a[0] - b[0])
  }
  let trend = fit === false ? null : fitTime(fitPts, m.log !== false)
  if (trend && trend.r2 < 0.5) {
    warn(`${where}: trend fits poorly (r² ${trend.r2.toFixed(2)}), not shown`)
    trend = null
  }
  return { points, trend, scenarios: scenariosOf({ ...m, id: where.replace(/^metric /, ""), scenarios: src.scenarios }, points), _fitPts: fitPts }
}
// A metric is one line, or several (`series`, e.g. one per income group)
// sharing a unit and a chart.
const metricsOut = metrics.map((m) => {
  const main = m.series ? { points: [], trend: null, scenarios: [] } : lineOf(m, m, `metric ${m.id}`)
  const series = m.series?.map((sr, i) => {
    if (!sr.id || !sr.name) warn(`metric ${m.id}: series ${i + 1} needs an id and a name`)
    return { id: sr.id, name: sr.name, ...lineOf(m, sr, `metric ${m.id} (${sr.id})`) }
  })
  const cumulative = m.cumulative && metrics.find((x) => x.id === m.cumulative)
  const wright = cumulative ? fitWright({ points: main.points }, { points: cumulative.points.map(([x, y]) => [Number(x), Number(y)]) }) : null
  return {
    id: m.id, name: m.name, short: m.short ?? m.name, unit: m.unit, better: m.better ?? "higher", log: m.log !== false,
    points: main.points, trend: main.trend, scenarios: main.scenarios, _fitPts: main._fitPts, ...(series ? { series } : {}),
    wright, source: m.source, license: m.license, note: m.note && era(m.note), field: m.field, milestones: [],
  }
})
// The line a milestone sits on: the metric's own, or one of its series.
function lineFor(m, seriesId) {
  if (!m.series) return m
  const sr = m.series.find((x) => x.id === seriesId)
  return sr ? { ...m, ...sr } : null
}
const metricById = new Map(metricsOut.map((m) => [m.id, m]))

// Milestones: a threshold on a metric ("a genome for under $1,000"). When
// the data has crossed it, the date is the first year it did; otherwise the
// trend carried forward gives a year, with a window from the scatter around
// the trend (wider on the late side, since trends slow more often than they
// speed up). A milestone's own `date` wins, but the trend's year is kept to
// show alongside it.
//
// A window can't open sooner than the fastest the series has ever moved
// (its best five-year stretch) would take to close the remaining gap from
// the latest data, and never before now.
function fastestRate(m) {
  const f = (v) => (m.log ? Math.log10(v) : v)
  const pts = m.points.filter(([, y]) => !m.log || y > 0)
  const sign = m.better === "lower" ? -1 : 1
  let best = 0
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const dt = pts[j][0] - pts[i][0]
      if (dt < 5) continue
      best = Math.max(best, (sign * (f(pts[j][1]) - f(pts[i][1]))) / dt)
      break
    }
  return best
}
function crossing(m, value) {
  const f = (v) => (m.log ? Math.log10(v) : v)
  const beats = (y) => (m.better === "lower" ? y <= value : y >= value)
  const hit = m.points.find(([, y]) => beats(y))
  if (hit) return { year: hit[0], crossed: true }
  if (!m.trend || (m.better === "lower") !== (m.trend.slope < 0)) return null
  const year = (f(value) - m.trend.intercept) / m.trend.slope
  const spread = Math.max(1, (1.5 * m.trend.sd) / Math.abs(m.trend.slope))
  const last = m.points.at(-1)
  const rate = fastestRate(m)
  const soonest = Math.max(NOW + 0.25, rate > 0 ? last[0] + Math.abs(f(last[1]) - f(value)) / rate : NOW + 1)
  const from = Math.max(year - spread, soonest)
  const likely = Math.max(year, from + 0.5)
  return { year, likely, from, to: Math.max(year + 2 * spread, likely + 1), crossed: false, soonest }
}

// ----------------------------------------------------------------- check

const fieldIds = new Set(FIELDS.map((f) => f.id))
const trackField = new Map([...FIELDS, ROOTS].flatMap((f) => f.tracks.map(([t]) => [t, f.id])))

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
  if (n.threshold) {
    const m = metricById.get(n.threshold.metric)
    if (!m) { warn(`${where}: threshold on unknown metric ${n.threshold.metric}`); delete n.threshold }
    else {
      const line = lineFor(m, n.threshold.series)
      if (!line) warn(`${where}: threshold needs a series of ${m.id} (${m.series.map((x) => x.id).join(", ")})`)
      const c = line && crossing(line, Number(n.threshold.value))
      if (c) n._trend = c
      if (n.date == null && c) n.date = c.crossed ? Math.round(c.year) : { window: [Math.round(c.from * 10) / 10, Math.ceil(c.to)], likely: Math.round(c.likely) }
      if (n.status == null && c) n.status = c.crossed ? "achieved" : "speculative"
      if (c && c.crossed && n.status !== "achieved") warn(`${where}: the data has crossed this threshold (${Math.round(c.year)}) but it isn't marked achieved`)
      m.milestones.push(n.id)
      n.metric ??= m.id
    }
  }
  if (!STATUSES.includes(n.status)) { warn(`${where}: unknown status ${n.status}`); n.status = "achieved" }
  n.tier = [1, 2, 3].includes(Number(n.tier)) ? Number(n.tier) : 3
  n._date = parseDate(n.date, where)
  if (!n._date) continue
  if (!n.sources?.length && !n.threshold) warn(`${where}: no sources`)
  if ((n.status === "speculative" || n.status === "ongoing") && !n.criterion && !n.threshold) warn(`${where}: future tech with no criterion`)
  if (n.metric && !metricIds.has(n.metric)) { warn(`${where}: unknown metric ${n.metric}`); delete n.metric }
  // Track: the node's own, else tracks.yaml, else its field's first.
  const laneId = n.lane ?? n.fields[0]
  const fieldDef = [...FIELDS, ROOTS].find((f) => f.id === laneId)
  let track = n.track ?? trackOf.get(n.id) ?? (n.kind === "resource" ? "resources" : null)
  if (track && trackField.get(track) !== laneId) {
    warn(`${where}: track ${track} isn't in its lane (${laneId})`)
    track = null
  }
  if (!track) {
    warn(`${where}: no track; put in ${fieldDef.tracks[0][0]}`)
    track = fieldDef.tracks[0][0]
  }
  n._track = track
  kept.push(n)
}
const live = new Map(kept.map((n) => [n.id, n]))

// Links. Missing ids are reported, then dropped. Routes are alternative
// sets of prerequisites (any one route is enough); `requires` is needed on
// every route.
const missing = new Map()
const linkList = (n, key, from = n) =>
  list(from[key]).filter((id) => {
    if (live.has(id) && id !== n.id) return true
    if (id !== n.id) missing.set(id, [...(missing.get(id) ?? []), n.id])
    return false
  })
for (const n of kept) {
  n._requires = [...new Set([...linkList(n, "requires"), ...linkList(n, "uses")])]
  n._routes = list(n.routes).map((r, i) => {
    if (!r?.name) warn(`${n._file}: ${n.id}: route ${i + 1} has no name`)
    return { name: r?.name ?? `Route ${i + 1}`, note: r?.note, requires: [...new Set(linkList(n, "requires", r ?? {}))] }
  })
  if (n._routes.length === 1) warn(`${n._file}: ${n.id}: only one route; fold it into requires`)
  n._all = [...new Set([...n._requires, ...n._routes.flatMap((r) => r.requires)])]
  n._helped = [...new Set(linkList(n, "helped_by"))].filter((id) => !n._all.includes(id))
  n._competes = [...new Set(linkList(n, "competes"))]
}
for (const [id, from] of missing) warn(`unknown id ${id}, referenced by ${from.join(", ")}`)

// Prerequisites should come first; report the ones that don't, and break
// any cycles (a cycle would make "everything this needs" infinite).
for (const n of kept)
  for (const id of n._all) {
    const p = live.get(id)
    if (p.kind === "resource" || p.kind === "precondition") continue
    if (p._date.from > n._date.to + 1) warn(`${n.id} (${n._date.to}) requires ${id}, dated later (${p._date.from})`)
  }
{
  const state = new Map()
  const drop = (n, id) => {
    n._requires = n._requires.filter((x) => x !== id)
    for (const r of n._routes) r.requires = r.requires.filter((x) => x !== id)
    n._all = n._all.filter((x) => x !== id)
  }
  const visit = (n, stack) => {
    state.set(n.id, 1)
    for (const id of [...n._all]) {
      const s = state.get(id)
      if (s === 1) {
        warn(`cycle: ${[...stack, n.id, id].join(" -> ")}; dropped ${n.id} -> ${id}`)
        drop(n, id)
      } else if (!s) visit(live.get(id), [...stack, n.id])
    }
    state.set(n.id, 2)
  }
  for (const n of kept) if (!state.get(n.id)) visit(n, [])
}

// Future windows: none should open in the past, or before something it
// needs (on every route) could be done.
for (const n of kept) {
  if (n.status !== "ongoing" && n.status !== "speculative") continue
  if (n._date.from < NOW - 0.05) warn(`${n.id}: not yet achieved, but its window opens in ${n._date.from}, before now`)
  for (const id of n._requires) {
    const p = live.get(id)
    if ((p.status === "ongoing" || p.status === "speculative") && p._date.from > n._date.from + 0.05)
      warn(`${n.id}: window opens ${n._date.from}, before what it needs (${id}) can (${p._date.from})`)
  }
  if (n._routes.length) {
    const earliest = Math.min(...n._routes.map((r) => Math.max(NOW, ...r.requires.map((id) => live.get(id)).filter((p) => p.status === "ongoing" || p.status === "speculative").map((p) => p._date.from))))
    if (earliest > n._date.from + 0.05) warn(`${n.id}: window opens ${n._date.from}, before any route's prerequisites can (${earliest})`)
  }
}

// Steps toward a frontier technology (`checklist`): other nodes, which
// count as done when achieved, or plain steps with the year they were done
// (or not yet) and who is working on them. Open steps are its open problems.
for (const n of kept) {
  if (!n.checklist) continue
  n._checklist = list(n.checklist).map((c, i) => {
    if (c.node) {
      const p = live.get(c.node)
      if (!p) { warn(`${n._file}: ${n.id}: checklist step ${i + 1}: unknown node ${c.node}`); return null }
      return { node: p.id, step: c.step ?? p.name, done: p.status === "achieved" ? Math.round(p._date.at) : null, ...(c.who ? { who: c.who } : {}) }
    }
    if (!c.step) warn(`${n._file}: ${n.id}: checklist step ${i + 1} needs a step or a node`)
    return { step: c.step, done: c.done ? Number(c.done) : null, ...(c.who ? { who: c.who } : {}), ...(c.note ? { note: c.note } : {}) }
  }).filter(Boolean)
}

// ---------------------------------------------------------------- models

// What it took. Person-years are the common measure: people working on it
// at once times the years of focused work (or `person_years` when the
// sources give a total). "research" efforts found out how; "build" efforts
// mostly built something people already knew how to make, and are left out
// of the fit.
const quantile = (xs, q) => {
  const a = [...xs].sort((x, y) => x - y)
  if (!a.length) return null
  const i = (a.length - 1) * q, lo = Math.floor(i)
  return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo)
}
const WORKS = ["research", "build"]
for (const n of kept) {
  const e = n.effort
  if (!e) continue
  const where = `${n._file}: ${n.id}: effort`
  const span = Array.isArray(e.span) ? e.span.map(Number) : null
  const years = span ? Math.max(1, span[1] - span[0]) : Number.isFinite(Number(e.span)) ? Number(e.span) : null
  const people = e.people != null && Number.isFinite(Number(e.people)) ? Number(e.people) : null
  const py = e.person_years != null ? Number(e.person_years) : years && people ? people * years : null
  const cost = e.cost_usd != null ? Number(e.cost_usd) : null
  const work = e.work ?? "research"
  if (!WORKS.includes(work)) warn(`${where}: unknown work ${work}`)
  if (e.people != null && people == null) warn(`${where}: people should be a number`)
  if (span && span[0] > n._date.to + 1 && n.status === "achieved") warn(`${where}: starts after it was achieved`)
  const open = n.status === "ongoing" || n.status === "speculative"
  if (open && py && !people) warn(`${where}: unachieved, so give people (working on it now)`)
  n._effort = { years, people, py, cost, work, rough: !!e.rough, open }
}
// Effort over time: log10 person-years against the year achieved and the
// kind of technology (discoveries take the least, programs and
// infrastructure the most), for research efforts since 1500, by least
// squares.
const EFFORT_FROM = 1500
const KIND_GROUPS = [["discovery", ["discovery"]], ["technique or device", ["technique", "device", "milestone"]], ["infrastructure or institution", ["infrastructure", "institution"]]]
const kindGroup = (kind) => Math.max(0, KIND_GROUPS.findIndex(([, ks]) => ks.includes(kind)))
const effortX = (year, kind) => [1, (year - 1900) / 100, ...KIND_GROUPS.slice(1).map((_, i) => (kindGroup(kind) === i + 1 ? 1 : 0))]
function ols(X, y) {
  // Normal equations, solved by Gaussian elimination (a handful of terms).
  const k = X[0].length
  const A = Array.from({ length: k }, (_, i) => [...Array.from({ length: k }, (_, j) => X.reduce((a, r) => a + r[i] * r[j], 0)), X.reduce((a, r, t) => a + r[i] * y[t], 0)])
  for (let c = 0; c < k; c++) {
    const p = A.reduce((best, r, i) => (i >= c && Math.abs(r[c]) > Math.abs(A[best][c]) ? i : best), c)
    ;[A[c], A[p]] = [A[p], A[c]]
    for (let i = 0; i < k; i++) if (i !== c) { const f = A[i][c] / A[c][c]; for (let j = c; j <= k; j++) A[i][j] -= f * A[c][j] }
  }
  const beta = A.map((r, i) => r[k] / r[i])
  const fit = X.map((r) => r.reduce((a, v, i) => a + v * beta[i], 0))
  const my = y.reduce((a, b) => a + b) / y.length
  const ssr = y.reduce((a, v, i) => a + (v - fit[i]) ** 2, 0), sst = y.reduce((a, v) => a + (v - my) ** 2, 0)
  return { beta, sd: Math.sqrt(ssr / Math.max(1, y.length - k)), r2: 1 - ssr / sst }
}
const effortPts = kept.filter((n) => n.status === "achieved" && n._effort?.py > 0 && n._effort.work === "research" && n._date.at >= EFFORT_FROM)
const effortFit = (() => {
  if (effortPts.length < 10) return null
  const f = ols(effortPts.map((n) => effortX(n._date.at, n.kind)), effortPts.map((n) => Math.log10(n._effort.py)))
  return {
    n: effortPts.length, beta: f.beta, sd: f.sd, r2: f.r2, fold: 10 ** f.beta[1],
    kinds: KIND_GROUPS.map(([name, ks], i) => ({ name, kinds: ks, n: effortPts.filter((x) => kindGroup(x.kind) === i).length, shift: i ? f.beta[i + 1] : 0 })),
  }
})()
const costPts = kept.filter((n) => n.status === "achieved" && n._effort?.cost > 0 && n._effort.work === "research" && n._date.at >= 1900)
const costFit = (() => {
  const pts = costPts.map((n) => [(n._date.at - 1900) / 100, Math.log10(n._effort.cost)])
  if (pts.length < 10) return null
  const f = fitTime(pts, false)
  return { n: pts.length, slope: f.slope, intercept: f.intercept, sd: f.sd, r2: f.r2, fold: 10 ** f.slope }
})()
// Bigger efforts take longer, but not in proportion: years ~ person-years^b.
const spanFit = (() => {
  const pts = effortPts.filter((n) => n._effort.years && n._effort.people).map((n) => [Math.log10(n._effort.py), Math.log10(n._effort.years)])
  if (pts.length < 10) return null
  const f = fitTime(pts, false)
  return { n: pts.length, exponent: f.slope, intercept: f.intercept, r2: f.r2 }
})()
const effortExpected = (year, kind) => effortX(year, kind).reduce((a, v, i) => a + v * effortFit.beta[i], 0)

// Time after prerequisites: how long after the last thing it needed was in
// place each technology came, by era. Only direct prerequisites that are
// technologies count (not resources or preconditions).
const LAG_ERAS = [[-10000, 1500], [1500, 1800], [1800, 1900], [1900, 1950], [1950, 2000], [2000, NOW + 0.01]]
const techPrereqs = (ids) => ids.map((id) => live.get(id)).filter((p) => p.kind !== "resource" && p.kind !== "precondition")
const lagOf = (n) => {
  const ps = techPrereqs(n._requires)
  if (!ps.length) return null
  return Math.max(0, n._date.at - Math.max(...ps.map((p) => p._date.at)))
}
const lagRows = kept.filter((n) => n.status === "achieved" && n.kind !== "milestone" && n.kind !== "resource" && n.kind !== "precondition" && n._date.at >= LAG_ERAS[0][0]).map((n) => ({ n, lag: lagOf(n) })).filter((x) => x.lag != null)
const lagModel = {
  eras: LAG_ERAS.map(([a, b]) => {
    const lags = lagRows.filter((x) => x.n._date.at >= a && x.n._date.at < b).map((x) => x.lag)
    return { from: a, to: Math.min(b, Math.round(NOW)), n: lags.length, q25: quantile(lags, 0.25), q50: quantile(lags, 0.5), q75: quantile(lags, 0.75) }
  }),
}
// The future: from when every prerequisite should be in place (the
// earliest route, if it has routes), plus the lags seen since 1950. Lags
// from recent decades are cut short (only the fast ones have happened
// yet), so these lean early.
const recentLags = lagRows.filter((x) => x.n._date.at >= 1950).map((x) => x.lag)
lagModel.basis = { from: 1950, n: recentLags.length, q25: quantile(recentLags, 0.25), q50: quantile(recentLags, 0.5), q75: quantile(recentLags, 0.75) }
// Something whose prerequisites are already in place has already waited
// that long, so the lags it could still have are the longer ones: the
// quantiles come from the lags at least that long (at least 20 of them).
const condLag = (waited) => {
  const sorted = [...recentLags].sort((a, b) => a - b)
  let longer = sorted.filter((x) => x >= waited)
  if (longer.length < 20) longer = sorted.slice(-20)
  return [0.25, 0.5, 0.75].map((q) => Math.max(waited, quantile(longer, q)))
}
for (const n of kept) {
  // Milestones are dated from their metrics instead.
  if ((n.status !== "ongoing" && n.status !== "speculative") || n.kind === "milestone") continue
  const readyOf = (ids) => Math.max(...techPrereqs(ids).map((p) => p._date.at), -Infinity)
  const base = n._requires
  if (!techPrereqs(base).length && !n._routes.length) continue
  const last = n._routes.length ? Math.min(...n._routes.map((r) => readyOf([...base, ...r.requires]))) : readyOf(base)
  if (!Number.isFinite(last)) continue
  const waited = Math.max(0, NOW - last)
  const [q25, q50, q75] = condLag(waited)
  n._prereqModel = { ready: Math.max(NOW, last), last, waited, q25: last + q25, q50: last + q50, q75: last + q75 }
}

// Effort-based estimates for what's not done yet. Treat the person-years a
// breakthrough needs as log-normal, centered on the trend above for today
// and as wide as its scatter. Something that has already had S
// person-years without success must need more than S; given that, the
// remaining effort divided by the people on it now (growing at `growth` a
// year, if given) is the time left.
function normCdfUpper(z) {
  // Upper tail Q(z), accurate far into the tail (W. J. Cody's erfc).
  const t = 1 / (1 + 0.5 * Math.abs(z / Math.SQRT2))
  const y = t * Math.exp(-((z / Math.SQRT2) ** 2) - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  const erfc = z >= 0 ? y : 2 - y
  return erfc / 2
}
function normInvUpper(q) {
  // z with Q(z) = q (Acklam's rational approximation of the inverse).
  const p = 1 - q
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const tail = (r) => (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1)
  if (q < 0.02425) return -tail(Math.sqrt(-2 * Math.log(q)))
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)))
  const r = (p - 0.5) ** 2
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * (p - 0.5)) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}
for (const n of kept) {
  const e = n._effort
  if (!e?.open || !effortFit || !e.people) continue
  const spent = e.py ?? 0
  const mu = effortExpected(NOW, n.kind), sd = effortFit.sd
  const zS = spent > 0 ? (Math.log10(spent) - mu) / sd : -Infinity
  const qS = spent > 0 ? normCdfUpper(zS) : 1
  const g = Number(n.effort.growth) || 0
  const yearsFor = (rest) => (g > 0 ? Math.log(1 + (rest * Math.log(1 + g)) / e.people) / Math.log(1 + g) : rest / e.people)
  const at = (q) => {
    // The q-th quantile of the total, given it's more than what's spent.
    const total = 10 ** (mu + sd * normInvUpper(qS * (1 - q)))
    return Math.max(NOW + yearsFor(Math.max(0, total - spent)), n._prereqModel?.ready ?? NOW)
  }
  n._effortModel = { spent, people: e.people, growth: g, past: qS, q10: at(0.1), q50: at(0.5), q90: at(0.9) }
}

// Forecasts: outside forecasts, the trends, the tree simulated, and the
// pool (forecast.mjs). The year each forecast path on a milestone's metric
// crosses its threshold comes first.
for (const n of kept) {
  if (!n.threshold || n.status === "achieved") continue
  const line = lineFor(metricById.get(n.threshold.metric), n.threshold.series)
  if (line?.scenarios.length) n._scenarioYears = new Map(line.scenarios.map((sc) => [sc.id, pathCrossing(line, sc.points, Number(n.threshold.value))]))
}
const forecastsYaml = fs.existsSync(path.join(HERE, "forecasts.yaml")) ? readYaml(path.join(HERE, "forecasts.yaml")) : {}
const accelYaml = fs.existsSync(path.join(HERE, "acceleration.yaml")) ? readYaml(path.join(HERE, "acceleration.yaml")) : {}
const fc = forecasting({ NOW, kept, live, warn, techPrereqs, recentLags, metricById, lineFor, accel: accelYaml, forecastsYaml })
for (const m of metricsOut) for (const line of m.series ?? [m]) if (line.trend && fc.bands.has(line)) line.trend.band = fc.bands.get(line)

// Supply risk for each resource with supply data, from four parts (each
// 0 to 1), averaged with weights over the parts that are known:
//   concentration (0.45): the HHI of the most concentrated stage, mining
//     or processing, over the producers listed (so a lower bound); 0.5 or
//     more (two countries with half each) counts as fully concentrated;
//   depletion (0.2): reserves over production, 100 years or more is 0,
//     10 years or less is 1;
//   recycling (0.15): the end-of-life recycling rate, from over 50% (0.2)
//     to under 1% (1);
//   demand growth (0.2): demand in 2040 over today's (IEA), fivefold or
//     more is 1.
// Ratings: under 0.3 low, under 0.45 moderate, under 0.6 high, else very
// high. A resource can give its own `risk` (a judgment) instead.
const RECYCLING = { ">50%": 0.2, "25-50%": 0.4, "10-25%": 0.6, "1-10%": 0.8, "<1%": 1 }
const RATINGS = ["low", "moderate", "high", "very high"]
const ratingOf = (score) => RATINGS[score < 0.3 ? 0 : score < 0.45 ? 1 : score < 0.6 ? 2 : 3]
const hhi = (producers) => (producers?.length ? producers.reduce((a, [, share]) => a + (Number(share) / 100) ** 2, 0) : null)
for (const n of kept) {
  const s = n.supply
  if (!s) continue
  const where = `supply.yaml: ${n.id}`
  const prod = Number(s.production?.value), res = Number(s.reserves?.value)
  if (s.reserves && s.production && s.reserves.unit !== s.production.unit) warn(`${where}: reserves and production in different units`)
  const rp = prod > 0 && res > 0 && s.reserves.unit === s.production.unit ? res / prod : null
  const mine = hhi(s.producers), proc = hhi(s.processing?.producers)
  const conc = mine == null && proc == null ? null : Math.min(1, Math.max(mine ?? 0, proc ?? 0) / 0.5)
  const depl = rp == null ? null : Math.min(1, Math.max(0, Math.log10(100 / rp)))
  if (s.recycling != null && !(s.recycling in RECYCLING)) warn(`${where}: recycling should be one of ${Object.keys(RECYCLING).join(", ")}`)
  const rec = RECYCLING[s.recycling] ?? null
  const grow = s.demand_2040 ? Math.min(1, Math.max(0, Math.log(Number(s.demand_2040)) / Math.log(5))) : null
  const parts = [["concentration", conc, 0.45], ["depletion", depl, 0.2], ["recycling", rec, 0.15], ["demand growth", grow, 0.2]].filter(([, v]) => v != null)
  const w = parts.reduce((a, [, , wt]) => a + wt, 0)
  const score = w ? parts.reduce((a, [, v, wt]) => a + v * wt, 0) / w : null
  if (s.risk && !RATINGS.includes(s.risk.rating)) warn(`${where}: risk rating should be one of ${RATINGS.join(", ")}`)
  const rating = s.risk?.rating ?? (score == null ? null : ratingOf(score))
  if (!rating) continue
  n._supply = { rp, hhi: mine, procHhi: proc, parts: Object.fromEntries(parts.map(([k, v]) => [k, v])), score, rating, judged: !!s.risk }
}
// A technology's supply risk is that of the riskiest resource it uses.
const useOf = new Map(resourceUse.map((u) => [`${u.resource}>${u.tech}`, u]))
for (const n of kept) {
  if (n.kind === "resource") continue
  const used = n._requires.map((id) => live.get(id)).filter((p) => p._supply)
  if (!used.length) continue
  const worst = used.reduce((a, p) => (RATINGS.indexOf(p._supply.rating) > RATINGS.indexOf(a._supply.rating) || (p._supply.rating === a._supply.rating && (p._supply.score ?? 0) > (a._supply.score ?? 0)) ? p : a))
  n._risk = { rating: worst._supply.rating, resource: worst.id }
}

// ------------------------------------------------------------------ rank

// Importance decides what shows when zoomed out: landmarks first, then by
// tier, and within a tier by how much depends on it (everything downstream).
const childrenOf = new Map(kept.map((n) => [n.id, []]))
for (const n of kept) for (const id of n._all) childrenOf.get(id).push(n.id)
const downstream = new Map()
for (const n of kept) {
  const seen = new Set()
  const stack = [...childrenOf.get(n.id)]
  while (stack.length) {
    const id = stack.pop()
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...childrenOf.get(id))
  }
  downstream.set(n.id, seen.size)
}
const ranked = [...kept].sort((a, b) => a.tier - b.tier || downstream.get(b.id) - downstream.get(a.id) || a._date.at - b._date.at)
const N1 = kept.filter((n) => n.tier === 1).length
// A node of rank r shows from zoom ((r + 1) / N1) ^ (1 / P): N1 nodes at
// zoom 1, and all of them by FULL_ZOOM.
const P = Math.log(kept.length / N1) / Math.log(FULL_ZOOM)
ranked.forEach((n, r) => {
  n._rank = r
  n._z = Math.max(1, ((r + 1) / N1) ** (1 / P))
})

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
const uMax = Math.max(timeU(2100), timeU(Math.min(2300, Math.max(...years)))) + 0.06
// World units are screen pixels at the starting zoom on a typical desktop
// (about 1,150 by 860 of map), so the spacing below is real spacing.
const WIDTH = 1150
const xOf = (year) => ((timeU(year) - uMin) / (uMax - uMin)) * WIDTH

// Lanes: one per field, from abstract to applied, with the roots below.
// Lanes get height in proportion to the square root of how many nodes
// they hold, with a floor, so busy fields have room without empty ones
// vanishing; tracks share their lane's height the same way.
const allFields = [...FIELDS, ROOTS]
const TOTAL_HEIGHT = 860
const lanes = []
{
  const count = (pred) => kept.filter(pred).length
  const weight = (c) => Math.sqrt(c + 1)
  const inLane = (f) => (n) => (n.lane ?? n.fields[0]) === f.id
  const laneCount = (f) => count(inLane(f))
  const sum = allFields.reduce((a, f) => a + weight(laneCount(f)), 0)
  let y = 0
  for (const f of allFields) {
    const c = laneCount(f)
    const h = Math.max(34, (TOTAL_HEIGHT * weight(c)) / sum)
    const tracks = f.tracks.map(([id, name]) => ({ id, name, count: count((n) => n._track === id) })).filter((t) => t.count)
    const tsum = tracks.reduce((a, t) => a + weight(t.count), 0)
    let ty = y
    for (const t of tracks) {
      t.y0 = ty
      t.y1 = ty + (h * weight(t.count)) / tsum
      ty = t.y1
    }
    lanes.push({ id: f.id, name: f.name, color: f.color, y0: y, y1: y + h, count: c, tracks })
    y += h
  }
}
const trackById = new Map(lanes.flatMap((l) => l.tracks.map((t) => [t.id, { ...t, lane: l }])))
const HEIGHT = lanes.at(-1).y1

// Place nodes so none overlap at the zoom where they first appear, in
// order of importance, each inside its own track. Where a track is too
// crowded for a node at its zoom, it appears a little later instead (up to
// half again for landmarks, twice for the rest); failing that, it takes
// the clearest spot in its track.
const RADIUS = { 1: 7.5, 2: 5.5, 3: 4.2 } // on screen, as the app draws them
const placed = []
let bumped = 0
for (const n of ranked) {
  const t = trackById.get(n._track)
  n._x = xOf(n._date.at)
  // What a node takes up across: itself, plus its date range's bar.
  n._xa = Math.min(n._x, xOf(n._date.from))
  n._xb = Math.max(n._x, xOf(n._date.to))
  const r = RADIUS[n.tier]
  const mid = (t.y0 + t.y1) / 2
  const apart = (p) => Math.max(0, p._xa - n._xb, n._xa - p._xb)
  const near = placed.filter((p) => apart(p) < r + RADIUS[p.tier] + 4)
  // How clear y is at zoom s: 1 or more means it overlaps nothing, bars
  // included, so overlapping windows sit on separate lines.
  const clearance = (y, s) => near.reduce((c, p) => {
    const z = Math.max(s, p._z)
    const gx = (r + RADIUS[p.tier] + 4) / z, gy = (r + RADIUS[p.tier] + 2.5) / z
    return Math.min(c, Math.max(apart(p) / gx, Math.abs(p._y - y) / gy))
  }, Infinity)
  // A little jitter, the same on every build (from the id), so a track's
  // nodes don't all sit on its center line.
  let hash = 0
  for (const ch of n.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const jitter = ((hash % 1000) / 1000 - 0.5) * 0.7
  const candidates = (s) => {
    const step = (2 * r + 2.5) / s / 3
    const room = Math.max(0, (t.y1 - t.y0) / 2 - Math.min(r / s, (t.y1 - t.y0) / 4))
    const start = mid + jitter * room
    const out = [start]
    for (let i = 1; i * step <= 2 * room; i++) for (const c of [start - i * step, start + i * step]) if (Math.abs(c - mid) <= room) out.push(c)
    return out
  }
  const limit = n._z * (n.tier === 1 ? 1.5 : 2)
  let y = null, s = n._z
  for (; s <= limit; s *= 1.08) {
    y = candidates(s).find((c) => clearance(c, s) >= 1) ?? null
    if (y != null) break
  }
  if (y == null) {
    s = n._z
    let best = -1
    for (const c of candidates(s)) {
      const cl = clearance(c, s)
      if (cl > best) { best = cl; y = c }
    }
  }
  if (s > n._z * 1.01) bumped++
  n._z = s
  n._y = y
  placed.push(n)
}

// ----------------------------------------------------------------- links

const kindOf = (id) => (live.get(id).kind === "resource" ? "uses" : "requires")
const edges = []
for (const n of kept) {
  for (const s of n._all) {
    const routes = n._routes.map((r, i) => (r.requires.includes(s) && !n._requires.includes(s) ? i : -1)).filter((i) => i >= 0)
    edges.push({ s, t: n.id, kind: kindOf(s), ...(routes.length ? { routes } : {}) })
  }
  for (const s of n._helped) edges.push({ s, t: n.id, kind: "helped" })
}
const rivals = new Set()
for (const n of kept)
  for (const s of n._competes) {
    const key = [s, n.id].sort().join("!")
    if (!rivals.has(key)) edges.push({ s, t: n.id, kind: "competes" })
    rivals.add(key)
  }

// ----------------------------------------------------------------- write

// tree.json has what the first view needs; details.json (the text,
// efforts and sources) loads after it.
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d
const mapVals = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? f(v) : v]))
const out = {
  meta: {
    built: new Date().toISOString().slice(0, 10), now: NOW,
    width: WIDTH, height: HEIGHT,
    time: { tau: TAU, deep: DEEP, futureGain: FUTURE_GAIN, uMin, uMax },
    reveal: { p: P, fullZoom: FULL_ZOOM },
  },
  fields: FIELDS.map(({ tracks, ...f }) => f), roots: (({ tracks, ...f }) => f)(ROOTS),
  lanes: lanes.map((l) => ({ ...l, tracks: l.tracks.map((t) => ({ ...t, y0: round(t.y0), y1: round(t.y1) })) })),
  nodes: ranked.map((n) => ({
    id: n.id, name: era(n.name), kind: n.kind, fields: n.fields, status: n.status, tier: n.tier,
    from: n._date.from, to: n._date.to, at: round(n._date.at, 2),
    x: round(n._x), y: round(n._y), z: round(n._z, 2), lane: (n.lane ?? n.fields[0]), track: n._track,
    ...(n.metric ? { metric: n.metric } : {}),
    ...(n.threshold ? { threshold: { metric: n.threshold.metric, value: Number(n.threshold.value), label: n.threshold.label, ...(n.threshold.series ? { series: n.threshold.series } : {}) } } : {}),
    ...(n._trend && !n._trend.crossed ? { trendYear: round(n._trend.year) } : {}),
    ...(() => {
      if (!n.threshold || n.status === "achieved") return {}
      const line = lineFor(metricById.get(n.threshold.metric), n.threshold.series)
      if (!line?.scenarios.length) return {}
      return { scenarioYears: line.scenarios.map((sc) => ({ id: sc.id, year: (() => { const y = pathCrossing(line, sc.points, Number(n.threshold.value)); return y == null ? null : round(y) })() })) }
    })(),
    ...(n._routes.length ? { routes: n._routes.map((r) => r.name) } : {}),
    ...(n._effort?.py ? { py: round(Math.log10(n._effort.py), 2) } : {}),
    ...(n._checklist ? { steps: [n._checklist.filter((c) => c.done != null).length, n._checklist.length] } : {}),
    ...(fc.results.get(n.id)?.flag ? { flag: fc.results.get(n.id).flag } : {}),
    ...(n._supply ? { risk: n._supply.rating } : n._risk ? { risk: n._risk.rating } : {}),
  })),
  edges,
  metrics: metricsOut,
  models: {
    effort: effortFit && { ...effortFit, from: EFFORT_FROM },
    cost: costFit && { ...costFit, from: 1900 },
    span: spanFit,
    lag: lagModel,
    forecasting: {
      levels: LEVELS, weights: WEIGHTS, slip: SLIP, slipHigh: SLIP_HIGH, draws: fc.draws, backtest: fc.backtest,
      work: fc.work, mechanisms: fc.mechanisms.map(({ id, name, from, work, speedup, ramp, only, note, sources }) => ({ id, name, from, work, speedup, ramp, ...(only ? { only } : {}), note, sources })),
    },
  },
}
// Years in the text read BC and AD (the data may say BCE and CE). Source
// titles are left as published.
function era(str) {
  return str.replace(/(\d[\d,]*)\s*BCE\b/g, "$1 BC").replace(/\b(\d[\d,]*)\s*CE\b/g, "AD $1")
}
const eraDeep = (v, key = "") => {
  if (key === "sources" || key === "source") return v
  if (typeof v === "string") return era(v)
  if (Array.isArray(v)) return v.map((x) => eraDeep(x))
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, eraDeep(x, k)]))
  return v
}
const details = Object.fromEntries(kept.map((n) => [n.id, eraDeep({
  date: n.date, summary: n.summary, criterion: n.criterion, efforts: n.efforts, effort: n.effort, forecast: n.forecast, lost: n.lost,
  scarcity: n.scarcity, note: n.note, sources: n.sources,
  ...(n._routes.length ? { routes: n._routes.map((r) => ({ name: r.name, note: r.note, requires: r.requires })) } : {}),
  ...(n._effort ? { effortCalc: { years: n._effort.years, people: n._effort.people, py: n._effort.py, work: n._effort.work, rough: n._effort.rough, ...(n._effort.py && !n._effort.open && n._effort.work === "research" && n._date.at >= EFFORT_FROM && effortFit ? { vsTrend: round(Math.log10(n._effort.py) - effortExpected(n._date.at, n.kind), 2) } : {}) } } : {}),
  ...(n._prereqModel ? { prereqModel: mapVals(n._prereqModel, (v) => round(v)) } : {}),
  ...(n._effortModel ? { effortModel: mapVals(n._effortModel, (v) => round(v, 3)) } : {}),
  ...(() => {
    const r = fc.results.get(n.id)
    if (!r) return {}
    const ys = (q) => q.map((v) => (Number.isFinite(v) ? round(v) : null))
    return { pool: {
      judged: ys(r.judged), pooled: ys(r.pooled), flag: r.flag, outsideOnly: r.outsideOnly,
      inputs: r.inputs.map((i) => ({ ...i, weight: round(i.weight, 2), q: ys(i.q) })),
      sim: { outside: ys(r.sim.outside), base: ys(r.sim.base), judged: ys(r.sim.judged), ...(r.sim.early ? { early: true } : {}) },
      ...(r.cond ? { cond: mapVals(r.cond, (v) => round(v, 2)) } : {}),
      ...(r.accel ? { accel: { shares: mapVals(r.accel.shares, (v) => round(v, 2)), by: r.accel.by } } : {}),
    } }
  })(),
  ...(n.supply ? { supply: n.supply, supplyCalc: n._supply } : {}),
  ...(n._risk ? { risk: n._risk } : {}),
  ...(n._checklist ? { checklist: n._checklist } : {}),
  ...(n.also_helps ? { alsoHelps: list(n.also_helps) } : {}),
  ...(() => {
    // Resource use, from either end.
    const ofTech = n.kind === "resource" ? [] : n._requires.filter((id) => live.get(id).kind === "resource").map((id) => ({ resource: id, ...(useOf.get(`${id}>${n.id}`) ?? {}) }))
    const ofRes = n.kind === "resource" ? kept.filter((t) => t._requires.includes(n.id)).map((t) => ({ tech: t.id, ...(useOf.get(`${n.id}>${t.id}`) ?? {}) })) : []
    const clean = (u) => { const { tech, resource, ...rest } = u; return { ...(tech ? { tech } : {}), ...(resource ? { resource } : {}), ...rest } }
    return ofTech.length ? { resourceUse: ofTech.map(clean) } : ofRes.length ? { usedBy: ofRes.map(clean) } : {}
  })(),
})]))
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "tree.json"), JSON.stringify(out, (k, v) => (k.startsWith("_") ? undefined : v)))
fs.writeFileSync(path.join(OUT, "details.json"), JSON.stringify(details))

const by = (key) => Object.entries(kept.reduce((m, n) => ({ ...m, [n[key]]: (m[n[key]] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ")
const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)
console.log(`${kept.length} nodes (${by("kind")}); tiers ${by("tier")}; status ${by("status")}`)
console.log(`${bumped} nodes show later than their rank, to fit their tracks`)
console.log(`${edges.length} links; ${metricsOut.length} metrics; tree.json ${kb("tree.json")} KB, details.json ${kb("details.json")} KB`)
for (const m of metricsOut.flatMap((m) => (m.series ? m.series.map((sr) => ({ ...m, ...sr, id: `${m.id} (${sr.id})` })) : [m]))) if (m.trend) console.log(`  ${m.id}: ${m.trend.linear ? `${m.trend.slope > 0 ? "rises" : "falls"} ${Math.abs(m.trend.slope * 10).toPrecision(2)} ${m.unit} a decade` : `${m.trend.slope < 0 ? "halves" : "doubles"} every ${m.trend.years.toFixed(2)} years`} (r² ${m.trend.r2.toFixed(2)})${m.wright ? `; learning rate ${(m.wright.learningRate * 100).toFixed(0)}%` : ""}`)
if (effortFit) console.log(`effort: ${effortFit.n} research efforts since ${EFFORT_FROM}; person-years grow ${effortFit.fold.toFixed(1)}x a century; by kind ${effortFit.kinds.map((k) => `${k.name} x${(10 ** k.shift).toFixed(0)} (n ${k.n})`).join(", ")} (r² ${effortFit.r2.toFixed(2)}, scatter ${effortFit.sd.toFixed(2)} orders of magnitude)${costFit ? `; cost ${costFit.fold.toFixed(1)}x a century since 1900 (n ${costFit.n})` : ""}${spanFit ? `; years ~ person-years^${spanFit.exponent.toFixed(2)}` : ""}`)
console.log(`lag after prerequisites (median years): ${lagModel.eras.map((e) => `${e.from}-${e.to} ${e.q50 == null ? "-" : round(e.q50)} (n ${e.n})`).join(", ")}`)
console.log(`supply risk: ${kept.filter((n) => n._supply).map((n) => `${n.id.replace(/^res-/, "")} ${n._supply.rating}${n._supply.score != null ? ` ${n._supply.score.toFixed(2)}` : ""}`).join(", ")}`)
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ` + warnings.slice(0, 80).join("\n  ") + (warnings.length > 80 ? `\n  ... and ${warnings.length - 80} more` : ""))
