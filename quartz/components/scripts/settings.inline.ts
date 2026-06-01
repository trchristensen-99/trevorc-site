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
  decorEdge: "solid" | "fade"
  decorWidth: "narrow" | "medium" | "wide" | "full"
  decorOuter: "match" | "light" | "dark" | "gray"
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
  decorEdge: "solid",
  decorWidth: "full",
  decorOuter: "match",
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
  root.setAttribute("data-decor-edge", s.decorEdge)
  root.setAttribute("data-decor-width", s.decorWidth)
  root.setAttribute("data-decor-outer", s.decorOuter)
  root.setAttribute("data-meta-date", s.metaDate ? "true" : "false")
  root.setAttribute("data-meta-modified", s.metaModified ? "true" : "false")
  root.setAttribute("data-meta-reading", s.metaReading ? "true" : "false")
  root.setAttribute("data-meta-importance", s.metaImportance ? "true" : "false")
  root.setAttribute("data-meta-audio", s.metaAudio ? "true" : "false")
  root.setAttribute("data-meta-tags", s.metaTags ? "true" : "false")
  root.style.fontSize = `${18 * s.zoom}px`

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

// Always apply settings from storage as soon as the script loads — happens
// on every page transition since the inline script re-runs.
apply(read())

document.addEventListener("nav", () => {
  const btn = document.querySelector<HTMLButtonElement>(".settings-button")
  const panel = document.querySelector<HTMLElement>(".settings-panel")
  if (!btn || !panel) return

  // Re-read in case storage changed in another tab.
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

  const onBtn = (e: MouseEvent) => {
    e.stopPropagation()
    if (panel.getAttribute("data-open") === "true") close()
    else open()
  }
  const onDocClick = (e: MouseEvent) => {
    if (panel.getAttribute("data-open") !== "true") return
    const t = e.target as Node | null
    if (!t) return
    if (panel.contains(t) || btn.contains(t)) return
    close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close()
  }

  btn.addEventListener("click", onBtn)
  document.addEventListener("click", onDocClick)
  document.addEventListener("keydown", onKey)

  window.addCleanup(() => {
    btn.removeEventListener("click", onBtn)
    document.removeEventListener("click", onDocClick)
    document.removeEventListener("keydown", onKey)
  })

  document.querySelectorAll<HTMLDetailsElement>("details.inline-toc").forEach((d) => {
    const onToggle = () => {
      d.dataset.userToggled = "true"
    }
    d.addEventListener("toggle", onToggle)
    window.addCleanup(() => d.removeEventListener("toggle", onToggle))
  })

  panel.querySelectorAll<HTMLInputElement>("input[data-setting]").forEach((i) => {
    const key = i.getAttribute("data-setting")
    if (!key || key === "reset") return
    const onChange = () => {
      if (i.type === "checkbox") {
        ;(state as unknown as Record<string, unknown>)[key] = i.checked
      }
      write(state)
      apply(state)
    }
    i.addEventListener("change", onChange)
    window.addCleanup(() => i.removeEventListener("change", onChange))
  })

  panel.querySelectorAll<HTMLSelectElement>("select[data-setting]").forEach((sel) => {
    const key = sel.getAttribute("data-setting") as keyof Settings
    const onChange = () => {
      const v: string = sel.value
      ;(state as unknown as Record<string, unknown>)[key] =
        key === "zoom" ? parseFloat(v) : v
      write(state)
      apply(state)
    }
    sel.addEventListener("change", onChange)
    window.addCleanup(() => sel.removeEventListener("change", onChange))
  })

  const pill = panel.querySelector<HTMLButtonElement>(
    "[data-setting='color-theme-toggle']",
  )
  if (pill) {
    const onPill = () => {
      state.colorTheme = state.colorTheme === "blue" ? "red" : "blue"
      write(state)
      apply(state)
    }
    pill.addEventListener("click", onPill)
    window.addCleanup(() => pill.removeEventListener("click", onPill))
  }

  const reset = panel.querySelector<HTMLButtonElement>("[data-setting='reset']")
  if (reset) {
    const onReset = () => {
      Object.assign(state, DEFAULTS)
      write(state)
      apply(state)
      reflectIntoPanel(state, panel)
    }
    reset.addEventListener("click", onReset)
    window.addCleanup(() => reset.removeEventListener("click", onReset))
  }
})
