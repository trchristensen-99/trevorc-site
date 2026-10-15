// Full-resolution detail for the zoomed-in globe and Mercator views, cut
// into one file per zoom-6 map tile (about 5.6° across), so the app only
// downloads the region on screen and every finer tile it draws comes from
// exactly one file. Each file is a TopoJSON with
//   control  the control polygons clipped to the tile, each grown 2 km out
//            to sea: Natural Earth's coastline can lie inland of the real
//            one, and the app draws OpenStreetMap's water over the fills,
//            which cuts them back to the true coast;
//   outline  their edges as lines, without the sea margin and without the
//            edges the clipping made, so outline styles don't draw the grid;
//   borders  the lines between different controllers.

import fs from "fs"
import path from "path"
import * as turf from "@turf/turf"
import { topology } from "topojson-server"
import { mesh } from "topojson-client"

export const CELL_Z = 6
const n = 2 ** CELL_Z
const lon = (x) => (x / n) * 360 - 180
const lat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
const tileX = (lo) => Math.max(0, Math.min(n - 1, Math.floor(((lo + 180) / 360) * n)))
const tileY = (la) => {
  const c = Math.max(-85.0511, Math.min(85.0511, la)) * (Math.PI / 180)
  return Math.max(0, Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(c) + 1 / Math.cos(c)) / Math.PI) / 2) * n)))
}
const round = (v) => Math.round(v * 1e6) / 1e6

// Signed area of a ring in lon/lat; positive is counterclockwise.
const ringArea = (r) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
  return a / 2
}

// Runs of a ring that aren't on the tile's edge. Rings are oriented
// counterclockwise outside and clockwise around holes, so the territory is
// always on the right of the line on screen (where a positive MapLibre
// line-offset goes).
function outlineRuns(ring, bb, hole) {
  let r = ring.slice(0, -1)
  if ((ringArea(ring) > 0) === hole) r = r.reverse()
  const eps = 1e-9
  const onEdge = (p, q) =>
    (Math.abs(p[0] - bb[0]) < eps && Math.abs(q[0] - bb[0]) < eps) ||
    (Math.abs(p[0] - bb[2]) < eps && Math.abs(q[0] - bb[2]) < eps) ||
    (Math.abs(p[1] - bb[1]) < eps && Math.abs(q[1] - bb[1]) < eps) ||
    (Math.abs(p[1] - bb[3]) < eps && Math.abs(q[1] - bb[3]) < eps)
  const m = r.length
  const edge = r.map((p, i) => onEdge(p, r[(i + 1) % m]))
  if (!edge.some(Boolean)) return [[...r, r[0]]]
  // Start just after an edge segment so no run wraps around the start.
  const start = (edge.indexOf(true) + 1) % m
  const runs = []
  let cur = null
  for (let k = 0; k < m; k++) {
    const i = (start + k) % m
    if (edge[i]) {
      if (cur && cur.length > 1) runs.push(cur)
      cur = null
    } else {
      cur ??= [r[i]]
      cur.push(r[(i + 1) % m])
    }
  }
  if (cur && cur.length > 1) runs.push(cur)
  return runs
}

export function writeCells(features, seaward, dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const cells = new Map()
  const grown = new Map(seaward.map((f) => [f.properties.a, f]))
  const clipTo = (f, bb) => {
    const g = turf.bboxClip(f, bb).geometry
    return (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates])
      .map((p) => p.filter((ring) => ring.length >= 4 && Math.abs(ringArea(ring)) > 1e-12))
      .filter((p) => p.length && Math.abs(ringArea(p[0])) > 1e-10)
      .map((p) => p.map((ring) => ring.map(([a, b]) => [round(a), round(b)])))
  }
  for (const f of features) {
    const [w, s, e, nn] = turf.bbox(f)
    for (let x = tileX(w); x <= tileX(e); x++)
      for (let y = tileY(nn); y <= tileY(s); y++) {
        const bb = [lon(x), lat(y + 1), lon(x + 1), lat(y)]
        const coords = clipTo(f, bb)
        if (!coords.length) continue
        const key = `${x}-${y}`
        const cell = cells.get(key) ?? { bb, control: [], land: [], outline: [] }
        cells.set(key, cell)
        cell.land.push({ type: "Feature", properties: f.properties, geometry: { type: "MultiPolygon", coordinates: coords } })
        const wide = grown.has(f.properties.a) ? clipTo(grown.get(f.properties.a), bb) : coords
        cell.control.push({ type: "Feature", properties: f.properties, geometry: { type: "MultiPolygon", coordinates: wide.length ? wide : coords } })
        for (const p of coords)
          p.forEach((ring, i) => {
            for (const run of outlineRuns(ring, bb, i > 0))
              cell.outline.push({ type: "Feature", properties: { c: f.properties.c }, geometry: { type: "LineString", coordinates: run } })
          })
      }
  }
  let bytes = 0
  for (const [key, cell] of [...cells].sort()) {
    // Borders from the land shapes, so they stop at the coast.
    const landTopo = topology({ land: { type: "FeatureCollection", features: cell.land } }, 1e6)
    const borders = mesh(landTopo, landTopo.objects.land, (a, b) => a !== b && (a.properties.c !== b.properties.c || a.properties.k !== b.properties.k))
    const topo = topology(
      {
        control: { type: "FeatureCollection", features: cell.control },
        outline: { type: "FeatureCollection", features: cell.outline },
        borders: { type: "Feature", properties: {}, geometry: borders },
      },
      1e6,
    )
    const json = JSON.stringify(topo)
    bytes += json.length
    fs.writeFileSync(path.join(dir, `${key}.json`), json)
  }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ z: CELL_Z, cells: [...cells.keys()].sort() }))
  return { count: cells.size, bytes }
}
