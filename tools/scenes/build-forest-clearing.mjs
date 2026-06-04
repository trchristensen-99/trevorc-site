#!/usr/bin/env node
// Procedural builder for the "forest-clearing" cycling scene.
// Output: quartz/static/canvascycle/forest-clearing.js
//
// Format matches the canvasCycle engine:
//   { width, height, colors:[[r,g,b]...256], cycles:[{rate,reverse,low,high}...],
//     pixels:[index...width*height] }
//
// Rate convention from Joe Huckaby's engine: rate=280 = 1 palette step
// per second. With the new BlendShift interpolation on the engine side
// the visible motion is smooth at any rate; rate now controls how fast
// the gradient drifts, not whether it steps.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Wide aspect for side coverage. Pulled in from 1920 so the tree
// clusters aren't washed off the visible side strips under
// object-fit: cover scaling, and the central clearing is tighter.
const W = 1440
const H = 720

// ---------- Palette (256 slots) ----------
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

// Layout (kept symbolic for ease of future weather/time-of-day layers).
//  0-15    utility / deep shadow tones
//  16-47   CLOUD CYCLE (32 colors instead of 16 — longer loop, more drift)
//  48-63   upper sky gradient (deep blue → mid blue)
//  64-79   horizon glow band (warm)
//  80-95   distant mountains (cool purple-blue)
//  96-111  midground hills
//  112-127 distant tree line (reserved)
//  128-143 foreground tree foliage (cool / shadow side)
//  144-159 foreground tree foliage (highlight / lit side)
//  160-175 tree trunks
//  176-191 ground grass base
//  192-207 ground grass highlights
//  208-223 ground shadow tones
//  224-255 reserved
setRange(0, 15, (t) => [lerp(6, 36, t), lerp(6, 32, t), lerp(8, 40, t)])

// Cloud cycle: 32 entries forming a soft gradient between sky-blue and
// near-white. Painted as cloud-shaped patches in the scene rather than
// stripes, so the rotation reads as the cloud's color slowly migrating
// across its silhouette — i.e. the cloud drifting.
setRange(16, 47, (t) => {
  // First two-thirds: ramp from sky-blue toward off-white.
  // Last third: ease back to sky-blue, closing the loop seamlessly.
  let mix
  if (t < 2 / 3) mix = t / (2 / 3) // 0 → 1
  else mix = 1 - (t - 2 / 3) / (1 / 3) // 1 → 0
  const eased = 0.5 - 0.5 * Math.cos(mix * Math.PI) // smoothstep
  return [
    lerp(150, 244, eased),
    lerp(185, 248, eased),
    lerp(225, 253, eased),
  ]
})

setRange(48, 63, (t) => [lerp(58, 130, t), lerp(105, 180, t), lerp(175, 220, t)])
setRange(64, 79, (t) => [lerp(180, 245, t), lerp(180, 215, t), lerp(180, 190, t)])
setRange(80, 95, (t) => [lerp(72, 110, t), lerp(80, 115, t), lerp(110, 145, t)])
setRange(96, 111, (t) => [lerp(45, 80, t), lerp(65, 95, t), lerp(60, 80, t)])
setRange(112, 127, (t) => [lerp(20, 50, t), lerp(50, 80, t), lerp(30, 55, t)])
setRange(128, 143, (t) => [lerp(15, 40, t), lerp(58, 92, t), lerp(22, 48, t)])
setRange(144, 159, (t) => [lerp(45, 95, t), lerp(95, 145, t), lerp(38, 68, t)])
setRange(160, 175, (t) => [lerp(40, 90, t), lerp(28, 62, t), lerp(18, 38, t)])
setRange(176, 191, (t) => [lerp(65, 105, t), lerp(105, 145, t), lerp(50, 80, t)])
setRange(192, 207, (t) => [lerp(110, 160, t), lerp(155, 195, t), lerp(75, 110, t)])
setRange(208, 223, (t) => [lerp(40, 70, t), lerp(70, 105, t), lerp(40, 65, t)])

