// Site art renderer: paints a background scene behind the page using
// freely-licensed pixel-art landscapes from itch.io artists. The
// manifest (/static/site-art/manifest.json) describes themes, their
// time-of-day timelines, weather variants, the seasonal mapping, and
// any date-window specials (e.g. Halloween).
//
// Rendering uses two stacked <img> elements anchored to the bottom of
// the viewport. State transitions (time-of-day band changes, weather
// rolls, theme changes from settings) crossfade the inactive image to
// the new src over CROSSFADE_MS. Re-evaluation runs every TICK_MS so
// time bands shift in the background without user interaction.

const MANIFEST_URL = "/static/site-art/manifest.json"
const TICK_MS = 30 * 1000
const CROSSFADE_MS = 12000

interface Band {
  name: string
  fromHour: number
  toHour: number
  isDaytime: boolean
}
interface TimelineEntry {
  src: string
  artist: string
}
interface WeatherVariant extends TimelineEntry {
  appliesTo: string[]
}
interface DiurnalTheme {
  label: string
  type: "diurnal"
  timeline: Record<string, TimelineEntry>
  weather?: Record<string, WeatherVariant>
}
interface SeasonalStaticTheme {
  label: string
  type: "seasonal_static"
  variants: Record<string, TimelineEntry>
  monthsToVariant: Record<string, string>
}
type Theme = DiurnalTheme | SeasonalStaticTheme
interface SeasonalRule {
  fromMonthDay: string
  toMonthDay: string
  theme: string
}
interface Special {
  fromMonthDay: string
  toMonthDay: string
  appliesTo: string[]
  src: string
  artist: string
}
interface Manifest {
  version: number
  basePath: string
  bands: Band[]
  themes: Record<string, Theme>
  specials: Record<string, Special>
  seasonal: Record<"north" | "south", SeasonalRule[]>
  artists: Record<string, { name: string; url: string }>
}

let manifest: Manifest | null = null
let manifestPromise: Promise<Manifest | null> | null = null
let imgA: HTMLImageElement | null = null
let imgB: HTMLImageElement | null = null
let activeSlot: "a" | "b" = "a"
let currentSrc = ""
let tickTimer: number | null = null

function ensureContainer() {
  if (imgA && imgA.isConnected && imgB && imgB.isConnected) return
  // Remove any leftover from prior nav
  document.querySelectorAll("img.site-art-frame").forEach((el) => el.remove())
  imgA = document.createElement("img")
  imgB = document.createElement("img")
  for (const img of [imgA, imgB]) {
    img.className = "site-art-frame"
    img.setAttribute("aria-hidden", "true")
    img.style.opacity = "0"
    img.alt = ""
    document.body.appendChild(img)
  }
  activeSlot = "a"
  currentSrc = ""
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
function monthDay(date: Date): string {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}
function inDateRange(date: Date, fromMD: string, toMD: string): boolean {
  const md = monthDay(date)
  // toMD is exclusive; wraps the calendar year if fromMD > toMD
  if (fromMD <= toMD) return md >= fromMD && md < toMD
  return md >= fromMD || md < toMD
}

function pickBand(now: Date, bands: Band[]): Band {
  const h = now.getHours() + now.getMinutes() / 60
  for (const b of bands) {
    if (b.toHour <= 24) {
      if (h >= b.fromHour && h < b.toHour) return b
    } else {
      // Wraps midnight (e.g. 20.5 → 29.5 means 20.5–05.5)
      const wrappedTo = b.toHour - 24
      if (h >= b.fromHour || h < wrappedTo) return b
    }
  }
  return bands[0]
}

// Solar-aware band shifting: in summer, mornings start earlier and
// evenings stretch later; in winter, the opposite. The amplitude
// approximates a ~6-hour summer/winter day-length spread (roughly
// mid-latitude — 40–45° — without doing a real sunrise/sunset calc).
//
// shift returns +1 at the local summer solstice, -1 at the winter
// solstice, 0 at the equinoxes, smoothly cosine-interpolated.
const SOLAR_SHIFT_AMPLITUDE_HOURS = 1.5
const NOON_HOUR = 11.5

function dayOfYear(date: Date): number {
  const startUtc = Date.UTC(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - startUtc) / 86400000)
}

