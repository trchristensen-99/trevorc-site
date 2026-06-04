// Minimal color-cycling engine. Inspired by Joseph Huckaby's
// CanvasCycle (LGPL 3.0), reduced to the parts needed to display one
// scene as background decor. The scene file is the JS object-literal
// format used by his lbm2json converter:
//   { width, height, colors:[[r,g,b]...256], cycles:[{rate,low,high,reverse}...], pixels:[...] }
// rate is in units where 280 = 1 step / second (matching DPaint).
//
// Activated whenever <html data-decor="cycle"> AND a <canvas class="decor-canvas">
// exists in the document. Cleans up its RAF on SPA nav.

type RGB = [number, number, number]
interface Scene {
  width: number
  height: number
  colors: RGB[]
  cycles: { rate: number; reverse: number; low: number; high: number }[]
  pixels: number[]
}

let scene: Scene | null = null
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let imageData: ImageData | null = null
let cyclablePixels: number[] = []
let startTime = 0
let rafId = 0
let currentSceneUrl: string | null = null

const SCENE_URL = "/static/canvascycle/forest-clearing.js"

async function loadScene(url: string): Promise<Scene | null> {
  try {
    const res = await fetch(url)
    const text = await res.text()
    // The file is a JS object literal, not strict JSON (unquoted keys).
    // new Function safely parses it in the script's own scope.
    return new Function(`return ${text}`)() as Scene
  } catch (err) {
    console.warn("canvasCycle: failed to load scene", err)
    return null
  }
}

function precomputeCyclable(s: Scene): number[] {
  // Index of every pixel whose palette slot lives inside a cycle range,
  // so we only rewrite those pixels each frame instead of the whole image.
  const cyclable = new Uint8Array(256)
  for (const c of s.cycles) {
    if (c.rate === 0 || c.high <= c.low) continue
    for (let i = c.low; i <= c.high; i++) cyclable[i] = 1
  }
  const idx: number[] = []
  for (let i = 0; i < s.pixels.length; i++) {
    if (cyclable[s.pixels[i]]) idx.push(i)
  }
  return idx
}

function setupCanvas(s: Scene) {
  if (!canvas) return
  canvas.width = s.width
  canvas.height = s.height
  ctx = canvas.getContext("2d")
  if (!ctx) return
  imageData = ctx.createImageData(s.width, s.height)
  const data = imageData.data
  // Paint the static (non-cycling) pixels once.
  for (let i = 0; i < s.pixels.length; i++) {
    const c = s.colors[s.pixels[i]]
    const o = i * 4
    data[o] = c[0]
    data[o + 1] = c[1]
    data[o + 2] = c[2]
    data[o + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
}

function tick() {
  if (!scene || !ctx || !imageData) return
  const s = scene
  const elapsed = performance.now() - startTime

  // Build a per-frame palette by rotating each cycle range with
  // BlendShift interpolation: instead of snapping to integer palette
  // positions every step, we lerp between adjacent positions using the
  // fractional part of the shift. The cycling looks like a smooth
  // gradient drift rather than a stepped flicker.
  const palette: RGB[] = s.colors.slice()
  for (const c of s.cycles) {
    if (c.rate === 0 || c.high <= c.low) continue
    const len = c.high - c.low + 1
    const stepsPerMs = c.rate / 280 / 1000
    const totalShift = elapsed * stepsPerMs
    const shift = Math.floor(totalShift) % len
    const frac = totalShift - Math.floor(totalShift)
    const dir = c.reverse === 2 ? -1 : 1
    for (let i = 0; i < len; i++) {
      let srcA = i - shift * dir
      srcA = ((srcA % len) + len) % len
      let srcB = srcA - dir
      srcB = ((srcB % len) + len) % len
      const a = s.colors[c.low + srcA]
      const b = s.colors[c.low + srcB]
      palette[c.low + i] = [
        Math.round(a[0] + (b[0] - a[0]) * frac),
        Math.round(a[1] + (b[1] - a[1]) * frac),
        Math.round(a[2] + (b[2] - a[2]) * frac),
      ]
    }
  }

  // Repaint only the cyclable pixels.
  const data = imageData.data
  for (const i of cyclablePixels) {
    const c = palette[s.pixels[i]]
    const o = i * 4
    data[o] = c[0]
    data[o + 1] = c[1]
    data[o + 2] = c[2]
  }
  ctx.putImageData(imageData, 0, 0)

  rafId = requestAnimationFrame(tick)
}

function stop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

function ensureCanvas(): HTMLCanvasElement {
  // Always live as a direct child of <body>, so it isn't trapped inside
  // a transformed ancestor's stacking/containing context (e.g. the
  // sticky top-bar). Move or create as needed.
  let c = document.querySelector<HTMLCanvasElement>("canvas.decor-canvas")
  if (c && c.parentElement !== document.body) {
    c.remove()
    c = null
  }
  if (!c) {
    c = document.createElement("canvas")
    c.className = "decor-canvas"
    c.setAttribute("aria-hidden", "true")
    document.body.appendChild(c)
  }
  return c
}

async function start() {
  stop()
  canvas = ensureCanvas()
  const mode = document.documentElement.getAttribute("data-decor")
  if (mode !== "cycle") {
    canvas.style.display = "none"
    return
  }
  canvas.style.display = ""

  // Avoid refetching the same scene on every nav.
  if (!scene || currentSceneUrl !== SCENE_URL) {
    scene = await loadScene(SCENE_URL)
    currentSceneUrl = SCENE_URL
    if (!scene) return
    cyclablePixels = precomputeCyclable(scene)
  }
  setupCanvas(scene)
  startTime = performance.now()
  tick()
}

function onDecorChange() {
  start()
}

// React to settings changes on html (data-decor attribute).
const mo = new MutationObserver((records) => {
  for (const r of records) {
    if (r.attributeName === "data-decor") {
      onDecorChange()
      return
    }
  }
})
mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-decor"] })

document.addEventListener("nav", () => {
  start()
  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => stop())
  }
})

if (document.readyState !== "loading") start()
else document.addEventListener("DOMContentLoaded", start, { once: true })