// ---------- Pixel buffer ----------
const pixels = new Uint8Array(W * H)
const setPx = (x, y, idx) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  pixels[y * W + x] = idx
}

function seededRand(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}
const rnd = seededRand(0xCAFEBABE)

// Value-noise: smooth pseudo-random field in [0,1]. Used for organic
// silhouette perturbation and trunk/foliage texture.
function valueNoise(seed) {
  const grid = new Map()
  const get = (xi, yi) => {
    const k = xi * 73856093 ^ yi * 19349663 ^ seed
    if (!grid.has(k)) {
      let s = (k >>> 0) || 1
      s = (s * 1664525 + 1013904223) >>> 0
      grid.set(k, s / 0x100000000)
    }
    return grid.get(k)
  }
  return (x, y, freq) => {
    const xi = Math.floor(x / freq)
    const yi = Math.floor(y / freq)
    const xf = (x / freq) - xi
    const yf = (y / freq) - yi
    const a = get(xi, yi)
    const b = get(xi + 1, yi)
    const c = get(xi, yi + 1)
    const d = get(xi + 1, yi + 1)
    const sx = xf * xf * (3 - 2 * xf)
    const sy = yf * yf * (3 - 2 * yf)
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy)
  }
}
const trunkNoise = valueNoise(0xBADF00D)
const leafNoise = valueNoise(0xC0FFEE)
const cloudNoise = valueNoise(0xDEADBEEF)
const ridgeNoise = valueNoise(0x1337C0DE)

// ---------- Sky ----------
// y=0..200      upper sky deep gradient
// y=200..420    cloud cycle region (painted with idx 16-47 inside cloud
//               silhouettes; ambient sky everywhere else)
// y=420..540    mid sky → horizon glow
// y=540..580    horizon glow band
const HORIZON_Y = 580

for (let y = 0; y < 200; y++) {
  const idx = 48 + Math.floor((y / 200) * 15)
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}

// Ambient mid-sky fill (later overwritten by cloud blobs).
for (let y = 200; y < 540; y++) {
  const t = (y - 200) / (540 - 200)
  const idx = 48 + Math.floor(lerp(15, 8, t))
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}
for (let y = 540; y < HORIZON_Y; y++) {
  const t = (y - 540) / (HORIZON_Y - 540)
  const idx = 64 + Math.floor(t * 15)
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}

// ---------- Clouds ----------
// Cloud-shaped silhouettes filled with the 32-color cycle range. Each
// pixel inside a cloud picks a cycle index based on its position along
// the cloud's longest axis, so palette rotation makes the bright/dark
// portions of the cloud appear to migrate from one side to the other —
// the visual signature of "drifting" rather than translation. With
// BlendShift on the engine side, adjacent palette colors fade through
// every intermediate, so pixels at cloud edges change one at a time
// rather than in chunks.
function drawCloud(cx, cy, rx, ry, indexOffset) {
  const yStart = Math.max(200, Math.floor(cy - ry))
  const yEnd = Math.min(540, Math.ceil(cy + ry))
  const xStart = Math.max(0, Math.floor(cx - rx))
  const xEnd = Math.min(W, Math.ceil(cx + rx))
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const ex = (x - cx) / rx
      const ey = (y - cy) / ry
      // Cloud silhouette: ellipse plus organic noise mask, flat-bottomed.
      // Shape noise stays (so the outline reads organically), but the
      // along-band assignment below uses a CLEAN function of x only so
      // adjacent pixels get consecutive cycle indices — the prereq for
      // the palette-rotation looking like smooth lateral drift instead
      // of scattered twinkle.
      const inEllipse = ex * ex + ey * ey
      if (inEllipse > 1.05) continue
      const noise = cloudNoise(x * 0.5, y * 0.5, 28) * 0.5
      const top = (y - cy) / ry // -1 at top, +1 at bottom
      const shape = inEllipse - noise + (top > 0.3 ? (top - 0.3) * 0.8 : 0)
      if (shape > 0.85) continue
      // Clean horizontal bands across the cloud: pixel at relative x
      // position p gets cycle slot floor(p * 32). Adjacent pixels share
      // a slot for ~rx*2/32 pixels, then move to the next slot. As the
      // palette rotates one step, the bright/dim positions of the cycle
      // shift one band sideways, which the eye reads as the highlight
      // drifting across the cloud.
      const along = (x - (cx - rx)) / (rx * 2)
      const u = clamp(along, 0, 0.999)
      const cycleIdx = 16 + (((Math.floor(u * 32) + indexOffset) % 32) + 32) % 32
      setPx(x, y, cycleIdx)
    }
  }
}

