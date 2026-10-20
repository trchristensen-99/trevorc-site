// The lines a map needs from a control topology, worked out from which
// features share each arc:
//   borders   between different controllers;
//   kinds     between areas of one controller held differently (Russia and
//             Russian-occupied Ukraine), drawn only with the shading on, so
//             that without it an occupier's land reads as one piece;
//   outlines  each controller's edge along its borders and coasts, oriented
//             so the territory is on the right on screen, where a positive
//             MapLibre line-offset puts the line inside it.
// prep/edges.mjs is the same code for the build, which uses it on the
// full-detail cells.

import type { Feature, LineString, MultiLineString, Position } from "geojson"
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from "topojson-specification"
import type { FeatureProps } from "./types"

type Geom = (Polygon<FeatureProps> | MultiPolygon<FeatureProps>) & { properties?: FeatureProps }

export interface Edges {
  borders: MultiLineString
  kinds: MultiLineString
  outlines: Feature<LineString, { c: string }>[]
}

function decodeArcs(topo: Topology): Position[][] {
  const t = topo.transform
  return topo.arcs.map((arc) => {
    if (!t) return arc.map((p) => [p[0], p[1]])
    let x = 0, y = 0
    return arc.map((p) => {
      x += p[0]
      y += p[1]
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]
    })
  })
}

const signedArea = (r: Position[]) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
  return a / 2
}

// `skipArc` drops single-feature arcs that aren't real edges, such as the
// clipping edges of a cell.
export function edges(topo: Topology, obj: GeometryCollection<FeatureProps>, skipArc: (arc: Position[]) => boolean = () => false): Edges {
  const arcs = decodeArcs(topo)
  const geoms = (obj.geometries as Geom[]).filter((g) => g.type === "Polygon" || g.type === "MultiPolygon")
  const polygonsOf = (g: Geom) => (g.type === "Polygon" ? [g.arcs] : g.arcs)
  const owners = new Map<number, number[]>()
  geoms.forEach((g, gi) => {
    for (const poly of polygonsOf(g))
      for (const ring of poly)
        for (const ref of ring) {
          const a = ref < 0 ? ~ref : ref
          const o = owners.get(a)
          if (o) o.push(gi)
          else owners.set(a, [gi])
        }
  })
  const c = (gi: number) => geoms[gi].properties?.c
  const k = (gi: number) => geoms[gi].properties?.k
  const borders: Position[][] = []
  const kinds: Position[][] = []
  for (const [a, o] of owners) {
    const [i, j] = o
    if (o.length < 2 || i === j) continue
    if (c(i) !== c(j)) borders.push(arcs[a])
    else if (k(i) !== k(j)) kinds.push(arcs[a])
  }
  const coords = (ref: number) => (ref < 0 ? arcs[~ref].slice().reverse() : arcs[ref])
  const outlines: Feature<LineString, { c: string }>[] = []
  geoms.forEach((g, gi) => {
    const own = c(gi)
    if (!own || own === "none") return
    const keep = (ref: number) => {
      const a = ref < 0 ? ~ref : ref
      const others = owners.get(a)!.filter((x) => x !== gi)
      return others.length ? others.some((x) => c(x) !== own) : !skipArc(arcs[a])
    }
    for (const poly of polygonsOf(g))
      poly.forEach((ring, ri) => {
        const full = ring.flatMap(coords)
        // Outer rings counterclockwise and holes clockwise in lon/lat, which
        // puts the territory on the right once the y axis points down.
        const flip = (signedArea(full) > 0) !== (ri === 0)
        const kept = ring.map(keep)
        if (!kept.some(Boolean)) return
        // Start after a dropped arc so no run wraps around the ring's start.
        const start = kept.every(Boolean) ? 0 : (kept.indexOf(false) + 1) % ring.length
        const runs: Position[][] = []
        let cur: Position[] | null = null
        for (let n = 0; n < ring.length; n++) {
          const i = (start + n) % ring.length
          if (!kept[i]) {
            if (cur) runs.push(cur)
            cur = null
            continue
          }
          const pts = coords(ring[i])
          cur = cur ? cur.concat(pts.slice(1)) : pts.slice()
        }
        if (cur) runs.push(cur)
        for (const run of runs)
          if (run.length > 1)
            outlines.push({ type: "Feature", properties: { c: own }, geometry: { type: "LineString", coordinates: flip ? run.slice().reverse() : run } })
      })
  })
  return {
    borders: { type: "MultiLineString", coordinates: borders },
    kinds: { type: "MultiLineString", coordinates: kinds },
    outlines,
  }
}
