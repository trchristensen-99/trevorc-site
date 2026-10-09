// Builds the De Facto World Map data in ../data from Natural Earth plus the
// curated files in this directory:
//
//   entities.json  who can control territory (beyond Natural Earth's list)
//   areas.json     where control differs from Natural Earth's base map
//   claims.json    territory claimed by someone who doesn't control it
//   presence.json  insurgent presence short of control
//   bases.json     Antarctic stations missing from the COMNAP list
//   palette.json   identity colors
//
// Usage (from this directory): npm install && npm run fetch && npm run build

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import * as turf from "@turf/turf"
import polylabel from "polylabel"
import { converter, differenceCiede2000, formatHex, clampChroma } from "culori"
import { feature as topoFeature, neighbors as topoNeighbors } from "topojson-client"

const HERE = path.dirname(new URL(import.meta.url).pathname)
const RAW = path.join(HERE, "raw")
const TMP = path.join(RAW, "tmp")
const OUT = path.join(HERE, "..", "data")
const MAPSHAPER = path.join(HERE, "node_modules", ".bin", "mapshaper")
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"))
const curated = (name) => readJson(path.join(HERE, name))
const ne = (name) => readJson(path.join(RAW, "ne", `${name}.geojson`)).features

const countries = ne("admin_0_countries")
const disputed = ne("admin_0_disputed_areas")
const admin1 = ne("admin_1_states_provinces")
const antarcticClaims = ne("admin_0_antarctic_claims")

const palette = curated("palette.json")
const entitiesIn = curated("entities.json")
const areasIn = curated("areas.json")
const claimsIn = curated("claims.json")
const presenceIn = curated("presence.json")
const basesIn = curated("bases.json")

const warnings = []
const warn = (msg) => warnings.push(msg)

// ---------------------------------------------------------------------------
// Entities: every sovereign state, dependency, de facto state, and armed
// group that the map can color. Natural Earth supplies the recognized ones;
// entities.json adds the rest and overrides names or kinds.

// Natural Earth's sovereign codes, mapped to the entity a dependency
// inherits its color from.
const SOV_TO_ENTITY = {
  GB1: "GBR", US1: "USA", FR1: "FRA", AU1: "AUS", NZ1: "NZL", DN1: "DNK", NL1: "NLD",
  FI1: "FIN", CH1: "CHN", IS1: "ISR", CU1: "CUB", KA1: "KAZ",
}
const entities = {}
for (const f of countries) {
  const p = f.properties
  const parent = SOV_TO_ENTITY[p.SOV_A3]
  const isDependency = parent && parent !== p.ADM0_A3
  entities[p.ADM0_A3] = {
    name: p.NAME_LONG || p.NAME_EN || p.NAME,
    short: p.NAME,
    formal: p.FORMAL_EN || undefined,
    kind: isDependency ? "dependency" : "state",
    parent: isDependency ? parent : undefined,
  }
}
for (const [id, e] of Object.entries(entitiesIn.entities)) {
  entities[id] = { ...(entities[id] ?? {}), ...e }
}
for (const id of entitiesIn.remove ?? []) delete entities[id]

// ---------------------------------------------------------------------------
// Geometry recipes. areas/claims/presence describe shapes declaratively so
// every polygon traces back to a named source:
//   {"ne_country": "SAH"}                        Natural Earth country
//   {"ne_disputed": "B35"}                       Natural Earth disputed area
//   {"ne_admin1": ["UA-43", ...]}                Natural Earth provinces (ISO 3166-2)
//   {"file": "zones/x.geojson"}                  hand-drawn, sourced polygon
//   {"polygon": [[lon, lat], ...]}               small hand-drawn polygon
//   {"gb": {"set": "YEM-ADM2", "names": [...], "within": ["YE-SD"], "except": [...]}}
//        geoBoundaries units by name, or whose interior point falls in the
//        given Natural Earth provinces, minus exceptions
//   {"reference_units": {"set": "UKR-ADM3", "reference": "deepstate:occupied", "threshold": 0.5}}
//        units mostly inside a reference map (the reference itself isn't shipped)
//   {"area": "ukraine-occupied"}                 the final shape of an area above
//   {"union": [r, ...]}  {"minus": [r, r, ...]}  {"intersect": [r, r]}

const asFeature = (g) => (g.type === "Feature" ? g : turf.feature(g))
const unionAll = (fs_) => {
  const parts = fs_.filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return turf.union(turf.featureCollection(parts))
}