// Clouds scattered across the sky at varying altitudes, sizes, and
// palette offsets. Positions kept inside the narrower 1440 width.
drawCloud(180, 280, 180, 55, 0)
drawCloud(560, 240, 220, 65, 8)
drawCloud(980, 290, 230, 70, 16)
drawCloud(1280, 250, 170, 55, 24)
drawCloud(320, 390, 170, 50, 4)
drawCloud(760, 410, 200, 55, 12)
drawCloud(1160, 390, 180, 55, 20)

// ---------- Mountains ----------
function drawRidge(peaks, baseY, idxLo, idxHi, noisy) {
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
    if (noisy) topY += (ridgeNoise(x, 0, 12) - 0.5) * 18
    const topI = Math.round(topY)
    for (let y = topI; y < baseY; y++) {
      const tg = (y - topY) / Math.max(1, baseY - topY)
      setPx(x, y, idxLo + Math.floor(clamp(tg, 0, 1) * (idxHi - idxLo)))
    }
  }
}
drawRidge(
  [[-30, 600], [200, 555], [400, 540], [600, 565], [800, 525], [1000, 555], [1200, 540], [1400, 560], [1470, 560]],
  HORIZON_Y + 90,
  80,
  94,
  true,
)
drawRidge(
  [[-30, 660], [160, 625], [360, 600], [560, 615], [760, 590], [960, 615], [1160, 600], [1360, 620], [1470, 625]],
  HORIZON_Y + 140,
  96,
  110,
  true,
)

// ---------- Ground ----------
for (let y = HORIZON_Y + 140; y < H; y++) {
  const t = (y - (HORIZON_Y + 140)) / (H - (HORIZON_Y + 140))
  const idx = 176 + Math.floor(t * 15)
  for (let x = 0; x < W; x++) setPx(x, y, idx)
}
// Grass stipples — much denser, with closer-up blades taller so the
// foreground reads as ground meadow rather than flat green.
for (let i = 0; i < 60000; i++) {
  const x = Math.floor(rnd() * W)
  // Bias y toward the bottom — more blades visible up close than at
  // the back of the clearing.
  const t = Math.pow(rnd(), 0.5)
  const y = Math.floor(HORIZON_Y + 150 + t * (H - HORIZON_Y - 150))
  const blades = 1 + Math.floor(rnd() * (2 + t * 4))
  for (let k = 0; k < blades; k++) {
    setPx(x, y - k, 192 + Math.floor(rnd() * 15))
  }
}

// Occasional darker tufts to break up the green and suggest uneven
// ground.
for (let i = 0; i < 1200; i++) {
  const x = Math.floor(rnd() * W)
  const t = Math.pow(rnd(), 0.4)
  const y = Math.floor(HORIZON_Y + 160 + t * (H - HORIZON_Y - 160))
  const w = 1 + Math.floor(rnd() * 4)
  const h = 1 + Math.floor(rnd() * 3)
  for (let dy = 0; dy < h; dy++) {
    for (let dx = -w; dx <= w; dx++) {
      setPx(x + dx, y - dy, 208 + Math.floor(rnd() * 14))
    }
  }
}

