// Site art renderer.
//
// Two stacked <img> elements at the viewport bottom. The "base" layer
// always sits at opacity 1; the "fade" overlay sits above it at
// opacity 0 by default. To change the displayed scene we set the
// overlay's src to the new image and animate its opacity 0 → 1.
// During the fade, every visible pixel is a per-pixel alpha blend of
// the new image (alpha=t) over the old (alpha=1) — total compositing
// alpha is constant at 1, so there's no "white/black/gray middle"
// like a symmetric opacity crossfade would give. Once the overlay
// reaches opacity 1, the base copies the new src (instant; browser
// cache), the overlay is reset to opacity 0, and the cycle repeats.

const MANIFEST_URL = "/static/site-art/manifest.json"
const TICK_MS = 30 * 1000
const CROSSFADE_MS = 10000
const SOMETIMES_WEATHER_CHANCE = 0.175 // midpoint of 15–20%

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
  variants: Record<string, SingleEntry>
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
let imgBase: HTMLImageElement | null = null
let imgFade: HTMLImageElement | null = null
let currentSrc = ""
let fadeToken = 0
let tickTimer: number | null = null

// Per-page-load rolls. Re-rolled by start() on every nav so each fresh
// page (or SPA navigation) gets a fresh chance at weather and a fresh
// random scene.
let weatherRolledOn = false
let rolledRandomSrc: string | null = null

function ensureContainer() {
  if (imgBase && imgBase.isConnected && imgFade && imgFade.isConnected) return
  document.querySelectorAll("img.site-art-frame").forEach((el) => el.remove())
  imgBase = document.createElement("img")
  imgFade = document.createElement("img")
  imgBase.className = "site-art-frame site-art-base"
  imgFade.className = "site-art-frame site-art-fade"
  for (const img of [imgBase, imgFade]) {
    img.setAttribute("aria-hidden", "true")
    img.alt = ""
    document.body.appendChild(img)
  }
  imgBase.style.opacity = "0"
  imgFade.style.opacity = "0"
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
  if (fromMD <= toMD) return md >= fromMD && md < toMD
  return md >= fromMD || md < toMD
}

function pickBand(now: Date, bands: Band[]): Band {
  const h = now.getHours() + now.getMinutes() / 60
  for (const b of bands) {
    if (b.toHour <= 24) {
      if (h >= b.fromHour && h < b.toHour) return b
    } else {
      const wrappedTo = b.toHour - 24
      if (h >= b.fromHour || h < wrappedTo) return b
    }
  }
  return bands[0]
}

// Solar-aware band shifting: in summer, mornings start earlier and
// evenings stretch later. The 12:00 noon junction stays fixed (so the
// morning ↔ afternoon boundary doesn't drift across the year).
// Amplitude is roughly a 40–45° latitude day-length spread.
const SOLAR_SHIFT_AMPLITUDE_HOURS = 1.5
const NOON_HOUR = 12.0

function dayOfYear(date: Date): number {
  const startUtc = Date.UTC(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - startUtc) / 86400000)
}

function seasonalShift(date: Date, hemisphere: "north" | "south"): number {
  const solsticeDay = hemisphere === "north" ? 172 : 355
  return Math.cos((2 * Math.PI * (dayOfYear(date) - solsticeDay)) / 365.25)
}

function adjustEdge(h: number, shift: number): number {
  const delta = shift * SOLAR_SHIFT_AMPLITUDE_HOURS
  if (Math.abs(h - NOON_HOUR) < 0.01) return h
  if (h > 24 || h < NOON_HOUR) return h - delta
  return h + delta
}

function dynamicBands(staticBands: Band[], date: Date, hemisphere: "north" | "south"): Band[] {
  const shift = seasonalShift(date, hemisphere)
  return staticBands.map((b) => ({
    ...b,
    fromHour: adjustEdge(b.fromHour, shift),
    toHour: adjustEdge(b.toHour, shift),
  }))
}

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