function seasonalShift(date: Date, hemisphere: "north" | "south"): number {
  // Northern summer solstice ≈ day 172 (Jun 21), Southern ≈ day 355 (Dec 21).
  const solsticeDay = hemisphere === "north" ? 172 : 355
  return Math.cos((2 * Math.PI * (dayOfYear(date) - solsticeDay)) / 365.25)
}

function adjustEdge(h: number, shift: number): number {
  // Morning-side edges (those landing before our nominal noon, plus
  // the wrapping end-of-night which is "tomorrow morning") shift
  // *earlier* in summer and *later* in winter. Evening-side edges
  // shift *later* in summer and *earlier* in winter.
  const delta = shift * SOLAR_SHIFT_AMPLITUDE_HOURS
  const isMorningSide = h < NOON_HOUR || h > 24
  return isMorningSide ? h - delta : h + delta
}

function dynamicBands(staticBands: Band[], date: Date, hemisphere: "north" | "south"): Band[] {
  const shift = seasonalShift(date, hemisphere)
  return staticBands.map((b) => ({
    ...b,
    fromHour: adjustEdge(b.fromHour, shift),
    toHour: adjustEdge(b.toHour, shift),
  }))
}

// Tiny deterministic hash for daily weather rolls (no flicker across reloads).
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const WEATHER_CHANCE: Record<string, number> = {
  off: 0,
  low: 0.15,
  medium: 0.25,
  high: 0.4,
  always: 1.0,
}

function pickHemisphere(setting: string): "north" | "south" {
  if (setting === "north" || setting === "south") return setting
  // Auto: very light heuristic from the timezone string. Default north.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    const southHints = [
      "Australia/",
      "Pacific/Auckland",
      "Pacific/Fiji",
      "America/Argentina",
      "America/Sao_Paulo",
      "America/Santiago",
      "Africa/Johannesburg",
      "Antarctica/",
    ]
    if (southHints.some((p) => tz.startsWith(p))) return "south"
  } catch (_e) {
    /* swallow */
  }
  return "north"
}

function pickSeasonalTheme(date: Date, hemisphere: "north" | "south", m: Manifest): string {
  const rules = m.seasonal[hemisphere]
  for (const rule of rules) {
    if (inDateRange(date, rule.fromMonthDay, rule.toMonthDay)) return rule.theme
  }
  return rules[0].theme
}

function pickWeather(theme: Theme, band: Band, chanceSetting: string, date: Date): string | null {
  if (theme.type !== "diurnal" || !theme.weather) return null
  const eligible = Object.entries(theme.weather).filter(([_, w]) =>
    w.appliesTo.includes(band.name),
  )
  if (!eligible.length) return null
  const chance = WEATHER_CHANCE[chanceSetting] ?? 0
  if (chance === 0) return null
  // Deterministic per day + theme so the weather doesn't flicker on reload.
  const seed = `${theme.label}|${date.getFullYear()}|${date.getMonth()}|${date.getDate()}`
  const r0 = (fnv1a(seed) % 1000) / 1000
  if (r0 >= chance) return null
  const idx = fnv1a(seed + "|pick") % eligible.length
  return eligible[idx][0]
}

function pickSrc(
  themeName: string,
  band: Band,
  weatherKey: string | null,
  date: Date,
  m: Manifest,
): string | null {
  if (themeName === "none") return null

  // Specials (e.g. Halloween night) — checked before theme lookup so they win.
  for (const sp of Object.values(m.specials)) {
    if (inDateRange(date, sp.fromMonthDay, sp.toMonthDay) && sp.appliesTo.includes(band.name)) {
      return sp.src
    }
  }

  const theme = m.themes[themeName]
  if (!theme) return null

  if (theme.type === "seasonal_static") {
    const monthKey = String(date.getMonth() + 1)
    const variantKey = theme.monthsToVariant[monthKey] || Object.keys(theme.variants)[0]
    const entry = theme.variants[variantKey]
    return entry ? entry.src : null
  }

  if (weatherKey && theme.weather && theme.weather[weatherKey]) {
    return theme.weather[weatherKey].src
  }
  const entry = theme.timeline[band.name]
  return entry ? entry.src : null
}