// geoBoundaries sets, loaded on first use.
const gbCache = {}
const areaShapes = {}
const gbSet = (name) =>
  (gbCache[name] ??= readJson(path.join(RAW, "gb", `${name}.geojson`)).features.map((f) => ({ ...f, inner: turf.pointOnFeature(f) })))
const norm = (x) => x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

// Reference maps used only to decide which units are held by whom.
const refCache = {}
function reference(name) {
  if (refCache[name]) return refCache[name]
  if (name.startsWith("deepstate:")) {
    const wanted = {
      occupied: ["Окуповано", "ОРДЛО", "Окупований Крим", "Острів Тузла"],
      gray: ["Статус невідомий"],
    }[name.split(":")[1]]
    const snap = readJson(path.join(RAW, "deepstate", "last.json"))
    const polys = snap.map.features
      .filter((f) => f.geometry.type === "Polygon" && wanted.includes(f.properties.name.split("///")[0].trim()))
      .map((f) => turf.polygon(f.geometry.coordinates.map((ring) => ring.map((p) => p.slice(0, 2)))))
    refCache[name] = polys.map((p) => ({ p, bb: turf.bbox(p) }))
    return refCache[name]
  }
  throw new Error(`unknown reference ${name}`)
}
function insideRef(ref, pt) {
  const [x, y] = pt
  return ref.some(({ p, bb }) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && turf.booleanPointInPolygon(pt, p))
}
// Share of a unit inside the reference, from an 8x8 grid of sample points.
function shareInside(unit, ref) {
  const [x0, y0, x1, y1] = turf.bbox(unit)
  let inUnit = 0, inRef = 0
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      const pt = [x0 + ((i + 0.5) * (x1 - x0)) / 8, y0 + ((j + 0.5) * (y1 - y0)) / 8]
      if (!turf.booleanPointInPolygon(pt, unit)) continue
      inUnit++
      if (insideRef(ref, pt)) inRef++
    }
  if (inUnit === 0) return insideRef(ref, unit.inner.geometry.coordinates) ? 1 : 0
  return inRef / inUnit
}

// The Natural Earth province a unit belongs to. Coastal and island units
// can have their interior point just outside Natural Earth's coarser
// coastline, so those fall back to the nearest province.
const provinceCache = new WeakMap()
function provinceOf(u) {
  if (provinceCache.has(u)) return provinceCache.get(u)
  const pt = u.inner.geometry.coordinates
  const near = admin1.filter((f) => {
    const b = (f.bbox ??= turf.bbox(f))
    return pt[0] >= b[0] - 1 && pt[0] <= b[2] + 1 && pt[1] >= b[1] - 1 && pt[1] <= b[3] + 1
  })
  let best = near.find((f) => turf.booleanPointInPolygon(u.inner, f))
  if (!best) {
    let d = Infinity
    for (const f of near) {
      const x = turf.pointToPolygonDistance(u.inner, f)
      if (x < d) { d = x; best = f }
    }
  }
  const code = best?.properties.iso_3166_2
  provinceCache.set(u, code)
  return code
}

