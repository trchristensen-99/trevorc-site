// Exports the built map for use outside the site: a KMZ for Google Earth
// and Google My Maps, a GeoJSON for GIS tools, and a small KML network link
// that Google Earth Pro re-fetches so it always shows the latest version.
// Reads ../data (written by build.mjs) and writes ../data/export.

import { execFileSync } from "child_process"
import fs from "fs"
import path from "path"
import { strToU8, zipSync } from "fflate"
import { feature } from "topojson-client"

const HERE = path.dirname(new URL(import.meta.url).pathname)
const DATA = path.join(HERE, "..", "data")
const OUT = path.join(DATA, "export")
const TMP = path.join(HERE, "raw", "tmp")
const MAPSHAPER = path.join(HERE, "node_modules", ".bin", "mapshaper")
const SITE = "https://trevorc.com"
const APP = `${SITE}/apps/de-facto-world-map`
const PAGE = `${SITE}/projects/de-facto-world-map`
const NAME = "de-facto-world-map"

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"))
const entities = readJson(path.join(DATA, "entities.json"))
const details = readJson(path.join(DATA, "details.json"))
const stations = readJson(path.join(DATA, "bases.json"))
const meta = readJson(path.join(DATA, "meta.json"))

// Google My Maps takes files up to 5 MB, so the export keeps about a third
// of the full-resolution vertices; that is still finer than Natural Earth's
// 1:10m borders need.
fs.mkdirSync(TMP, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })
const mid = path.join(TMP, "export.topo.json")
execFileSync(MAPSHAPER, [
  "-i", path.join(DATA, "map-hi.topo.json"),
  "-simplify", "weighted", "percentage=30%", "keep-shapes", "planar",
  "-o", mid, "format=topojson", "quantization=1000000", "target=*",
], { stdio: ["ignore", "ignore", "inherit"] })
const topo = readJson(mid)
const layer = (name) => feature(topo, topo.objects[name]).features

const KIND = {
  control: "Governed",
  dependency: "Dependency",
  lease: "Leased territory",
  occupation: "Military occupation",
  contested: "Contested or undemarcated",
  uncontrolled: "No controlling state",
  international: "International administration",
}
const ENTITY_KIND = {
  state: "UN member state",
  "de facto state": "De facto state",
  dependency: "Dependency",
  "armed group": "Armed group administration",
  international: "International body",
}
const nameOf = (c) => (c === "none" ? "No controlling state" : entities[c]?.name ?? c)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
const round = (x) => Math.round(x * 1e5) / 1e5

// KML colors are aabbggrr.
function kmlColor(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  const h = (v) => v.toString(16).padStart(2, "0")
  return h(Math.round(alpha * 255)) + h(n & 255) + h((n >> 8) & 255) + h((n >> 16) & 255)
}
function darken(hex, t) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v) => Math.round(v * (1 - t))
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")
}
const colorOf = (c) => entities[c]?.color ?? "#9a9a9a"
const GRAY = "#8a9096"

// ---------------------------------------------------------------- styles

const styles = new Map()
function style(id, { line, lineAlpha = 1, width, fill, fillAlpha = 0, icon }) {
  if (styles.has(id)) return id
  const parts = []
  if (icon) {
    parts.push(`<IconStyle><color>${kmlColor(icon, 1)}</color><scale>0.8</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>`)
    parts.push(`<LabelStyle><scale>0</scale></LabelStyle>`)
  }
  if (line) parts.push(`<LineStyle><color>${kmlColor(line, lineAlpha)}</color><width>${width}</width></LineStyle>`)
  if (fill) parts.push(`<PolyStyle><color>${kmlColor(fill, fillAlpha)}</color></PolyStyle>`)
  else if (line) parts.push(`<PolyStyle><fill>0</fill></PolyStyle>`)
  styles.set(id, `<Style id="${id}">${parts.join("")}</Style>`)
  return id
}

// ------------------------------------------------------------- geometry

