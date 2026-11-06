// The time axis, matching prep/build.mjs: logarithmic in distance from
// now, compressed twice as hard beyond about 12,000 years ago and beyond
// 2150.

import type { Tree } from "./types"

export function timeScale(tree: Tree) {
  const { now, width } = tree.meta
  const { tau, deep, futureGain, uMin, uMax } = tree.meta.time
  const far = tree.meta.time.far ?? Infinity
  const u = (year: number) => {
    const d = year - now
    if (d >= 0) {
      const v = futureGain * Math.log10(1 + d / tau)
      return v > far ? far + (v - far) * 0.5 : v
    }
    let v = Math.log10(1 + -d / tau)
    if (v > deep) v = deep + (v - deep) * 0.5
    return -v
  }
  const x = (year: number) => ((u(year) - uMin) / (uMax - uMin)) * width
  // The year at a position, for the future (from now on).
  const year = (px: number) => {
    let v = (px / width) * (uMax - uMin) + uMin
    if (v > far) v = far + (v - far) * 2
    return v <= 0 ? now : now + tau * (10 ** (v / futureGain) - 1)
  }
  return { x, year }
}

const fmt = (n: number) => n.toLocaleString("en-US")

// "3.3 million years ago", "40,000 years ago", "3200 BC", "1947".
export function yearLabel(y: number, now: number) {
  const ago = now - y
  if (ago >= 1e6) return `${+(ago / 1e6).toFixed(1)} million years ago`
  if (ago >= 12000) return `${fmt(Math.round(ago / 1000) * 1000)} years ago`
  if (y < 0) return `${fmt(Math.round(-y))} BC`
  if (y < 1000) return `AD ${Math.max(1, Math.round(y))}`
  return String(Math.round(y))
}

export function dateLabel(from: number, to: number, at: number, now: number, speculative: boolean) {
  if (from === to) return yearLabel(from, now)
  if (speculative || from > now - 1) {
    // 3000 stands for "not by 3000" in your own dates.
    const y = (v: number) => (v >= 3000 ? "after 3000" : String(Math.round(v)))
    if (from >= 3000) return "after 3000"
    return `${y(from)} to ${y(to)} (best guess ${y(at)})`
  }
  if (now - from >= 12000) {
    // Ranges in the deep past read best in one unit.
    const big = now - from >= 1e6
    const f = (y: number) => (big ? +((now - y) / 1e6).toFixed(1) : fmt(Math.round((now - y) / 1000) * 1000))
    return `${f(from)} to ${f(to)} ${big ? "million " : ""}years ago`
  }
  return `${yearLabel(from, now)} to ${yearLabel(to, now)}`
}