function resolve(r, where) {
  if (r.ne_country) {
    const hits = countries.filter((f) => f.properties.ADM0_A3 === r.ne_country)
    if (!hits.length) throw new Error(`${where}: no Natural Earth country ${r.ne_country}`)
    return unionAll(hits.map(asFeature))
  }
  if (r.ne_disputed) {
    const ids = [].concat(r.ne_disputed)
    const hits = disputed.filter((f) => ids.includes(f.properties.BRK_A3))
    if (hits.length === 0) throw new Error(`${where}: no Natural Earth disputed area ${ids}`)
    return unionAll(hits.map(asFeature))
  }
  if (r.ne_admin1) {
    const hits = admin1.filter((f) => r.ne_admin1.includes(f.properties.iso_3166_2))
    const found = new Set(hits.map((f) => f.properties.iso_3166_2))
    for (const code of r.ne_admin1) if (!found.has(code)) throw new Error(`${where}: no province ${code}`)
    return unionAll(hits.map(asFeature))
  }
  if (r.file) {
    const fc = readJson(path.join(HERE, r.file))
    return unionAll((fc.features ?? [fc]).map(asFeature))
  }
  if (r.polygon) return turf.polygon([r.polygon[0][0] === r.polygon.at(-1)[0] && r.polygon[0][1] === r.polygon.at(-1)[1] ? r.polygon : [...r.polygon, r.polygon[0]]])
  if (r.gb) {
    const { set, names = [], within = [], except = [] } = r.gb
    const units = gbSet(set)
    const wantNames = new Set(names.map(norm))
    const skip = new Set(except.map(norm))
    const found = new Set()
    const hits = units.filter((u) => {
      const n = norm(u.properties.shapeName)
      if (skip.has(n)) return false
      if (wantNames.has(n)) { found.add(n); return true }
      return within.length > 0 && within.includes(provinceOf(u))
    })
    for (const n of wantNames) if (!found.has(n)) throw new Error(`${where}: no ${set} unit named ${n}`)
    if (!hits.length) throw new Error(`${where}: no ${set} units selected`)
    return unionAll(hits.map(({ inner, ...f }) => f))
  }
  if (r.reference_units) {
    const { set, reference: refName, threshold = 0.5 } = r.reference_units
    const ref = reference(refName)
    const rb = turf.bbox(turf.featureCollection(ref.map((x) => x.p)))
    const units = gbSet(set).filter((u) => {
      const b = turf.bbox(u)
      return b[0] <= rb[2] && rb[0] <= b[2] && b[1] <= rb[3] && rb[1] <= b[3]
    })
    const hits = units.filter((u) => shareInside(u, ref) >= threshold)
    if (!hits.length) throw new Error(`${where}: no units inside ${refName}`)
    return unionAll(hits.map(({ inner, ...f }) => f))
  }
  if (r.area) {
    if (!areaShapes[r.area]) throw new Error(`${where}: area ${r.area} not built yet`)
    return areaShapes[r.area]
  }
  if (r.union) return unionAll(r.union.map((x) => resolve(x, where)))
  if (r.minus) {
    const [first, ...rest] = r.minus.map((x) => resolve(x, where))
    const cut = unionAll(rest)
    return cut ? turf.difference(turf.featureCollection([first, cut])) : first
  }
  if (r.intersect) {
    const [a, b] = r.intersect.map((x) => resolve(x, where))
    return turf.intersect(turf.featureCollection([a, b]))
  }
  throw new Error(`${where}: unknown geometry recipe ${JSON.stringify(r)}`)
}

// Carving an area out of a feature whose edges don't quite match leaves
// slivers; drop leftover parts under 0.05 km².
function dropSlivers(geom) {
  if (geom.type !== "MultiPolygon") return turf.area(geom) < 5e4 ? null : geom
  const parts = geom.coordinates.filter((c) => turf.area(turf.polygon(c)) >= 5e4)
  if (parts.length === 0) return null
  return parts.length === 1 ? { type: "Polygon", coordinates: parts[0] } : { type: "MultiPolygon", coordinates: parts }
}

const bboxOverlap = (a, b) => {
  const [a0, a1, a2, a3] = turf.bbox(a)
  const [b0, b1, b2, b3] = turf.bbox(b)
  return a0 <= b2 && b0 <= a2 && a1 <= b3 && b1 <= a3
}

// ---------------------------------------------------------------------------
// Control layer. Start from Natural Earth (whose policy is already to draw
// de facto borders), then carve each curated area out of whatever it
// overlaps and add it with its own controller.

const BASE = entitiesIn.base ?? {}
let control = countries.map((f) => {
  const id = f.properties.ADM0_A3
  const o = BASE[id] ?? {}
  return {
    type: "Feature",
    geometry: f.geometry,
    properties: { a: `ne-${id}`, c: o.c ?? id, k: o.k ?? (entities[id]?.kind === "dependency" ? "dependency" : "control") },
  }
})

