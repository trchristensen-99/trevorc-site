// Settings panel: toggles saved to localStorage and applied via data-*
// attributes on the documentElement. CSS reads those attributes to adjust
// appearance and behavior. Dark mode lives outside this panel (its own
// sun/moon button next to the gear); we don't double up here.
//
// All clicks/changes are handled via event delegation on document so the
// handlers stay valid across SPA navigation without re-attachment.

interface Settings {
  colorTheme: "blue" | "red"
  showBreadcrumbs: boolean
  expandToc: boolean
  zoom: number
  topBarReveal: "off" | "slow" | "normal" | "fast" | "instant"
  artTheme:
    | "none"
    | "seasonal"
    | "random"
    | "ocean"
    | "forest"
    | "mountain"
    | "winter"
    | "medieval_city"
  hemisphere: "auto" | "north" | "south"
  weatherChance: "never" | "sometimes" | "always"
  timeOfDay:
    | "auto"
    | "before_sunrise"
    | "sunrise"
    | "morning"
    | "afternoon"
    | "evening"
    | "sunset"
    | "after_sunset"
    | "night"
  directArt: string
  pageBgOpacity: "100" | "85" | "70" | "55" | "40"
  metaDate: boolean
  metaModified: boolean
  metaReading: boolean
  metaImportance: boolean
  metaAudio: boolean
  metaTags: boolean
}

const DEFAULTS: Settings = {
  colorTheme: "blue",
  showBreadcrumbs: false,
  expandToc: false,
  zoom: 1,
  topBarReveal: "normal",
  artTheme: "seasonal",
  hemisphere: "auto",
  weatherChance: "sometimes",
  timeOfDay: "auto",
  directArt: "auto",
  pageBgOpacity: "100",
  metaDate: true,
  metaModified: true,
  metaReading: true,
  metaImportance: true,
  metaAudio: true,
  metaTags: true,
}

const KEY = "trevorc-settings-v1"

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    // Migrate older saved band names (pre-v3 manifest).
    if (parsed.timeOfDay === "early_morning") parsed.timeOfDay = "before_sunrise"
    else if (parsed.timeOfDay === "late_morning") parsed.timeOfDay = "morning"
    else if (parsed.timeOfDay === "before_sunset") parsed.timeOfDay = "evening"
    if (typeof parsed.directArt === "string") {
      parsed.directArt = parsed.directArt
        .replace("|early_morning", "|before_sunrise")
        .replace("|late_morning", "|morning")
        .replace("|before_sunset", "|evening")
    }
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* swallow */
  }
}

function apply(s: Settings) {
  const root = document.documentElement
  root.setAttribute("data-color-theme", s.colorTheme)
  root.setAttribute("data-show-breadcrumbs", s.showBreadcrumbs ? "true" : "false")
  root.setAttribute("data-expand-toc", s.expandToc ? "true" : "false")
  root.setAttribute("data-art-theme", s.artTheme)
  root.setAttribute("data-hemisphere", s.hemisphere)
  root.setAttribute("data-weather", s.weatherChance)
  root.setAttribute("data-time-of-day", s.timeOfDay)
  root.setAttribute("data-direct-art", s.directArt)
  root.setAttribute("data-page-bg-pct", s.pageBgOpacity)
  root.style.setProperty("--page-bg-pct", s.pageBgOpacity)
  // Nudge the site-art renderer to re-evaluate immediately when the
  // theme/hemisphere/weather change, rather than waiting for its tick.
  try {
    document.dispatchEvent(new CustomEvent("site-art-changed"))
  } catch (_e) {
    /* swallow */
  }
  root.setAttribute("data-meta-date", s.metaDate ? "true" : "false")
  root.setAttribute("data-meta-modified", s.metaModified ? "true" : "false")
  root.setAttribute("data-meta-reading", s.metaReading ? "true" : "false")
  root.setAttribute("data-meta-importance", s.metaImportance ? "true" : "false")
  root.setAttribute("data-meta-audio", s.metaAudio ? "true" : "false")
  root.setAttribute("data-meta-tags", s.metaTags ? "true" : "false")
  root.style.fontSize = `${18 * s.zoom}px`
  root.setAttribute("data-zoom", String(s.zoom))
  root.setAttribute("data-topbar-reveal", s.topBarReveal)

  document
    .querySelectorAll<HTMLDetailsElement>("details.inline-toc")
    .forEach((d) => {
      if (d.dataset.userToggled !== "true") d.open = s.expandToc
    })
}

