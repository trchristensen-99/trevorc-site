// A model forecast that assumed a technology arrives in a given year,
// moved to another year: its effect over its baseline shifts by `by`
// years (the same sum as prep/build.mjs, shiftScenario).

const interp = (pts: [number, number][], x: number) => {
  if (!pts.length) return 0
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + ((x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])) * (pts[i][1] - pts[i - 1][1])
  return pts[pts.length - 1][1]
}

export function shiftScenario(path: [number, number][], base: [number, number][], by: number): [number, number][] {
  if (!by || !path.length) return path
  return path.map(([x]) => {
    const was = x - by
    const effect = was < path[0][0] ? 0 : interp(path, was) - interp(base, was)
    return [x, +(interp(base, x) + effect).toFixed(2)] as [number, number]
  })
}