// Remapped Natural Earth features keep their own name and an explanation.
const areaMeta = {}
for (const f of countries) {
  const id = f.properties.ADM0_A3
  const o = BASE[id]
  if (!o) continue
  areaMeta[`ne-${id}`] = {
    name: f.properties.NAME_EN || f.properties.NAME, c: o.c, k: o.k, note: o.note ?? f.properties.NOTE_BRK ?? undefined,
    sources: [{ title: "Natural Earth 1:10m Admin 0 countries (v5.1.1)", url: "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/" }],
  }
}
for (const area of areasIn.areas) {
  const where = `area ${area.id}`
  if (!entities[area.controller] && area.controller !== "none") throw new Error(`${where}: unknown controller ${area.controller}`)
  let g = resolve(area.geometry, where)
  if (!g) throw new Error(`${where}: empty geometry`)
  // Units from other datasets don't share Natural Earth's border lines
  // exactly; growing the area slightly and clipping it to its country
  // avoids slivers of the old controller along the edges.
  if (area.buffer_km) g = turf.buffer(g, area.buffer_km, { units: "kilometers" })
  if (area.clip) {
    g = turf.intersect(turf.featureCollection([g, resolve(area.clip, where)]))
    if (!g) throw new Error(`${where}: nothing left after clipping`)
  }
  const overlapping = control.filter((f) => bboxOverlap(f, g) && turf.booleanIntersects(f, g))
  // Paint land only: clip the area to the land it overlaps.
  const pieces = overlapping.map((f) => turf.intersect(turf.featureCollection([f, g]))).filter(Boolean)
  g = unionAll(pieces)
  if (!g) { warn(`${where}: does not overlap any land`); continue }
  for (const f of overlapping) {
    const rest = turf.difference(turf.featureCollection([f, g]))
    f.geometry = rest ? dropSlivers(rest.geometry) : null
  }
  control = control.filter((f) => f.geometry)
  control.push({ type: "Feature", geometry: g.geometry, properties: { a: area.id, c: area.controller, k: area.kind ?? "control" } })
  areaShapes[area.id] = g
  areaMeta[area.id] = {
    name: area.name, c: area.controller, k: area.kind ?? "control",
    asOf: area.asOf, confidence: area.confidence, note: area.note, sources: area.sources,
  }
}

// ---------------------------------------------------------------------------
// Claims: territory a state or movement claims but doesn't control.

const claimFeatures = []
const claimMeta = {}
for (const cl of claimsIn.claims) {
  const where = `claim ${cl.id}`
  if (!entities[cl.claimant]) throw new Error(`${where}: unknown claimant ${cl.claimant}`)
  const g = resolve(cl.geometry, where)
  claimFeatures.push({ type: "Feature", geometry: g.geometry, properties: { a: cl.id, c: cl.claimant } })
  claimMeta[cl.id] = { name: cl.name, claimant: cl.claimant, note: cl.note, sources: cl.sources }
}
const antarctica = unionAll(countries.filter((f) => f.properties.ADM0_A3 === "ATA").map(asFeature))
for (const f of antarcticClaims) {
  const p = f.properties
  if (p.type === "Historic") continue
  const onLand = turf.intersect(turf.featureCollection([asFeature(f), antarctica]))
  if (!onLand) continue
  f.geometry = onLand.geometry
  const claimant = SOV_TO_ENTITY[p.sov_a3] ?? p.sov_a3
  const id = `aq-${p.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, "")}`
  claimFeatures.push({ type: "Feature", geometry: f.geometry, properties: { a: id, c: claimant } })
  claimMeta[id] = {
    name: p.name, claimant,
    note: p.type === "Unofficial"
      ? "Unofficial zone of interest, not a formal claim."
      : `Claim held in abeyance by the Antarctic Treaty (1959).${p.note ? " " + p.note : ""}`,
    sources: [{ title: "Natural Earth: Antarctic claims", url: "https://www.naturalearthdata.com/" }],
  }
}

// ---------------------------------------------------------------------------
// Insurgent presence: areas where an armed group operates without holding
// territory outright. Drawn as a hatched overlay.

const presenceFeatures = []
const presenceMeta = {}
for (const pr of presenceIn.presence) {
  const where = `presence ${pr.id}`
  if (!entities[pr.group]) throw new Error(`${where}: unknown group ${pr.group}`)
  const g = resolve(pr.geometry, where)
  presenceFeatures.push({ type: "Feature", geometry: g.geometry, properties: { a: pr.id, c: pr.group } })
  presenceMeta[pr.id] = { name: pr.name, group: pr.group, asOf: pr.asOf, confidence: pr.confidence, note: pr.note, sources: pr.sources }
}

// ---------------------------------------------------------------------------
// Simplify all layers together so borders they share stay identical, and
// write TopoJSON (shared arcs keep it small).

fs.mkdirSync(TMP, { recursive: true })
const writeLayer = (name, feats) =>
  fs.writeFileSync(path.join(TMP, `${name}.json`), JSON.stringify(turf.featureCollection(feats)))
