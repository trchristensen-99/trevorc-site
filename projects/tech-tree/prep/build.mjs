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
  let trend = fitTime(fitPts, m.log !== false)
  if (trend && trend.r2 < 0.5) {
    warn(`metric ${m.id}: trend fits poorly (r² ${trend.r2.toFixed(2)}), not shown`)
    trend = null
  }
  const cumulative = m.cumulative && metrics.find((x) => x.id === m.cumulative)
  const wright = cumulative ? fitWright({ points }, { points: cumulative.points.map(([x, y]) => [Number(x), Number(y)]) }) : null
  return {
    id: m.id, name: m.name, short: m.short ?? m.name, unit: m.unit, better: m.better ?? "higher", log: m.log !== false, points,
    trend, wright, source: m.source, license: m.license, note: m.note, field: m.field, milestones: [],
  }
})
const metricById = new Map(metricsOut.map((m) => [m.id, m]))

// Milestones: a threshold on a metric ("a genome for under $1,000"). When
// the data has crossed it, the date is the first year it did; otherwise the
// trend carried forward gives a year, with a window from the scatter around
// the trend (wider on the late side, since trends slow more often than they
// speed up). A milestone's own `date` wins, but the trend's year is kept to
// show alongside it.
function crossing(m, value) {
  const beats = (y) => (m.better === "lower" ? y <= value : y >= value)
  const hit = m.points.find(([, y]) => beats(y))
  if (hit) return { year: hit[0], crossed: true }
  if (!m.trend || (m.better === "lower") !== (m.trend.slope < 0)) return null
  const year = ((m.log ? Math.log10(value) : value) - m.trend.intercept) / m.trend.slope
  const spread = Math.max(1, (1.5 * m.trend.sd) / Math.abs(m.trend.slope))
  return { year, from: year - spread, to: year + 2 * spread, crossed: false }
}

// ----------------------------------------------------------------- check

const fieldIds = new Set(FIELDS.map((f) => f.id))
const trackField = new Map([...FIELDS, ROOTS].flatMap((f) => f.tracks.map(([t]) => [t, f.id])))
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
  if (n.threshold) {
    const m = metricById.get(n.threshold.metric)
    if (!m) { warn(`${where}: threshold on unknown metric ${n.threshold.metric}`); delete n.threshold }
    else {
      const c = crossing(m, Number(n.threshold.value))
      if (c) n._trend = c
      if (n.date == null && c) n.date = c.crossed ? Math.round(c.year) : { window: [Math.floor(c.from), Math.ceil(c.to)], likely: Math.round(c.year) }
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
  const r = RADIUS[n.tier]
  const mid = (t.y0 + t.y1) / 2
  const near = placed.filter((p) => Math.abs(p._x - n._x) < r + RADIUS[p.tier] + 4)
  // How clear y is at zoom s: 1 or more means it overlaps nothing.
  const clearance = (y, s) => near.reduce((c, p) => {
    const z = Math.max(s, p._z)
    const gx = (r + RADIUS[p.tier] + 4) / z, gy = (r + RADIUS[p.tier] + 2.5) / z
    return Math.min(c, Math.max(Math.abs(p._x - n._x) / gx, Math.abs(p._y - y) / gy))
  }, Infinity)
  const candidates = (s) => {
    const step = (2 * r + 2.5) / s / 3
    const room = Math.max(0, (t.y1 - t.y0) / 2 - Math.min(r / s, (t.y1 - t.y0) / 4))
    const out = [mid]
    for (let i = 1; i * step <= room; i++) out.push(mid - i * step, mid + i * step)
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
    id: n.id, name: n.name, kind: n.kind, fields: n.fields, status: n.status, tier: n.tier,
    from: n._date.from, to: n._date.to, at: round(n._date.at, 2),
    x: round(n._x), y: round(n._y), z: round(n._z, 2), lane: (n.lane ?? n.fields[0]), track: n._track,
    ...(n.metric ? { metric: n.metric } : {}),
    ...(n.threshold ? { threshold: { metric: n.threshold.metric, value: Number(n.threshold.value), label: n.threshold.label } } : {}),
    ...(n._trend && !n._trend.crossed ? { trendYear: round(n._trend.year) } : {}),
    ...(n._routes.length ? { routes: n._routes.map((r) => r.name) } : {}),
  })),
  edges,
  metrics: metricsOut,
}
const details = Object.fromEntries(kept.map((n) => [n.id, {
  date: n.date, summary: n.summary, criterion: n.criterion, efforts: n.efforts, effort: n.effort, forecast: n.forecast, lost: n.lost,
  scarcity: n.scarcity, note: n.note, sources: n.sources,
  ...(n._routes.length ? { routes: n._routes.map((r) => ({ name: r.name, note: r.note, requires: r.requires })) } : {}),
}]))
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "tree.json"), JSON.stringify(out))
fs.writeFileSync(path.join(OUT, "details.json"), JSON.stringify(details))

const by = (key) => Object.entries(kept.reduce((m, n) => ({ ...m, [n[key]]: (m[n[key]] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ")
const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)
console.log(`${kept.length} nodes (${by("kind")}); tiers ${by("tier")}; status ${by("status")}`)
console.log(`${bumped} nodes show later than their rank, to fit their tracks`)
console.log(`${edges.length} links; ${metricsOut.length} metrics; tree.json ${kb("tree.json")} KB, details.json ${kb("details.json")} KB`)
for (const m of metricsOut) if (m.trend) console.log(`  ${m.id}: ${m.trend.linear ? `${m.trend.slope > 0 ? "rises" : "falls"} ${Math.abs(m.trend.slope * 10).toPrecision(2)} ${m.unit} a decade` : `${m.trend.slope < 0 ? "halves" : "doubles"} every ${m.trend.years.toFixed(2)} years`} (r² ${m.trend.r2.toFixed(2)})${m.wright ? `; learning rate ${(m.wright.learningRate * 100).toFixed(0)}%` : ""}`)
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ` + warnings.slice(0, 80).join("\n  ") + (warnings.length > 80 ? `\n  ... and ${warnings.length - 80} more` : ""))