// ---------- Trees ----------
// Conifer: stack of upward-pointing triangles (apex at top, wide base
// at bottom — the correct silhouette for fir / spruce / pine). Each
// triangle's edge is perturbed by value noise so the outline reads as
// branches rather than a clean geometric shape. Trunk and foliage are
// textured the same way.
function drawConifer(cx, baseY, height, seedOffset = 0) {
  const trunkH = Math.max(10, Math.floor(height * 0.18))
  const trunkTopY = baseY - trunkH
  const trunkHW = Math.max(3, Math.floor(height * 0.022))

  // Trunk with noisy bark texture
  for (let y = trunkTopY; y < baseY; y++) {
    for (let x = cx - trunkHW; x <= cx + trunkHW; x++) {
      const n = trunkNoise(x + seedOffset, y, 5)
      const idx = 160 + Math.floor(n * 14)
      setPx(x, y, idx)
    }
  }
  // A few extra vertical bark grooves
  for (let g = -trunkHW + 1; g <= trunkHW - 1; g += 2) {
    for (let y = trunkTopY; y < baseY; y++) {
      const wobble = Math.round((trunkNoise(g, y, 9) - 0.5) * 2)
      setPx(cx + g + wobble, y, 160 + Math.floor(trunkNoise(g, y, 13) * 6))
    }
  }

  // Foliage: 6 stacked triangles, each apex-up. The bottom layer is
  // widest, layers above narrow gradually toward the top of the tree.
  const leavesH = height - trunkH
  const layers = 6
  const stride = leavesH / layers
  for (let L = 0; L < layers; L++) {
    // Each layer's APEX (top) and BASE (bottom).
    const layerApexY = trunkTopY - (L + 1) * stride * 0.92
    const layerBaseY = trunkTopY - L * stride * 0.75
    const layerH = layerBaseY - layerApexY
    // Widest base for the lowest layer, shrinking as we go up.
    const baseWidth = height * 0.21 * (1 - L * 0.11)
    for (let y = Math.floor(layerApexY); y < Math.floor(layerBaseY); y++) {
      // t = 0 at apex (top), 1 at base (bottom) — apex-up triangle.
      const t = (y - layerApexY) / Math.max(1, layerH - 1)
      const irregularity =
        (leafNoise(cx + seedOffset, y + L * 17, 6) - 0.5) * baseWidth * 0.35
      const hw = baseWidth * t + irregularity
      const halfW = Math.max(0, hw)
      for (let x = Math.ceil(cx - halfW); x <= Math.floor(cx + halfW); x++) {
        // Side-lit shading: lighter on the left half (sun from the
        // viewer's left), darker on the right.
        const rel = (x - (cx - halfW)) / Math.max(1, halfW * 2)
        const variance = leafNoise(x + seedOffset, y, 4) * 14
        let idx
        if (rel < 0.45) {
          idx = 144 + Math.floor(rel * 28 + variance)
        } else {
          idx = 128 + Math.floor((rel - 0.45) * 26 + variance)
        }
        setPx(x, y, clamp(idx, 128, 159))
      }
    }
  }
}

// Trees clustered on the far left and far right, staggered in depth.
// Positions tightened in toward the center compared to the 1920-wide
// draft so the cluster fills the side strips on a 16:9 viewport.
const leftCluster = [
  [40, H - 12, 360, 11],
  [110, H - 22, 320, 23],
  [180, H - 8, 340, 41],
  [250, H - 30, 280, 67],
  [320, H - 16, 250, 83],
  [400, H - 26, 220, 95],
  [70, H - 60, 240, 97],
  [200, H - 68, 230, 109],
  [310, H - 70, 200, 131],
  [380, H - 80, 180, 143],
]
const rightCluster = leftCluster.map(([cx, by, h, so]) => [W - cx, by, h, so + 1])

for (const [cx, by, h, so] of leftCluster) drawConifer(cx, by, h, so)
for (const [cx, by, h, so] of rightCluster) drawConifer(cx, by, h, so)

// ---------- Cycles ----------
// One cycle in v1: the cloud range 16-47 (length 32) at a slow rate so
// drift is gentle. With BlendShift engine-side, the visible motion is
// continuous regardless of rate.
const cycles = [
  { reverse: 0, rate: 70, low: 16, high: 47 },
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