writeLayer("control", control)
writeLayer("claims", claimFeatures)
writeLayer("presence", presenceFeatures)
fs.mkdirSync(OUT, { recursive: true })
// Two levels of detail with the same features: a light file for the globe
// and the whole-world view, and the full source detail for zooming in.
const topology = (file, simplify, quantization) =>
  execFileSync(MAPSHAPER, [
    "-i", "combine-files", ...["control", "claims", "presence"].map((n) => path.join(TMP, `${n}.json`)),
    "-snap", "interval=0.0005",
    "-clean", "allow-overlaps",
    ...simplify,
    "-o", path.join(OUT, file), "format=topojson", `quantization=${quantization}`, "target=*",
  ], { stdio: ["ignore", "ignore", "inherit"] })
topology("map.topo.json", ["-simplify", "weighted", "percentage=9%", "keep-shapes", "planar"], 100000)
topology("map-hi.topo.json", [], 2000000)

const topo = readJson(path.join(OUT, "map.topo.json"))
const controlOut = topoFeature(topo, topo.objects.control).features

// ---------------------------------------------------------------------------
// Labels: one per controller, at the pole of inaccessibility of its largest
// polygon, with its total area so the app can decide when it fits.

const labels = {}
for (const f of controlOut) {
  const c = f.properties.c
  if (c === "none") continue
  const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates]
  for (const poly of polys) {
    const area = turf.area(turf.polygon(poly)) / 1e6
    const cur = labels[c] ?? { total: 0, best: -1 }
    cur.total += area
    if (area > cur.best) { cur.best = area; cur.at = polylabel(poly, 0.05) }
    labels[c] = cur
  }
}

// ---------------------------------------------------------------------------
// Colors. Neighbours (shared border, or within ~40 km across water) must be
// at least MIN_DE apart in CIEDE2000. Locked identity colors never move;
// the rest are visited largest-first and nudged as little as possible.

const MIN_DE = 11
const MIN_DE_NEAR = 7
const oklch = converter("oklch")
const de = differenceCiede2000()
const controllers = Object.keys(labels)

const neighbours = new Map(controllers.map((c) => [c, new Set()]))
const nb = topoNeighbors(topo.objects.control.geometries)
nb.forEach((list, i) => {
  const a = controlOut[i].properties.c
  for (const j of list) {
    const b = controlOut[j].properties.c
    if (a !== b && a !== "none" && b !== "none") { neighbours.get(a)?.add(b); neighbours.get(b)?.add(a) }
  }
})
// Near neighbours across narrow water.
const near = new Map(controllers.map((c) => [c, new Set()]))
const verts = {}
for (const f of controlOut) {
  const c = f.properties.c
  if (c === "none") continue
  const pts = turf.coordAll(f)
  verts[c] = (verts[c] ?? []).concat(pts.filter((_, i) => i % 4 === 0))
}
const bboxOf = Object.fromEntries(Object.entries(verts).map(([c, pts]) => [c, turf.bbox(turf.multiPoint(pts))]))
const PAD = 0.5
for (let i = 0; i < controllers.length; i++) {
  for (let j = i + 1; j < controllers.length; j++) {
    const a = controllers[i], b = controllers[j]
    if (neighbours.get(a).has(b)) continue
    const A = bboxOf[a], B = bboxOf[b]
    if (A[0] - PAD > B[2] || B[0] - PAD > A[2] || A[1] - PAD > B[3] || B[1] - PAD > A[3]) continue
    const vb = verts[b].filter((p) => p[0] >= A[0] - PAD && p[0] <= A[2] + PAD && p[1] >= A[1] - PAD && p[1] <= A[3] + PAD)
    const va = verts[a].filter((p) => p[0] >= B[0] - PAD && p[0] <= B[2] + PAD && p[1] >= B[1] - PAD && p[1] <= B[3] + PAD)
    let close = false
    for (const p of va) {
      for (const q of vb) {
        if (Math.abs(p[0] - q[0]) < 0.6 && Math.abs(p[1] - q[1]) < 0.4 && turf.distance(p, q) < 40) { close = true; break }
      }
      if (close) break
    }
    if (close) { near.get(a).add(b); near.get(b).add(a) }
  }
}

const locked = new Set(palette.locked)
const base = {}
const colorOf = (id, seen = new Set()) => {
  if (palette.colors[id]) return palette.colors[id]
  const e = entities[id]
  if (e?.color) return e.color
  if (e?.parent && !seen.has(id)) {
    seen.add(id)
    const p = oklch(colorOf(e.parent, seen))
    return formatHex(clampChroma({ ...p, l: Math.min(0.9, p.l + 0.1), c: p.c * 0.7 }, "oklch"))
  }
  warn(`no color for ${id}; using gray`)
  return "#9a9a9a"
}
for (const c of controllers) base[c] = colorOf(c)