function reflectIntoPanel(s: Settings, panel: HTMLElement) {
  panel.querySelectorAll<HTMLInputElement>("input[data-setting]").forEach((i) => {
    const key = i.getAttribute("data-setting")
    if (!key || key === "reset") return
    if (i.type === "checkbox") {
      i.checked = Boolean((s as unknown as Record<string, unknown>)[key])
    }
  })
  panel.querySelectorAll<HTMLSelectElement>("select[data-setting]").forEach((sel) => {
    const key = sel.getAttribute("data-setting") as keyof Settings
    sel.value = String(s[key])
  })
}

function panelEl() {
  return document.querySelector<HTMLElement>(".settings-panel")
}
function buttonEl() {
  return document.querySelector<HTMLButtonElement>(".settings-button")
}
function setOpen(open: boolean) {
  const p = panelEl()
  const b = buttonEl()
  if (p) p.setAttribute("data-open", open ? "true" : "false")
  if (b) b.setAttribute("aria-expanded", open ? "true" : "false")
}

// Mirrors the sandwich menu's pattern: install global delegated handlers
// once, using the capture phase so nothing in the DOM can stop the event
// before we see it. init() runs on every entry path (initial load, nav).

let handlersInstalled = false
function installGlobalHandlers() {
  if (handlersInstalled) return
  handlersInstalled = true

  document.addEventListener(
    "click",
    (e) => {
      const t = e.target as Element | null
      if (!t) return

      if (t.closest(".settings-button")) {
        const p = panelEl()
        setOpen(p?.getAttribute("data-open") !== "true")
        const state = read()
        if (p) reflectIntoPanel(state, p)
        e.stopPropagation()
        return
      }

      if (t.closest(".settings-close")) {
        setOpen(false)
        e.stopPropagation()
        return
      }

      if (t.closest("[data-setting='color-theme-toggle']")) {
        const state = read()
        state.colorTheme = state.colorTheme === "blue" ? "red" : "blue"
        write(state)
        apply(state)
        e.stopPropagation()
        return
      }

      if (t.closest("[data-setting='reset']")) {
        const state: Settings = { ...DEFAULTS }
        write(state)
        apply(state)
        const p = panelEl()
        if (p) reflectIntoPanel(state, p)
        e.stopPropagation()
        return
      }

      // Outside-click closes an open panel.
      const p = panelEl()
      if (p && p.getAttribute("data-open") === "true" && !p.contains(t)) {
        setOpen(false)
      }
    },
    true,
  )

  document.addEventListener("change", (e) => {
    const t = e.target as Element | null
    if (!t) return
    if (!t.closest(".settings-panel")) return
    const key = t.getAttribute("data-setting")
    if (!key || key === "reset") return

    const state = read()
    if (t instanceof HTMLInputElement && t.type === "checkbox") {
      ;(state as unknown as Record<string, unknown>)[key] = t.checked
    } else if (t instanceof HTMLSelectElement) {
      const v = t.value
      ;(state as unknown as Record<string, unknown>)[key] =
        key === "zoom" ? parseFloat(v) : v
    }
    write(state)
    apply(state)
  })

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false)
  })
}

function init() {
  installGlobalHandlers()
  const state = read()
  apply(state)
  const p = panelEl()
  if (p) reflectIntoPanel(state, p)
  setOpen(false)

  document.querySelectorAll<HTMLDetailsElement>("details.inline-toc").forEach((d) => {
    const onToggle = () => {
      d.dataset.userToggled = "true"
    }
    d.addEventListener("toggle", onToggle)
    window.addCleanup(() => d.removeEventListener("toggle", onToggle))
  })
}

document.addEventListener("nav", init)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true })
} else {
  init()
}
