// Cities and capitals for the map's own city layer, from Natural Earth's
// populated places (public domain) and capitals.json.

import fs from "node:fs"
import * as turf from "@turf/turf"
import { feature as topoFeature } from "topojson-client"

// Cities: Natural Earth's populated places, each given to whoever controls
// the ground it's on, with each controller's capital marked. A controller's
// population is estimated from Natural Earth's country populations, split
// by the share of each country's city population it holds (so Houthi-held
// Yemen gets most of Yemen's people, and Russia some of Ukraine's).
export function buildCities({ places: allPlaces, countries, entities: entitiesOut, controllers, hiFile, curatedCaps, out, warn }) {
  const cities = []
  const hiTopo = JSON.parse(fs.readFileSync(hiFile, "utf8"))
  const hiControl = topoFeature(hiTopo, hiTopo.objects.control).features.filter((f) => f.properties.c !== "none").map((f) => ({ f, bb: turf.bbox(f) }))
  const controllerAt = (pt) => hiControl.find(({ f, bb }) => pt[0] >= bb[0] && pt[0] <= bb[2] && pt[1] >= bb[1] && pt[1] <= bb[3] && turf.booleanPointInPolygon(pt, f))?.f.properties.c ?? null
  const SKIP = new Set(["Scientific station", "Meteorological Station", "Historic place"])
  const places = allPlaces.filter((f) => !SKIP.has(f.properties.FEATURECLA))
  // Names Natural Earth (v5.1) still has from before a rename.
  const RENAMED = { "Nur-Sultan": "Astana", Odessa: "Odesa", Allahabad: "Prayagraj", Gurgaon: "Gurugram", Kirovohrad: "Kropyvnytskyi" }
  for (const f of places) {
    const p = f.properties
    const at = f.geometry.coordinates.map((x) => +x.toFixed(3))
    // A coastal city the simplified coast leaves at sea stays with its
    // country.
    const c = controllerAt(at) ?? (entitiesOut[p.ADM0_A3]?.km2 ? p.ADM0_A3 : null)
    const name = p.NAME_EN || p.NAME
    cities.push({ name: RENAMED[name] ?? name, names: [p.NAME, p.NAME_EN, p.NAMEASCII], at, pop: Math.max(0, p.POP_MAX ?? 0), mz: +(p.MIN_ZOOM ?? 6), c, ne: p.ADM0_A3, cls: p.FEATURECLA, official: p.ADM0CAP === 1 })
  }
  // Populations: country totals split by city population held.
  const popEst = Object.fromEntries(countries.map((f) => [f.properties.ADM0_A3, Number(f.properties.POP_EST) || 0]))
  const held = {}, total = {}
  for (const x of cities) {
    if (!x.c) continue
    total[x.ne] = (total[x.ne] ?? 0) + x.pop
    ;(held[x.c] ??= {})[x.ne] = (held[x.c][x.ne] ?? 0) + x.pop
  }
  for (const c of controllers) {
    let pop = 0
    for (const [ne_, h] of Object.entries(held[c] ?? {})) if (total[ne_] > 0) pop += (popEst[ne_] ?? 0) * (h / total[ne_])
    // A country none of whose cities are held by anyone keeps its own total.
    if (!held[c] && popEst[c]) pop = popEst[c]
    if (entitiesOut[c]) entitiesOut[c].pop = Math.round(pop)
  }
  // Capitals: curated seats first, then Natural Earth's national capitals
  // (and regional capitals held by someone other than their country, like
  // Sukhumi) for whoever holds them, unless that holder already has one.
  const capitalOf = {}
  for (const [c, cap] of Object.entries(curatedCaps)) {
    if (!entitiesOut[c]) { warn(`capitals.json: unknown entity ${c}`); continue }
    const holder = controllerAt(cap.at)
    if (holder !== c) warn(`capitals.json: ${cap.name} is held by ${holder}, not ${c}`)
    // The same place by name within 15 km (Natural Earth's point can sit a
    // little off); otherwise a point of its own.
    const near = cities.filter((x) => !x.cap && (x.names ?? [x.name]).includes(cap.name) && turf.distance(x.at, cap.at) < 15)[0]
    if (near) { near.cap = c; near.c = holder ?? near.c }
    else cities.push({ name: cap.name, at: cap.at, pop: 0, mz: 6, c: holder ?? c, cap: c })
    capitalOf[c] = cap.name
  }
  // Natural Earth's capitals (ADM0CAP, which its feature classes don't
  // always agree with) and regional capitals held by someone other than
  // their country, like Sukhumi, go to whoever holds them; a curated seat
  // replaces them for its entity.
  for (const x of cities) {
    if (!x.c || x.cap || curatedCaps[x.c]) continue
    const deFacto = ["de facto state", "armed group"].includes(entitiesOut[x.c]?.kind)
    if (x.official || (x.cls === "Admin-0 region capital" && x.c !== x.ne && deFacto)) {
      x.cap = x.c
      capitalOf[x.c] ??= x.name
    }
  }
  // Where the flag is missing (Juba), the largest place Natural Earth
  // classes as a national capital.
  for (const x of [...cities].sort((a, b) => b.pop - a.pop)) {
    if (!x.c || x.cap || capitalOf[x.c] || x.cls !== "Admin-0 capital") continue
    x.cap = x.c
    capitalOf[x.c] = x.name
  }
  const noCapital = Object.entries(entitiesOut).filter(([c, e]) => e.km2 && (e.kind === "state" || e.kind === "de facto state") && !capitalOf[c]).map(([c]) => c)
  if (noCapital.length) console.log(`states without a capital: ${noCapital.join(" ")}`)
  // [name, lon, lat, population, the zoom it appears from, controller, capital (1) or not]
  fs.writeFileSync(out, JSON.stringify(cities.map((x) => [x.name, x.at[0], x.at[1], x.pop, x.mz, x.c ?? "", x.cap ? 1 : 0])))
  console.log(`cities: ${cities.length}, ${Object.keys(capitalOf).length} capitals`)
}