const ring = (r) => `<LinearRing><coordinates>${r.map(([x, y]) => `${round(x)},${round(y)}`).join(" ")}</coordinates></LinearRing>`
const polygon = (rings) =>
  `<Polygon><tessellate>1</tessellate><outerBoundaryIs>${ring(rings[0])}</outerBoundaryIs>` +
  rings.slice(1).map((r) => `<innerBoundaryIs>${ring(r)}</innerBoundaryIs>`).join("") +
  `</Polygon>`
function geometry(g) {
  if (!g) return ""
  if (g.type === "Polygon") return polygon(g.coordinates)
  if (g.type === "MultiPolygon") return `<MultiGeometry>${g.coordinates.map(polygon).join("")}</MultiGeometry>`
  return ""
}

// ----------------------------------------------------------- placemarks

function description(rows, note, sources) {
  const dl = rows.filter(([, v]) => v).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}<br>`).join("")
  const src = sources?.length ? `<p><b>Sources</b><br>${sources.map((s) => `<a href="${esc(s.url)}">${esc(s.title)}</a>`).join("<br>")}</p>` : ""
  return `<![CDATA[${dl}${note ? `<p>${esc(note)}</p>` : ""}${src}<p><a href="${PAGE}">De Facto World Map</a>, control as of ${esc(meta.asOf)}</p>]]>`
}
// My Maps shows ExtendedData as the feature's attribute table.
const extended = (fields) =>
  `<ExtendedData>${Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `<Data name="${k}"><value>${esc(v)}</value></Data>`).join("")}</ExtendedData>`
const placemark = (name, styleId, desc, data, geom) =>
  `<Placemark><name>${esc(name)}</name><styleUrl>#${styleId}</styleUrl><description>${desc}</description>${extended(data)}${geom}</Placemark>`

const control = []
const controlGeo = []
for (const f of layer("control")) {
  const { a, c, k = "control" } = f.properties
  if (k === "uncontrolled" || (c === "none" && k !== "contested")) continue
  const d = details.areas[a]
  const e = entities[c] ?? {}
  const name = d?.name ?? e.name ?? c
  const color = colorOf(c)
  const sid =
    k === "contested" ? style("contested", { line: GRAY, width: 1.5, fill: GRAY, fillAlpha: 0.4 })
    : k === "occupation" ? style(`occ-${c}`, { line: color, width: 3, fill: color, fillAlpha: 0.25 })
    : style(`ctl-${c}`, { line: darken(color, 0.25), width: 1.5, fill: color, fillAlpha: 0.45 })
  const status = [ENTITY_KIND[e.kind] ?? e.kind, k !== "control" ? KIND[k] : null].filter(Boolean).join(", ")
  const sources = d?.sources ?? [{ title: "Natural Earth 1:10m Admin 0 countries", url: "https://www.naturalearthdata.com/" }]
  control.push(placemark(
    name, sid,
    description([["Controlled by", k === "contested" ? null : nameOf(c)], ["Status", status], ["As of", d?.asOf], ["Confidence", d?.confidence]], d?.note ?? e.recognition, sources),
    { controller: k === "contested" ? "" : nameOf(c), status, as_of: d?.asOf, confidence: d?.confidence, note: d?.note ?? e.recognition },
    geometry(f.geometry),
  ))
  controlGeo.push({ type: "Feature", properties: { layer: "control", id: a, name, controller: c, controller_name: nameOf(c), kind: k, as_of: d?.asOf, confidence: d?.confidence, note: d?.note, color }, geometry: f.geometry })
}

const claims = []
const claimsGeo = []
for (const f of layer("claims")) {
  const { a, c } = f.properties
  const d = details.claims[a] ?? {}
  const sid = style(`claim-${c}`, { line: darken(colorOf(c), 0.15), width: 2.5 })
  const name = `${d.name ?? a} (claimed by ${nameOf(c)})`
  claims.push(placemark(name, sid, description([["Claimed by", nameOf(c)]], d.note, d.sources), { claimant: nameOf(c), note: d.note }, geometry(f.geometry)))
  claimsGeo.push({ type: "Feature", properties: { layer: "claims", id: a, name: d.name, claimant: c, claimant_name: nameOf(c), note: d.note, color: colorOf(c) }, geometry: f.geometry })
}

