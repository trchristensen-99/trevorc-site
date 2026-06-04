#!/usr/bin/env node
// Procedural builder for the "forest-clearing" cycling scene.
// Output: quartz/static/canvascycle/forest-clearing.js — a JS-evalable
// object literal in the same shape the canvasCycle engine expects:
//
//   { width, height, colors:[[r,g,b]...256], cycles:[{rate,reverse,low,high}...],
//     pixels:[index...width*height] }
//
// Rate convention from Joe Huckaby's engine: rate=280 means one palette
// step per second. Lower rates are slower; rate=0 disables the cycle.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const W = 640
const H = 480

// ---------- Palette ----------
//
//   0-15   utility / shadow tones
//   16-31  SKY DRIFT cycle (the only animated range in v1)
//   32-47  upper sky (deep blue → mid blue)
//   48-63  horizon glow band
//   64-79  distant mountains
//   80-95  midground hills
//   96-111 distant tree line (reserved, unused in v1)
//   112-127 foreground tree leaves
//   128-143 foreground tree highlights (side-lit)
//   144-159 tree trunks
//   160-175 ground / grass base
//   176-191 ground / grass highlights
//   192-207 ground shadow
//   208-255 reserved (future weather / water / detail layers)
const palette = Array.from({ length: 256 }, () => [0, 0, 0])

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round8 = (v) => clamp(Math.round(v), 0, 255)

function setRange(start, end, fn) {
  const n = end - start + 1
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    const [r, g, b] = fn(t)
    palette[start + i] = [round8(r), round8(g), round8(b)]
  }
}

setRange(0, 15, (t) => [lerp(8, 36, t), lerp(8, 32, t), lerp(10, 40, t)])

// Sky drift cycle. 16 hues forming a closed sinusoidal loop around a
// mid-sky blue. The visible motion comes from these colors rotating
// through positions; the closer they are to identical, the subtler.
setRange(16, 31, (t) => {
  const phase = t * Math.PI * 2
  return [
    140 + 30 * Math.cos(phase),
    175 + 25 * Math.cos(phase + 0.3),
    220 + 18 * Math.cos(phase + 0.6),
  ]
})

setRange(32, 47, (t) => [lerp(58, 130, t), lerp(105, 180, t), lerp(175, 220, t)])
setRange(48, 63, (t) => [lerp(180, 245, t), lerp(180, 215, t), lerp(180, 190, t)])
setRange(64, 79, (t) => [lerp(72, 110, t), lerp(80, 115, t), lerp(110, 145, t)])
setRange(80, 95, (t) => [lerp(45, 80, t), lerp(65, 95, t), lerp(60, 80, t)])
setRange(96, 111, (t) => [lerp(20, 50, t), lerp(50, 80, t), lerp(30, 55, t)])
setRange(112, 127, (t) => [lerp(15, 40, t), lerp(60, 95, t), lerp(22, 48, t)])
setRange(128, 143, (t) => [lerp(45, 90, t), lerp(95, 140, t), lerp(38, 65, t)])
setRange(144, 159, (t) => [lerp(50, 88, t), lerp(34, 60, t), lerp(22, 38, t)])
setRange(160, 175, (t) => [lerp(65, 105, t), lerp(105, 145, t), lerp(50, 80, t)])
setRange(176, 191, (t) => [lerp(110, 160, t), lerp(155, 195, t), lerp(75, 110, t)])
setRange(192, 207, (t) => [lerp(40, 70, t), lerp(70, 105, t), lerp(40, 65, t)])

// ---------- Pixel buffer ----------
const pixels = new Uint8Array(W * H)

const setPx = (x, y, idx) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  pixels[y * W + x] = idx
}

// Simple deterministic RNG so the scene rebuilds byte-identically.
function seededRand(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}
const rnd = seededRand(0xCAFEBABE)

// ---------- Sky bands ----------
// y=0-60     top sky, deep blue gradient
// y=60-180   CLOUD CYCLE BAND — painted with palette indices 16-31 in
//            wide horizontal stripes. When the engine rotates those
//            indices, the stripes drift across the sky.
// y=180-260  middle sky, gentler
// y=260-300  horizon glow
const HORIZON_Y = 300

for (let y = 0; y < 60; y++) {
  const idx = 32 + Math.floor((y / 60) * 15)
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}

const CLOUD_TOP = 60
const CLOUD_BOTTOM = 180
const STRIPE_W = 14
for (let y = CLOUD_TOP; y < CLOUD_BOTTOM; y++) {
  // Slight vertical wobble in stripe boundaries so the bands look like
  // wisps rather than perfectly horizontal lines.
  const wobble = Math.sin((y - CLOUD_TOP) * 0.07) * 9
  for (let x = 0; x < W; x++) {
    const slot = Math.floor((x + wobble) / STRIPE_W)
    const idx = 16 + (((slot % 16) + 16) % 16)
    setPx(x, y, idx)
  }
}

for (let y = 180; y < 260; y++) {
  const t = (y - 180) / 80
  const idx = 32 + Math.floor((1 - t) * 6) + 8
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}

for (let y = 260; y < HORIZON_Y; y++) {
  const t = (y - 260) / (HORIZON_Y - 260)
  const idx = 48 + Math.floor(t * 15)
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}