// Weather decision. "always" pins on (when an eligible variant exists
// for the current band); "never" pins off; "sometimes" obeys a single
// per-page-load coin flip — i.e. set when start() runs and stable for
// the rest of this navigation.
function pickWeather(theme: Theme, band: Band, chance: string): string | null {
  if (theme.type !== "diurnal" || !theme.weather) return null
  const eligible = Object.entries(theme.weather).filter(([_, w]) =>
    w.appliesTo.includes(band.name),
  )
  if (!eligible.length) return null
  if (chance === "always") return eligible[0][0]
  if (chance === "sometimes" && weatherRolledOn) return eligible[0][0]
  return null
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

function allManifestSrcs(m: Manifest): string[] {
  const out: string[] = []
  for (const t of Object.values(m.themes)) {
    if (t.type === "diurnal") {
      for (const e of Object.values(t.timeline)) {
        if (Array.isArray(e)) for (const x of e) out.push(x.src)
        else out.push(e.src)
      }
      if (t.weather) for (const w of Object.values(t.weather)) out.push(w.src)
    } else if (t.type === "seasonal_static") {
      for (const v of Object.values(t.variants)) out.push(v.src)
    }
  }
  for (const sp of Object.values(m.specials)) out.push(sp.src)
  return out
}

function pickRandomSrc(m: Manifest): string | null {
  if (rolledRandomSrc) return rolledRandomSrc
  const all = allManifestSrcs(m)
  if (!all.length) return null
  rolledRandomSrc = all[Math.floor(Math.random() * all.length)]
  return rolledRandomSrc
}

function resolveDirectArt(spec: string, m: Manifest): string | null {
  if (!spec || spec === "auto") return null
  // "src:<relativePath>" pins a specific image by its manifest-relative
  // path. Used by the /site-art credits page when a thumbnail is
  // clicked, so the user can promote any specific image to the active
  // background without thinking about its theme/band addressing.
  if (spec.startsWith("src:")) return spec.slice("src:".length)
  if (spec.startsWith("special:")) {
    const key = spec.slice("special:".length)
    return m.specials[key]?.src ?? null
  }
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
  artTheme: "seasonal",
  hemisphere: "auto",
  weatherChance: "sometimes",
  timeOfDay: "auto",
  directArt: "auto",
}
function readSettings(): Settings {
  const isShowcase =
    typeof window !== "undefined" && window.location.pathname.includes("/background")
  try {
    const raw = localStorage.getItem("trevorc-settings-v1")
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      // The /background showcase always forces Seasonal so the page
      // shows something even when the saved theme is None.
      artTheme: isShowcase ? "seasonal" : parsed.artTheme ?? SETTINGS_DEFAULTS.artTheme,
      hemisphere: parsed.hemisphere ?? SETTINGS_DEFAULTS.hemisphere,
      weatherChance: (() => {
        const v = parsed.weatherChance
        if (v === "always" || v === "sometimes" || v === "never") return v
        if (v === "off") return "never"
        if (v === "low" || v === "medium" || v === "high") return "sometimes"
        return SETTINGS_DEFAULTS.weatherChance
      })(),
      timeOfDay: parsed.timeOfDay ?? SETTINGS_DEFAULTS.timeOfDay,
      directArt: isShowcase ? "auto" : parsed.directArt ?? SETTINGS_DEFAULTS.directArt,
    }
  } catch {
    return { ...SETTINGS_DEFAULTS, artTheme: isShowcase ? "seasonal" : SETTINGS_DEFAULTS.artTheme }
  }
}