interface Settings {
  artTheme: string
  hemisphere: string
  weatherChance: string
}
function readSettings(): Settings {
  try {
    const raw = localStorage.getItem("trevorc-settings-v1")
    if (!raw) return { artTheme: "none", hemisphere: "auto", weatherChance: "medium" }
    const parsed = JSON.parse(raw)
    return {
      artTheme: parsed.artTheme ?? "none",
      hemisphere: parsed.hemisphere ?? "auto",
      weatherChance: parsed.weatherChance ?? "medium",
    }
  } catch {
    return { artTheme: "none", hemisphere: "auto", weatherChance: "medium" }
  }
}

function fadeBlank() {
  if (imgA) imgA.style.opacity = "0"
  if (imgB) imgB.style.opacity = "0"
  currentSrc = ""
}

function loadImage(img: HTMLImageElement, src: string): Promise<void> {
  return new Promise((resolve) => {
    if (img.src.endsWith(src) && img.complete) {
      resolve()
      return
    }
    const onload = () => {
      img.removeEventListener("load", onload)
      img.removeEventListener("error", onerror)
      resolve()
    }
    const onerror = () => {
      img.removeEventListener("load", onload)
      img.removeEventListener("error", onerror)
      resolve()
    }
    img.addEventListener("load", onload)
    img.addEventListener("error", onerror)
    img.src = src
  })
}

async function crossfadeTo(src: string) {
  if (!imgA || !imgB) return
  if (src === currentSrc) return
  const next = activeSlot === "a" ? imgB : imgA
  const prev = activeSlot === "a" ? imgA : imgB
  await loadImage(next, src)
  next.style.opacity = "1"
  prev.style.opacity = "0"
  activeSlot = activeSlot === "a" ? "b" : "a"
  currentSrc = src
}

async function tick() {
  if (!manifest) return
  ensureContainer()
  const settings = readSettings()
  if (settings.artTheme === "none") {
    fadeBlank()
    return
  }
  const hemi = pickHemisphere(settings.hemisphere)
  let themeName = settings.artTheme
  if (themeName === "seasonal") themeName = pickSeasonalTheme(new Date(), hemi, manifest)
  const bands = dynamicBands(manifest.bands, new Date(), hemi)
  const band = pickBand(new Date(), bands)
  const theme = manifest.themes[themeName]
  const weatherKey = theme ? pickWeather(theme, band, settings.weatherChance, new Date()) : null
  const srcRel = pickSrc(themeName, band, weatherKey, new Date(), manifest)
  if (!srcRel) {
    fadeBlank()
    return
  }
  await crossfadeTo(`${manifest.basePath}/${srcRel}`)
}

async function ensureManifest(): Promise<Manifest | null> {
  if (manifest) return manifest
  if (manifestPromise) return manifestPromise
  manifestPromise = fetch(MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      manifest = m as Manifest | null
      return manifest
    })
    .catch(() => null)
  return manifestPromise
}

async function start() {
  ensureContainer()
  await ensureManifest()
  if (!manifest) return
  await tick()
  if (tickTimer) window.clearInterval(tickTimer)
  tickTimer = window.setInterval(tick, TICK_MS)
  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      if (tickTimer) {
        window.clearInterval(tickTimer)
        tickTimer = null
      }
    })
  }
}

document.addEventListener("nav", start)
document.addEventListener("site-art-changed", () => {
  tick()
})
if (document.readyState !== "loading") start()
else document.addEventListener("DOMContentLoaded", start, { once: true })