// ---------- Mountains ----------
// Two layered silhouette ridges below the horizon glow.
function drawRidge(peaks, baseY, idxLo, idxHi) {
  let pi = 0
  for (let x = 0; x < W; x++) {
    while (pi < peaks.length - 1 && x > peaks[pi + 1][0]) pi++
    let topY
    if (pi >= peaks.length - 1) topY = peaks[peaks.length - 1][1]
    else {
      const [ax, ay] = peaks[pi]
      const [bx, by] = peaks[pi + 1]
      const t = (x - ax) / Math.max(1, bx - ax)
      topY = ay + (by - ay) * t
    }
    const topI = Math.round(topY)
    for (let y = topI; y < baseY; y++) {
      const tg = (y - topY) / Math.max(1, baseY - topY)
      setPx(x, y, idxLo + Math.floor(clamp(tg, 0, 1) * (idxHi - idxLo)))
    }
  }
}

drawRidge(
  [[-10, 320], [80, 290], [180, 270], [280, 285], [380, 265], [480, 290], [560, 275], [650, 300]],
  HORIZON_Y + 50,
  64,
  78,
)
drawRidge(
  [[-10, 350], [60, 330], [140, 305], [240, 318], [340, 295], [440, 320], [520, 305], [600, 325], [650, 340]],
  HORIZON_Y + 90,
  80,
  94,
)

// ---------- Ground ----------
for (let y = HORIZON_Y + 90; y < H; y++) {
  const t = (y - (HORIZON_Y + 90)) / (H - (HORIZON_Y + 90))
  const idx = 160 + Math.floor(t * 15)
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}

// Stipple grass highlights on the foreground
for (let i = 0; i < 8000; i++) {
  const x = Math.floor(rnd() * W)
  const y = Math.floor(HORIZON_Y + 100 + rnd() * (H - HORIZON_Y - 100))
  const blades = 1 + Math.floor(rnd() * 3)
  for (let k = 0; k < blades; k++) {
    setPx(x, y - k, 176 + Math.floor(rnd() * 15))
  }
}

// ---------- Trees ----------
// Stacked-triangle conifers, side-lit (left half brighter highlights,
// right half darker leaf shade). Placed only on the far left and far
// right so the center "clearing" stays open — the article column will
// sit there. None reach above y ≈ 200 so the cloud cycle band (60-180)
// stays unobscured on the visible side strips.
function drawConifer(cx, baseY, height) {
  const trunkH = Math.max(8, Math.floor(height * 0.18))
  const trunkTopY = baseY - trunkH
  const trunkHW = Math.max(2, Math.floor(height * 0.022))
  for (let y = trunkTopY; y < baseY; y++) {
    for (let x = cx - trunkHW; x <= cx + trunkHW; x++) {
      setPx(x, y, 152)
    }
  }

  const leavesH = height - trunkH
  const layers = 5
  for (let L = 0; L < layers; L++) {
    const layerCenterY = trunkTopY - L * (leavesH / layers) * 0.85
    const layerHeight = leavesH * (0.28 + 0.04 * (layers - L))
    const widthBase = height * 0.17 * (1 - L * 0.13)
    for (let dy = 0; dy < layerHeight; dy++) {
      const y = Math.round(layerCenterY - dy)
      const t = dy / Math.max(1, layerHeight - 1)
      const hw = widthBase * t
      for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
        const rel = (x - (cx - hw)) / Math.max(1, hw * 2)
        const idx =
          rel < 0.45
            ? 128 + Math.floor(rel * 33)
            : 112 + Math.floor((rel - 0.45) * 27)
        setPx(x, y, idx)
      }
    }
  }
}

// Left-side cluster
const left = [
  [22, H - 16, 230],
  [62, H - 8, 200],
  [12, H - 50, 175],
  [92, H - 24, 165],
  [50, H - 60, 140],
]
// Right-side cluster (mirrored)
const right = left.map(([cx, by, h]) => [W - cx, by, h])

for (const [cx, by, h] of left) drawConifer(cx, by, h)
for (const [cx, by, h] of right) drawConifer(cx, by, h)

// ---------- Cycles ----------
// One animated range in v1: the sky drift. Empty slots kept so the
// runtime engine sees a familiar shape, but they're inert.
const cycles = [
  { reverse: 0, rate: 140, low: 16, high: 31 },
  { reverse: 0, rate: 0, low: 0, high: 0 },
  { reverse: 0, rate: 0, low: 0, high: 0 },
  { reverse: 0, rate: 0, low: 0, high: 0 },
  { reverse: 0, rate: 0, low: 0, high: 0 },
  { reverse: 0, rate: 0, low: 0, high: 0 },
  { reverse: 0, rate: 0, low: 0, high: 0 },
  { reverse: 0, rate: 0, low: 0, high: 0 },
]

const scene = {
  filename: "forest-clearing.js",
  width: W,
  height: H,
  colors: palette,
  cycles,
  pixels: Array.from(pixels),
}

const outPath = path.resolve(
  __dirname,
  "..",
  "..",
  "quartz",
  "static",
  "canvascycle",
  "forest-clearing.js",
)
fs.writeFileSync(outPath, JSON.stringify(scene))
console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`)