const final = {}
const order = [...controllers].sort((a, b) => (locked.has(b) - locked.has(a)) || labels[b].total - labels[a].total)
const conflicts = (c, hex) => {
  let worst = Infinity
  for (const [set, min] of [[neighbours.get(c), MIN_DE], [near.get(c), MIN_DE_NEAR]]) {
    for (const n of set) {
      if (!final[n]) continue
      const d = de(hex, final[n])
      if (d < min) worst = Math.min(worst, d - min)
    }
  }
  return worst === Infinity ? 0 : worst
}
const nudged = []
for (const c of order) {
  const want = base[c]
  if (locked.has(c) || conflicts(c, want) === 0) { final[c] = want; continue }
  const o = oklch(want)
  let best = null
  for (const dl of [0, -0.06, 0.06, -0.12, 0.12, -0.18, 0.18])
    for (const kc of [1, 0.75, 1.25, 0.5])
      for (const dh of [0, -10, 10, -20, 20, -35, 35]) {
        const cand = formatHex(clampChroma({ mode: "oklch", l: Math.max(0.42, Math.min(0.86, o.l + dl)), c: Math.min(0.15, o.c * kc), h: (o.h ?? 0) + dh }, "oklch"))
        const bad = conflicts(c, cand)
        const cost = de(want, cand) - bad * 10
        if (!best || (bad === 0 && best.bad < 0) || ((bad === 0) === (best.bad === 0) && cost < best.cost)) best = { cand, bad, cost }
      }
  final[c] = best.cand
  nudged.push(c)
  if (best.bad < 0) warn(`color for ${c} still too close to a neighbour (short by ${(-best.bad).toFixed(1)})`)
}

// ---------------------------------------------------------------------------
// Antarctic stations: COMNAP's list plus curated additions.

const OPERATOR_TO_ENTITY = entitiesIn.operators ?? {}
const comnap = readJson(path.join(RAW, "comnap", "facilities.json")).features
const bases = []
for (const f of comnap) {
  const p = f.properties
  if (p.Type !== "Station" || p.Status !== "Open") continue
  const op = OPERATOR_TO_ENTITY[p.Operator__primary_] ?? p.Operator__primary_
  if (!entities[op]) { warn(`station ${p.English_Name}: unknown operator ${p.Operator__primary_}`); continue }
  bases.push({ name: p.English_Name, op, lon: +p.Longitude__DD_.toFixed(3), lat: +p.Latitude__DD_.toFixed(3), year: p.Year_Established || undefined, season: p.Seasonality || undefined })
}
for (const b of basesIn.bases) bases.push(b)

// ---------------------------------------------------------------------------
// Write the app's data files.

const entitiesOut = {}
for (const c of controllers) {
  const e = entities[c] ?? {}
  entitiesOut[c] = {
    name: e.name, short: e.short && e.short !== e.name ? e.short : undefined, formal: e.formal, kind: e.kind, parent: e.parent, recognition: e.recognition, note: e.note,
    color: final[c], label: labels[c].at.map((x) => +x.toFixed(3)), km2: Math.round(labels[c].total),
  }
}
for (const id of new Set([...claimFeatures, ...presenceFeatures].map((f) => f.properties.c).concat(bases.map((b) => b.op)))) {
  if (entitiesOut[id]) continue
  const e = entities[id] ?? {}
  entitiesOut[id] = { name: e.name, formal: e.formal, kind: e.kind, parent: e.parent, recognition: e.recognition, note: e.note, color: colorOf(id) }
}
fs.writeFileSync(path.join(OUT, "entities.json"), JSON.stringify(entitiesOut))
fs.writeFileSync(path.join(OUT, "details.json"), JSON.stringify({ areas: areaMeta, claims: claimMeta, presence: presenceMeta }))
fs.writeFileSync(path.join(OUT, "bases.json"), JSON.stringify(bases))
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ asOf: areasIn.asOf, built: new Date().toISOString().slice(0, 10) }))

const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB"
console.log(`control ${controlOut.length} features, ${controllers.length} controllers; ${claimFeatures.length} claims; ${presenceFeatures.length} presence; ${bases.length} stations`)
console.log(`map.topo.json ${kb("map.topo.json")}, entities.json ${kb("entities.json")}, details.json ${kb("details.json")}`)
console.log(`colors nudged for contrast: ${nudged.length ? nudged.join(" ") : "none"}`)
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ` + warnings.join("\n  "))