const presence = []
const presenceGeo = []
for (const f of layer("presence")) {
  const { a, c } = f.properties
  const d = details.presence[a] ?? {}
  const sid = style(`pres-${c}`, { line: colorOf(c), width: 2, fill: colorOf(c), fillAlpha: 0.2 })
  const name = `${nameOf(c)}: ${d.name ?? a}`
  presence.push(placemark(name, sid, description([["Group", nameOf(c)], ["As of", d.asOf], ["Confidence", d.confidence]], d.note, d.sources), { group: nameOf(c), as_of: d.asOf, confidence: d.confidence, note: d.note }, geometry(f.geometry)))
  presenceGeo.push({ type: "Feature", properties: { layer: "presence", id: a, name: d.name, group: c, group_name: nameOf(c), as_of: d.asOf, confidence: d.confidence, note: d.note, color: colorOf(c) }, geometry: f.geometry })
}

const stationMarks = []
const stationGeo = []
for (const s of stations) {
  const sid = style(`stn-${s.op}`, { icon: colorOf(s.op) })
  stationMarks.push(placemark(
    s.name, sid,
    description([["Operated by", nameOf(s.op)], ["Established", s.year]], null, [{ title: "COMNAP Antarctic Facilities", url: "https://github.com/PolarGeospatialCenter/comnap-antarctic-facilities" }]),
    { operator: nameOf(s.op), established: s.year },
    `<Point><coordinates>${s.lon},${s.lat}</coordinates></Point>`,
  ))
  stationGeo.push({ type: "Feature", properties: { layer: "stations", name: s.name, operator: s.op, operator_name: nameOf(s.op), established: s.year }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })
}

// ---------------------------------------------------------------- write

const folder = (name, desc, items, open = false) =>
  `<Folder><name>${esc(name)}</name><open>${open ? 1 : 0}</open><description>${esc(desc)}</description>${items.join("")}</Folder>`
const credit =
  `Who actually controls territory, rather than who claims it, as of ${meta.asOf}. ` +
  `By Trevor Christensen, ${PAGE}. Map data CC BY-SA 4.0 (Antarctic stations: COMNAP, non-commercial use). ` +
  `Borders from Natural Earth and geoBoundaries.`
const kml =
  `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
  `<name>De Facto World Map (${esc(meta.asOf)})</name><open>1</open><description>${esc(credit)}</description>` +
  [...styles.values()].join("") +
  folder("De facto control", "Territory governed by a state or self-governing entity; occupations have a thick outline and a lighter fill; contested areas are gray.", control, true) +
  folder("Claims", "Territory claimed but not controlled, outlined in the claimant's color.", claims) +
  folder("Insurgent presence", "Areas where an armed group operates without holding territory outright.", presence) +
  folder("Antarctic stations", "Year-round and seasonal research stations, colored by operator.", stationMarks) +
  `</Document></kml>\n`

const kmz = zipSync({ "doc.kml": strToU8(kml) }, { level: 9 })
fs.writeFileSync(path.join(OUT, `${NAME}.kmz`), kmz)

const geojson = {
  type: "FeatureCollection",
  name: "De Facto World Map",
  description: credit,
  as_of: meta.asOf,
  features: [...controlGeo, ...claimsGeo, ...presenceGeo, ...stationGeo],
}
fs.writeFileSync(path.join(OUT, `${NAME}.geojson`), JSON.stringify(geojson, (k, v) => (typeof v === "number" ? round(v) : v)))

// Google Earth Pro re-reads this link when opened and every day after, so
// a saved copy keeps up with the map.
const live =
  `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><NetworkLink>` +
  `<name>De Facto World Map (live)</name><open>1</open><description>${esc(credit)}</description>` +
  `<Link><href>${APP}/data/export/${NAME}.kmz</href><refreshMode>onInterval</refreshMode><refreshInterval>86400</refreshInterval></Link>` +
  `</NetworkLink></kml>\n`
fs.writeFileSync(path.join(OUT, `${NAME}-live.kml`), live)

const mb = (f) => (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(2) + " MB"
console.log(`export: ${NAME}.kmz ${mb(`${NAME}.kmz`)} (KML ${(kml.length / 1048576).toFixed(1)} MB), ${NAME}.geojson ${mb(`${NAME}.geojson`)}`)