function setResolved(theme: string) {
  document.documentElement.setAttribute("data-art-resolved", theme)
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

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

async function crossfadeTo(src: string) {
  if (!imgBase || !imgFade) return
  if (src === currentSrc) return
  const myToken = ++fadeToken

  // First render: pop straight into the base, no overlay fade needed.
  if (!currentSrc) {
    await loadImage(imgBase, src)
    if (myToken !== fadeToken) return
    imgBase.style.transition = "opacity 200ms ease-in-out"
    imgBase.style.opacity = "1"
    currentSrc = src
    return
  }

  // Otherwise: overlay the new image on top of the current base. The
  // base stays at opacity 1; the overlay fades 0 → 1. At every moment
  // the compositing alpha sums to 1, so the screen never goes through
  // a darker mid-frame.
  await loadImage(imgFade, src)
  if (myToken !== fadeToken) return

  // Reset overlay to opacity 0 with no transition, then animate to 1.
  imgFade.style.transition = "none"
  imgFade.style.opacity = "0"
  // Force a reflow so the browser registers the 0 state before the next
  // style assignment animates.
  void imgFade.offsetHeight
  imgFade.style.transition = `opacity ${CROSSFADE_MS}ms ease-in-out`
  imgFade.style.opacity = "1"

  await wait(CROSSFADE_MS)
  if (myToken !== fadeToken) return

  // Snap base to the new src (browser cache makes this near-instant),
  // wait one frame so the load lands, then reset the overlay.
  await loadImage(imgBase, src)
  if (myToken !== fadeToken) return
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  if (myToken !== fadeToken) return

  imgFade.style.transition = "none"
  imgFade.style.opacity = "0"
  void imgFade.offsetHeight

  currentSrc = src
}

async function tick() {
  if (!manifest) return
  ensureContainer()
  const settings = readSettings()

  // Direct-art override wins over everything else.
  const direct = resolveDirectArt(settings.directArt, manifest)
  if (direct) {
    setResolved(settings.artTheme === "seasonal" ? "direct" : settings.artTheme)
    await crossfadeTo(`${manifest.basePath}/${direct}`)
    return
  }

  if (settings.artTheme === "none") {
    setResolved("none")
    if (imgBase) imgBase.style.opacity = "0"
    if (imgFade) imgFade.style.opacity = "0"
    currentSrc = ""
    return
  }

  if (settings.artTheme === "random") {
    setResolved("random")
    const r = pickRandomSrc(manifest)
    if (!r) return
    await crossfadeTo(`${manifest.basePath}/${r}`)
    return
  }

  const hemi = pickHemisphere(settings.hemisphere)
  let themeName = settings.artTheme
  if (themeName === "seasonal") themeName = pickSeasonalTheme(new Date(), hemi, manifest)
  setResolved(themeName)

  const bands = dynamicBands(manifest.bands, new Date(), hemi)
  let band: Band
  if (settings.timeOfDay && settings.timeOfDay !== "auto") {
    band = bands.find((b) => b.name === settings.timeOfDay) || pickBand(new Date(), bands)
  } else {
    band = pickBand(new Date(), bands)
  }

  const theme = manifest.themes[themeName]
  const weatherKey = theme ? pickWeather(theme, band, settings.weatherChance) : null
  const srcRel = pickSrc(themeName, band, weatherKey, new Date(), manifest)
  if (!srcRel) {
    if (imgBase) imgBase.style.opacity = "0"
    if (imgFade) imgFade.style.opacity = "0"
    currentSrc = ""
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

// Wire up the credits-page thumbnail clicks: clicking any thumbnail
// pins that exact image as the background by writing a "src:" spec into
// the directArt setting and nudging the renderer. The selector only
// matches on the /site-art credits page, so this is a no-op elsewhere.
const SETTINGS_KEY = "trevorc-settings-v1"
function bindCreditsThumbnails() {
  document
    .querySelectorAll<HTMLImageElement>(".art-grid img[data-direct-art]")
    .forEach((img) => {
      const handler = (e: Event) => {
        e.preventDefault()
        const spec = img.getAttribute("data-direct-art")
        if (!spec) return
        try {
          const raw = localStorage.getItem(SETTINGS_KEY)
          const parsed = raw ? JSON.parse(raw) : {}
          parsed.directArt = spec
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed))
        } catch (_e) {
          /* swallow */
        }
        document.documentElement.setAttribute("data-direct-art", spec)
        document.dispatchEvent(new CustomEvent("site-art-changed"))
      }
      img.style.cursor = "pointer"
      img.addEventListener("click", handler)
      if (typeof window.addCleanup === "function") {
        window.addCleanup(() => img.removeEventListener("click", handler))
      }
    })
}

async function start() {
  ensureContainer()
  // Re-roll per-page-load decisions on every navigation.
  weatherRolledOn = Math.random() < SOMETIMES_WEATHER_CHANCE
  rolledRandomSrc = null
  await ensureManifest()
  if (!manifest) return
  await tick()
  bindCreditsThumbnails()
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
