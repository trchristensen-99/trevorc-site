// Settings panel: toggles, saved to localStorage, applied via data-attributes
// on the documentElement. Other CSS / scripts read those attributes to
// adjust appearance and behavior.

interface Settings {
  colorTheme: "blue" | "red"
  darkMode: boolean
  showBreadcrumbs: boolean
  expandToc: boolean
  compactMode: boolean
  zoom: number
  decor: "placeholder" | "none"
  decorFade: boolean
}

const DEFAULTS: Settings = {
  colorTheme: "blue",
  darkMode: false,
  showBreadcrumbs: true,
  expandToc: false,
  compactMode: false,
  zoom: 1,
  decor: "placeholder",
  decorFade: false,
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
  root.setAttribute("saved-theme", s.darkMode ? "dark" : "light")
  root.setAttribute("data-show-breadcrumbs", s.showBreadcrumbs ? "true" : "false")
  root.setAttribute("data-expand-toc", s.expandToc ? "true" : "false")
  root.setAttribute("data-compact-mode", s.compactMode ? "true" : "false")
  root.setAttribute("data-decor", s.decor)
  root.setAttribute("data-decor-fade", s.decorFade ? "true" : "false")
  root.style.fontSize = `${18 * s.zoom}px`
  try {
    localStorage.setItem("theme", s.darkMode ? "dark" : "light")
  } catch {
    /* swallow */
  }
}

function reflectIntoPanel(s: Settings, panel: HTMLElement) {
  const inputs = panel.querySelectorAll<HTMLInputElement>("input[data-setting]")
  inputs.forEach((i) => {
    const key = i.getAttribute("data-setting") as keyof Settings | "reset"
    if (key === "reset") return
    if (i.type === "checkbox") {
      i.checked = Boolean(s[key as keyof Settings])
    }
  })
  const selects = panel.querySelectorAll<HTMLSelectElement>("select[data-setting]")
  selects.forEach((sel) => {
    const key = sel.getAttribute("data-setting") as keyof Settings
    sel.value = String(s[key])
  })
  const pill = panel.querySelector<HTMLButtonElement>(".settings-pill")
  if (pill) {
    // Pill shows the *opposite* of current — clicking switches.
    const opposite = s.colorTheme === "blue" ? "red" : "blue"
    pill.style.background =
      opposite === "blue" ? "var(--accent-blue, #2640D8)" : "var(--accent-red, #C8002A)"
  }
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
  const toggle = () => {
    if (panel.getAttribute("data-open") === "true") close()
    else open()
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation()
    toggle()
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

  panel.querySelectorAll<HTMLInputElement>("input[data-setting]").forEach((i) => {
    const key = i.getAttribute("data-setting") as keyof Settings | "reset"
    if (key === "reset") return
    i.addEventListener("change", () => {
      if (i.type === "checkbox") {
        ;(state as Record<string, unknown>)[key] = i.checked
      }
      write(state)
      apply(state)
      reflectIntoPanel(state, panel)
    })
  })

  panel.querySelectorAll<HTMLSelectElement>("select[data-setting]").forEach((sel) => {
    const key = sel.getAttribute("data-setting") as keyof Settings
    sel.addEventListener("change", () => {
      const v: string | number = sel.value
      ;(state as Record<string, unknown>)[key] =
        key === "zoom" ? parseFloat(v as string) : v
      write(state)
      apply(state)
    })
  })

  const pill = panel.querySelector<HTMLButtonElement>(".settings-pill")
  pill?.addEventListener("click", () => {
    state.colorTheme = state.colorTheme === "blue" ? "red" : "blue"
    write(state)
    apply(state)
    reflectIntoPanel(state, panel)
  })

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

// Apply settings immediately so the initial paint has the right theme.
try {
  apply(read())
} catch {
  /* swallow */
}

document.addEventListener("nav", attach)
if (document.readyState !== "loading") attach()
else document.addEventListener("DOMContentLoaded", attach, { once: true })
