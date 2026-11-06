// The far future as growth in energy use. Shared by the build
// (prep/forecast.mjs, which draws the parameters thousands of times) and
// the app (your own dates, which moves one path). See prep/growth.yaml.
//
// Humanity's power use grows at its historical rate until an industrial
// explosion begins, if one does. Then it doubles in a few years at first,
// and each doubling comes quicker than the last, by a factor, down to a
// floor set by how fast machines can copy themselves. On Earth it stops
// at a cap (waste heat, land); beyond that it grows only in space, from
// the first self-copying industry there, up to the Sun's whole output. Thresholds on the total get their dates
// from the path.

export interface GrowthParams {
  t0: number // year of the latest measurement
  e0: number // power use then, watts
  g0: number // growth a year before any explosion (0.015 is 1.5 percent)
  onset: number // year the explosion begins (Infinity: never)
  first: number // the first doubling time after it begins, years
  shrink: number // each doubling after onset takes this times as long as the last (0 to 1)
  floor: number // the shortest doubling time, years
  earthCap: number // watts Earth can use
  spaceStart: number // year industry in space starts copying itself (Infinity: never)
  spaceSeed: number // its power then, watts
  spaceDoubling: number // its first doubling time, years (it then shrinks as on Earth, if exploding)
  sun: number // the Sun's output, watts
}

export interface Crossing {
  watts?: number // a threshold on total power use
  space?: number // a threshold on power used in space
  growth?: number // a yearly growth rate of the total, sustained for a year (0.3 is 30 percent)
}

const LN2 = Math.log(2)

// Year each crossing is first reached (Infinity if not by `end`), and if
// `years` is given, the total power at each of them into `path`.
export function crossings(p: GrowthParams, list: Crossing[], end = 5000, years: number[] = [], path: number[] = []): number[] {
  const out = list.map(() => Infinity)
  let yi = 0
  let t = p.t0
  let earth = p.e0, space = 0
  // Doubling times now: before the explosion, the historical rate's.
  const pre = LN2 / Math.max(1e-4, p.g0)
  let dEarth = pre
  let dSpace = p.spaceDoubling
  let earthDoublings = 0, spaceDoublings = 0
  let lastTotal = earth, lastT = t
  let started = false
  let left = list.length
  while (t < end && (left > 0 || yi < years.length)) {
    const exploding = t >= p.onset
    if (exploding && !started) { started = true; dEarth = Math.min(dEarth, p.first) }
    const dt = Math.min(1, Math.max(0.01, Math.min(dEarth, space > 0 ? dSpace : Infinity) / 20))
    // Earth.
    if (earth < p.earthCap) {
      const before = earth
      earth = Math.min(p.earthCap, earth * Math.exp((LN2 / dEarth) * dt))
      if (exploding) {
        earthDoublings += Math.log2(earth / before)
        while (earthDoublings >= 1) { earthDoublings -= 1; dEarth = Math.max(p.floor, dEarth * p.shrink) }
      }
    }
    // Space.
    if (t >= p.spaceStart) {
      if (space === 0) {
        space = p.spaceSeed
        // Copying itself as fast as industry on Earth then is, if quicker.
        if (exploding) dSpace = Math.max(p.floor, Math.min(dSpace, dEarth))
      }
      else if (space < p.sun) {
        const before = space
        space = Math.min(p.sun, space * Math.exp((LN2 / dSpace) * dt))
        if (exploding) {
          spaceDoublings += Math.log2(space / before)
          while (spaceDoublings >= 1) { spaceDoublings -= 1; dSpace = Math.max(p.floor, dSpace * p.shrink) }
        }
      }
    }
    t += dt
    const total = earth + space
    while (yi < years.length && years[yi] <= t) path[yi++] = total
    list.forEach((c, i) => {
      if (out[i] !== Infinity) return
      const hit = (c.watts != null && total >= c.watts) || (c.space != null && space >= c.space)
      if (hit) { out[i] = t; left-- }
    })
    // Growth over the last year.
    if (t - lastT >= 1) {
      const g = Math.pow(total / lastTotal, 1 / (t - lastT)) - 1
      list.forEach((c, i) => {
        if (out[i] === Infinity && c.growth != null && g >= c.growth) { out[i] = t; left-- }
      })
      lastTotal = total
      lastT = t
    }
    // Nothing left to grow.
    if (earth >= p.earthCap && (space >= p.sun || p.spaceStart === Infinity)) break
  }
  while (yi < years.length) path[yi++] = earth + space
  return out
}
