// Full-resolution detail for the zoomed-in globe and Mercator views, cut
// into one file per zoom-6 map tile (about 5.6° across), so the app only
// downloads the region on screen and every finer tile it draws comes from
// exactly one file. Each file is a TopoJSON with
//   control   the control polygons, each grown 2 km out to sea: Natural
//             Earth's coastline can lie inland of the real one, and the app
//             draws OpenStreetMap's water over the fills, which cuts them
//             back to the true coast;
//   borders, kinds, outline   the lines from edges.mjs, from the land shapes.
// Everything is clipped a little beyond the cell. MapLibre skips the
// antialiased edge of a fill only where it lies outside its tile, so
// polygons cut exactly at the cell's edge would draw a faint seam there.

import fs from "fs"
import path from "path"
import * as turf from "@turf/turf"
import { topology } from "topojson-server"
import { edges } from "./edges.mjs"

export const CELL_Z = 6
const MARGIN = 0.02 // degrees beyond the cell, inside the tiles' buffer
const SEA_KM = 2
const n = 2 ** CELL_Z
const lon = (x) => (x / n) * 360 - 180
const lat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
const tileX = (lo) => Math.max(0, Math.min(n - 1, Math.floor(((lo + 180) / 360) * n)))
const tileY = (la) => {
  const c = Math.max(-85.0511, Math.min(85.0511, la)) * (Math.PI / 180)
  return Math.max(0, Math.min(n - 1, Math.floor(((1 - Math.log(Math.tan(c) + 1 / Math.cos(c)) / Math.PI) / 2) * n)))
}
const round = (v) => Math.round(v * 1e6) / 1e6
const ringArea = (r) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
  return a / 2
}

function clipTo(f, bb) {
  const g = turf.bboxClip(f, bb).geometry
  const polys = (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates])
    .map((p) => p.filter((ring) => ring.length >= 4 && Math.abs(ringArea(ring)) > 1e-12))
    .filter((p) => p.length && Math.abs(ringArea(p[0])) > 1e-10)
    .map((p) => p.map((ring) => ring.map(([a, b]) => [round(a), round(b)])))
  return polys.length ? { type: "Feature", properties: f.properties, geometry: { type: "MultiPolygon", coordinates: polys } } : null
}

// An arc lying along one side of the clipping box.
const onBoxEdge = (bb) => (arc) => {
  const eps = 1e-6
  for (const [i, v] of [[0, bb[0]], [0, bb[2]], [1, bb[1]], [1, bb[3]]]) if (arc.every((p) => Math.abs(p[i] - v) < eps)) return true
  return false
}

// A piece grown into the sea but not onto other land: a buffer of a
// simplified copy (the margin only needs to cover the gap to the true
// coast), minus all land in the cell.
function seaward(piece, land, bb) {
  const coarse = turf.simplify(piece, { tolerance: 0.001, highQuality: false })
  let margin = turf.buffer(coarse, SEA_KM, { units: "kilometers" })
  if (!margin) return piece
  // Near the 180° meridian the buffer comes back with longitudes wrapped to
  // the other side; unwrap them around the cell, or the clip below would
  // span the whole world.
  const cx = (bb[0] + bb[2]) / 2
  turf.coordEach(margin, (p) => {
    while (p[0] - cx > 180) p[0] -= 360
    while (p[0] - cx < -180) p[0] += 360
  })
  margin = turf.intersect(turf.featureCollection([margin, turf.bboxPolygon(bb)]))
  if (!margin) return piece
  margin = turf.difference(turf.featureCollection([margin, land]))
  if (!margin) return piece
  const grown = turf.union(turf.featureCollection([piece, margin]))
  return grown ? { ...grown, properties: piece.properties } : piece
}

export function writeCells(features, dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const cells = new Map()
  for (const f of features) {
    const [w, s, e, nn] = turf.bbox(f)
    for (let x = tileX(w - MARGIN); x <= tileX(e + MARGIN); x++)
      for (let y = tileY(nn + MARGIN); y <= tileY(s - MARGIN); y++) {
        const key = `${x}-${y}`
        const bb = [lon(x) - MARGIN, lat(y + 1) - MARGIN, lon(x + 1) + MARGIN, lat(y) + MARGIN]
        const piece = clipTo(f, bb)
        if (!piece) continue
        const cell = cells.get(key) ?? { bb, land: [] }
        cells.set(key, cell)
        cell.land.push(piece)
      }
  }
  let bytes = 0
  for (const [key, cell] of [...cells].sort()) {
    const landTopo = topology({ land: { type: "FeatureCollection", features: cell.land } }, 1e6)
    const lines = edges(landTopo, landTopo.objects.land, onBoxEdge(cell.bb))
    // Only pieces with a coast need growing; a piece has one where an
    // outline runs along an arc no other feature shares.
    const coastal = new Set()
    for (const [a, o] of arcOwners(landTopo.objects.land)) if (o.length === 1 && !onBoxEdge(cell.bb)(decode(landTopo, a))) coastal.add(o[0])
    let land = null
    const control = cell.land.map((piece, i) => {
      if (!coastal.has(i)) return piece
      land ??= cell.land.length > 1 ? turf.union(turf.featureCollection(cell.land)) : cell.land[0]
      return seaward(piece, land, cell.bb)
    })
    const topo = topology(
      {
        control: { type: "FeatureCollection", features: control },
        outline: { type: "FeatureCollection", features: lines.outlines },
        borders: { type: "Feature", properties: {}, geometry: lines.borders },
        kinds: { type: "Feature", properties: {}, geometry: lines.kinds },
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

function arcOwners(obj) {
  const owners = new Map()
  obj.geometries.forEach((g, gi) => {
    const polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : []
    for (const poly of polys)
      for (const ring of poly)
        for (const ref of ring) {
          const a = ref < 0 ? ~ref : ref
          owners.set(a, [...(owners.get(a) ?? []), gi])
        }
  })
  return owners
}

function decode(topo, a) {
  const t = topo.transform
  let x = 0, y = 0
  return topo.arcs[a].map((p) => {
    x += p[0]
    y += p[1]
    return t ? [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] : p
  })
}
