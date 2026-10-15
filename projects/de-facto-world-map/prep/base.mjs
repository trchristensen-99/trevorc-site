// Natural Earth's countries with OpenStreetMap's borders. Natural Earth
// decides who holds what (it draws de facto lines, and features like
// Somaliland or Northern Cyprus that OpenStreetMap folds into a country),
// but its 1:10m borders are only accurate to a kilometer or so. This
// rebuilds each country from OpenStreetMap's land borders (via Overture,
// about one point every 100 m) and Natural Earth's coastlines, which the
// textured maps cover with OpenStreetMap's own water anyway.
//
//   1. Lines: every OpenStreetMap country border, stretched 3 km past its
//      ends so it crosses Natural Earth's coast, plus Natural Earth's coasts
//      and those of its internal lines OpenStreetMap doesn't have.
//   2. mapshaper turns the lines into faces.
//   3. Each face goes to the Natural Earth feature it belongs to: by which
//      OpenStreetMap country it lies in, split by Natural Earth where several
//      features share one country.
//
// The result is cached in raw/tmp/precise.json until an input changes.

import { execFileSync } from "child_process"
import fs from "fs"
import path from "path"
import * as turf from "@turf/turf"
import polylabel from "polylabel"

const HERE = path.dirname(new URL(import.meta.url).pathname)
const RAW = path.join(HERE, "raw")
const TMP = path.join(RAW, "tmp")
const MAPSHAPER = path.join(HERE, "node_modules", ".bin", "mapshaper")

// The OpenStreetMap countries (Overture codes) each Natural Earth feature
// corresponds to, where that isn't simply its ISO code: features that sit
// inside another country, and countries OpenStreetMap splits into
// territories of their own (Gaza and the West Bank, the Golan, Abyei, the
// southern Kurils, the Gulf islands Iran holds).
const HOST = {
  ESB: ["CY"], WSB: ["CY"], CNM: ["CY"], CYN: ["CY"], SOL: ["SO"], SAH: ["MA"], USG: ["CU"], KAB: ["KZ"],
  CLP: ["FR"], IOA: ["AU"], CSI: ["AU"], ATC: ["AU"],
  PSX: ["XG", "XW"], ISR: ["IL", "XH"], SDN: ["SD", "XY"], RUS: ["RU", "XA", "XO", "XI", "XU"], IRN: ["IR", "XM", "XN"],
}
// Small disputed pockets Natural Earth draws as their own features, kept
// with Natural Earth's outline.
const OWN_OUTLINE = new Set(["KAS", "SPI", "BRT", "BRI"])

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"))
const inBox = (bb, [x, y]) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]

