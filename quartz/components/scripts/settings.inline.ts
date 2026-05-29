// Settings panel: toggles saved to localStorage and applied via data-*
// attributes on the documentElement. CSS reads those attributes to adjust
// appearance and behavior. Dark mode lives outside this panel (its own
// sun/moon button next to the gear); we don't double up here.

interface Settings {
  colorTheme: "blue" | "red"
  showBreadcrumbs: boolean
  expandToc: boolean
  compactMode: boolean
  zoom: number
  decor: "placeholder" | "none"
  decorFade: boolean
  metaDate: boolean
  metaModified: boolean
  metaReading: boolean
  metaImportance: boolean
  metaAudio: boolean
  metaTags: boolean
}

const DEFAULTS: Settings = {
  colorTheme: "blue",
  showBreadcrumbs: true,
  expandToc: false,
  compactMode: false,
  zoom: 1,
  decor: "placeholder",
  decorFade: false,
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
  root.setAttribute("data-compact-mode", s.compactMode ? "true" : "false")
  root.setAttribute("data-decor", s.decor)
  root.setAttribute("data-decor-fade", s.decorFade ? "true" : "false")
  root.setAttribute("data-meta-date", s.metaDate ? "true" : "false")
  root.setAttribute("data-meta-modified", s.metaModified ? "true" : "false")
  root.setAttribute("data-meta-reading", s.metaReading ? "true" : "false")
  root.setAttribute("data-meta-importance", s.metaImportance ? "true" : "false")
  root.setAttribute("data-meta-audio", s.metaAudio ? "true" : "false")
  root.setAttribute("data-meta-tags", s.metaTags ? "true" : "false")
  // Zoom scales the base font-size from 18px.
  root.style.fontSize = `${18 * s.zoom}px`

  // Apply the expand-toc setting to all <details.inline-toc> that haven't
  // been touched by the user this session.
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
      const v = (s as unknown as Record<string, unknown>)[key]
      i.checked = Boolean(v)
    }
  })
  panel.querySelectorAll<HTMLSelectElement>("select[data-setting]").forEach((sel) => {
    const key = sel.getAttribute("data-setting") as keyof Settings
    sel.value = String(s[key])
  })
}

function attach() {
  const btn = document.querySelector<HTMLButtonElement>(".settings-button")
  const panel = document.querySelector<HTMLElement>(".settings-panel")
  if (!btn || !panel) return

  const state: Settings = read()
  apply(state)
  reflectIntoPanel(state, panel)

  const open = () => {
    panel.setAttribute("data-open", "true")
    btn.setAttribute("aria-expanded", "true")
  }
  const close = () => {
    panel.setAttribute("data-open", "false")
    btn.setAttribute("aria-expanded", "false")
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation()
    if (panel.getAttribute("data-open") === "true") close()
    else open()
  })
  document.addEventListener("click", (e) => {
    if (panel.getAttribute("data-open") !== "true") return
    const t = e.target as Node | null
    if (!t) return
    if (panel.contains(t) || btn.contains(t)) return
    close()
  })
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close()
  })

  // Track explicit user toggles on TOC <details> so settings.expandToc only
  // controls untouched ones.
  document.querySelectorAll<HTMLDetailsElement>("details.inline-toc").forEach((d) => {
    d.addEventListener("toggle", () => {
      d.dataset.userToggled = "true"
    })
  })

  panel.querySelectorAll<HTMLInputElement>("input[data-setting]").forEach((i) => {
    const key = i.getAttribute("data-setting")
    if (!key || key === "reset") return
    i.addEventListener("change", () => {
      if (i.type === "checkbox") {
        ;(state as unknown as Record<string, unknown>)[key] = i.checked
      }
      write(state)
      apply(state)
    })
  })

  panel.querySelectorAll<HTMLSelectElement>("select[data-setting]").forEach((sel) => {
    const key = sel.getAttribute("data-setting") as keyof Settings
    sel.addEventListener("change", () => {
      const v: string = sel.value
      ;(state as unknown as Record<string, unknown>)[key] =
        key === "zoom" ? parseFloat(v) : v
      write(state)
      apply(state)
    })
  })

  panel.querySelector<HTMLButtonElement>("[data-setting='color-theme-toggle']")?.addEventListener(
    "click",
    () => {
      state.colorTheme = state.colorTheme === "blue" ? "red" : "blue"
      write(state)
      apply(state)
    },
  )

  panel.querySelector<HTMLButtonElement>("[data-setting='reset']")?.addEventListener(
    "click",
    () => {
      Object.assign(state, DEFAULTS)
      write(state)
      apply(state)
      reflectIntoPanel(state, panel)
    },
  )
}

try {
  apply(read())
} catch {
  /* swallow */
}

document.addEventListener("nav", attach)
if (document.readyState !== "loading") attach()
else document.addEventListener("DOMContentLoaded", attach, { once: true })
