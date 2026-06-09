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
interface SingleEntry {
  src: string
  artist: string
}
type TimelineEntry = SingleEntry | SingleEntry[]
interface WeatherVariant extends SingleEntry {
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
  never: 0,
  sometimes: 0.25,
  always: 1.0,
}

// Southern-hemisphere IANA timezone identifiers (or prefixes). Anything
// matching makes hemisphere autodetect resolve to "south". The list
// favors locations clearly south of the equator; near-equator zones
// stay on the default (north) since the seasonal shift there is
// negligible anyway.
const SOUTH_HEMISPHERE_HINTS = [
  "Antarctica/",
  "Australia/",
  "Pacific/Auckland",
  "Pacific/Chatham",
  "Pacific/Fiji",
  "Pacific/Norfolk",
  "Pacific/Noumea",
  "Pacific/Port_Moresby",
  "Pacific/Tongatapu",
  "Pacific/Easter",
  "America/Argentina",
  "America/Asuncion",
  "America/Montevideo",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Punta_Arenas",
  "America/La_Paz",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "Africa/Johannesburg",
  "Africa/Maputo",
  "Africa/Harare",
  "Africa/Windhoek",
  "Africa/Gaborone",
  "Africa/Maseru",
  "Africa/Mbabane",
  "Africa/Lusaka",
  "Africa/Antananarivo",
  "Indian/Mauritius",
  "Indian/Reunion",
  "Indian/Mahe",
]

function pickHemisphere(setting: string): "north" | "south" {
  if (setting === "north" || setting === "south") return setting
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    if (SOUTH_HEMISPHERE_HINTS.some((p) => tz.startsWith(p))) return "south"
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

function resolveTimelineEntry(
  entry: TimelineEntry,
  band: Band,
  now: Date,
): SingleEntry {
  if (!Array.isArray(entry)) return entry
  if (entry.length === 1) return entry[0]
  const h = now.getHours() + now.getMinutes() / 60
  const span = band.toHour - band.fromHour
  let progress: number
  if (band.toHour > 24) {
    if (h >= band.fromHour) progress = (h - band.fromHour) / span
    else progress = (h + 24 - band.fromHour) / span
  } else {
    progress = (h - band.fromHour) / span
  }
  const idx = Math.min(entry.length - 1, Math.max(0, Math.floor(progress * entry.length)))
  return entry[idx]
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
  const tlEntry = theme.timeline[band.name]
  if (!tlEntry) return null
  return resolveTimelineEntry(tlEntry, band, date).src
}

// Direct-art override: encoding scheme used in the gear menu's "Direct
// art" select. Returns a resolved src path relative to manifest.basePath,
// or null if the encoding is "auto" / unparseable.
function resolveDirectArt(spec: string, m: Manifest): string | null {
  if (!spec || spec === "auto") return null
  // Specials encoded as "special:halloween"
  if (spec.startsWith("special:")) {
    const key = spec.slice("special:".length)
    return m.specials[key]?.src ?? null
  }
  // Otherwise "<theme>|<selector>" where selector is a band name,
  // "weather:<key>", or "variant:<key>".
  const sep = spec.indexOf("|")
  if (sep < 0) return null
  const themeName = spec.slice(0, sep)
  const selector = spec.slice(sep + 1)
  const theme = m.themes[themeName]
  if (!theme) return null
  if (selector.startsWith("weather:") && theme.type === "diurnal") {
    const w = theme.weather?.[selector.slice("weather:".length)]
    return w ? w.src : null
  }
  if (selector.startsWith("variant:") && theme.type === "seasonal_static") {
    const v = theme.variants[selector.slice("variant:".length)]
    return v ? v.src : null
  }
  if (theme.type === "diurnal") {
    const entry = theme.timeline[selector]
    if (!entry) return null
    return Array.isArray(entry) ? entry[0].src : entry.src
  }
  return null
}

interface Settings {
  artTheme: string
  hemisphere: string
  weatherChance: string
  timeOfDay: string
  directArt: string
}
const SETTINGS_DEFAULTS: Settings = {
  artTheme: "none",
  hemisphere: "auto",
  weatherChance: "sometimes",
  timeOfDay: "auto",
  directArt: "auto",
}
function readSettings(): Settings {
  try {
    const raw = localStorage.getItem("trevorc-settings-v1")
    if (!raw) return { ...SETTINGS_DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      artTheme: parsed.artTheme ?? SETTINGS_DEFAULTS.artTheme,
      hemisphere: parsed.hemisphere ?? SETTINGS_DEFAULTS.hemisphere,
      // Old levels (off/low/medium/high) migrate to the three-state model.
      weatherChance: (() => {
        const v = parsed.weatherChance
        if (v === "always" || v === "sometimes" || v === "never") return v
        if (v === "off") return "never"
        if (v === "low" || v === "medium" || v === "high") return "sometimes"
        return SETTINGS_DEFAULTS.weatherChance
      })(),
      timeOfDay: parsed.timeOfDay ?? SETTINGS_DEFAULTS.timeOfDay,
      directArt: parsed.directArt ?? SETTINGS_DEFAULTS.directArt,
    }
  } catch {
    return { ...SETTINGS_DEFAULTS }
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

  // Direct-art override wins above everything else.
  const direct = resolveDirectArt(settings.directArt, manifest)
  if (direct) {
    await crossfadeTo(`${manifest.basePath}/${direct}`)
    return
  }

  if (settings.artTheme === "none") {
    fadeBlank()
    return
  }
  const hemi = pickHemisphere(settings.hemisphere)
  let themeName = settings.artTheme
  if (themeName === "seasonal") themeName = pickSeasonalTheme(new Date(), hemi, manifest)
  const bands = dynamicBands(manifest.bands, new Date(), hemi)

  // Time-of-day setting: "auto" follows the dynamic clock-based band,
  // otherwise force the named band so the user can preview any moment.
  let band: Band
  if (settings.timeOfDay && settings.timeOfDay !== "auto") {
    band =
      bands.find((b) => b.name === settings.timeOfDay) ||
      pickBand(new Date(), bands)
  } else {
    band = pickBand(new Date(), bands)
  }

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