export function preciseCountries(neFile) {
  const bordersFile = path.join(RAW, "overture", "borders.geojson")
  const landFile = path.join(RAW, "overture", "land.geojson")
  const out = path.join(TMP, "precise.json")
  const inputs = [neFile, bordersFile, landFile, new URL(import.meta.url).pathname]
  if (fs.existsSync(out) && inputs.every((f) => fs.statSync(f).mtimeMs < fs.statSync(out).mtimeMs)) return readJson(out)
  fs.mkdirSync(TMP, { recursive: true })
  const t0 = Date.now()

  // 1. Lines.
  const borders = readJson(bordersFile).features
  const neighbours = {}
  for (const f of borders) {
    const { left, right } = f.properties
    if (!left || !right) continue
    ;(neighbours[left] ??= new Set()).add(right)
    ;(neighbours[right] ??= new Set()).add(left)
  }
  const ne = readJson(neFile)
  for (const f of ne.features) {
    const p = f.properties
    const hosts = HOST[p.ADM0_A3] ?? [/^[A-Z]{2}$/.test(p.ISO_A2_EH) ? p.ISO_A2_EH : p.ADM0_A3]
    const osm = new Set(hosts.flatMap((h) => [...(neighbours[h] ?? [])]))
    f.properties = { id: p.ADM0_A3, hosts: hosts.join(","), own: OWN_OUTLINE.has(p.ADM0_A3) ? 1 : 0, osm: [...osm].join(",") }
  }
  const neFileTagged = path.join(TMP, "ne-host.json")
  fs.writeFileSync(neFileTagged, JSON.stringify(ne))
  const KM = 3
  const extend = (p, q) => {
    const k = Math.cos((p[1] * Math.PI) / 180)
    const dx = (p[0] - q[0]) * k, dy = p[1] - q[1]
    const d = Math.hypot(dx, dy) || 1e-9
    const deg = KM / 111.2
    return [p[0] + ((dx / d) * deg) / k, p[1] + (dy / d) * deg]
  }
  const osmLines = []
  for (const f of borders) {
    const parts = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const c of parts)
      if (c.length >= 2) osmLines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [extend(c[0], c[1]), ...c, extend(c.at(-1), c.at(-2))] } })
  }
  const osmFile = path.join(TMP, "osm-lines.json")
  fs.writeFileSync(osmFile, JSON.stringify({ type: "FeatureCollection", features: osmLines }))
  const neEdges = path.join(TMP, "ne-edges.json")
  // Natural Earth edges to keep: coasts, lines between features in the same
  // OpenStreetMap country, and lines where OpenStreetMap has no border.
  execFileSync(MAPSHAPER, [
    "-i", neFileTagged,
    "-lines",
    "where=(!B || A.own === 1 || B.own === 1 || A.hosts.split(',').some((h) => B.hosts.split(',').indexOf(h) >= 0) || !B.hosts.split(',').some((h) => A.osm.split(',').indexOf(h) >= 0)) ? true : false",
    "-o", neEdges,
  ], { stdio: ["ignore", "ignore", "inherit"] })

  // 2. Faces.
  const facesFile = path.join(TMP, "faces.json")
  execFileSync(MAPSHAPER, [
    "-i", "combine-files", neEdges, osmFile, "-merge-layers", "force",
    "-polygons", "gap-tolerance=0.0002", "-o", facesFile,
  ], { stdio: ["ignore", "ignore", "inherit"] })

  // 3. Owners.
  const fc = readJson(facesFile)
  const faces = fc.features ?? fc.geometries.map((g) => ({ type: "Feature", properties: {}, geometry: g }))
  const land = readJson(landFile).features.map((f) => ({ f, bb: turf.bbox(f), c: f.properties.country }))
  const neIdx = ne.features.map((f) => ({ f, bb: turf.bbox(f) }))
  const byHost = {}
  for (const { f } of neIdx) for (const h of f.properties.hosts.split(",")) (byHost[h] ??= []).push(f)
  const largestOverlap = (face, cands) => {
    let best = null, bestA = 0
    const fb = turf.bbox(face)
    for (const f of cands) {
      const b = turf.bbox(f)
      if (b[0] > fb[2] || b[2] < fb[0] || b[1] > fb[3] || b[3] < fb[1]) continue
      const i = turf.intersect(turf.featureCollection([face, f]))
      const a = i ? turf.area(i) : 0
      if (a > bestA) { bestA = a; best = f }
    }
    return best
  }
  const owned = []
  for (const face of faces) {
    // The point farthest from the face's edges, so the generalized outlines
    // used to look up its country can't put it on the wrong side.
    const g = face.geometry
    const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]
    const big = polys.reduce((a, b) => (turf.area(turf.polygon(b)) > turf.area(turf.polygon(a)) ? b : a))
    const pt = polylabel(big, 0.0005)
    const hosts = land.filter((l) => inBox(l.bb, pt) && turf.booleanPointInPolygon(pt, l.f)).map((l) => l.c)
    let owner = neIdx.find(({ f, bb }) => f.properties.own && inBox(bb, pt) && turf.booleanPointInPolygon(pt, f))?.f
    if (!owner && hosts.length === 1 && byHost[hosts[0]]?.length === 1) owner = byHost[hosts[0]][0]
    else if (!owner && hosts.length === 1 && byHost[hosts[0]]) owner = largestOverlap(face, byHost[hosts[0]])
    // Outside any single OpenStreetMap country (disputed areas, coastal
    // slivers): go by Natural Earth.
    if (!owner) owner = neIdx.find(({ f, bb }) => inBox(bb, pt) && turf.booleanPointInPolygon(pt, f))?.f
    if (owner) owned.push({ type: "Feature", properties: { id: owner.properties.id }, geometry: face.geometry })
  }
  const ownedFile = path.join(TMP, "owned.json")
  fs.writeFileSync(ownedFile, JSON.stringify({ type: "FeatureCollection", features: owned }))
  execFileSync(MAPSHAPER, ["-i", ownedFile, "-dissolve", "id", "-o", out], { stdio: ["ignore", "ignore", "inherit"] })
  console.log(`precise borders: ${owned.length} faces in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  return readJson(out)
}
