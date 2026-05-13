// Auto-expand the nav menu on desktop (sidebar mode appears at >=1200px);
// keep it collapsed by default on narrow widths. The user can always click
// the hamburger to toggle either state.

const DESKTOP_MQ = "(min-width: 1200px)"

function setExpanded(root: HTMLElement, toggle: HTMLButtonElement, expanded: boolean) {
  if (expanded) {
    root.classList.remove("collapsed")
  } else {
    root.classList.add("collapsed")
  }
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false")
}

function attachNavMenu(root: HTMLElement) {
  const toggle = root.querySelector<HTMLButtonElement>(".nav-menu-toggle")
  const panel = root.querySelector<HTMLElement>(".nav-menu-list")
  if (!toggle || !panel) return

  const mq = window.matchMedia(DESKTOP_MQ)

  // Initial state: expanded on desktop, collapsed on narrow widths.
  setExpanded(root, toggle, mq.matches)
  if (!mq.matches) {
    // On narrow widths, also clear any user-toggled state from prior navigation
    root.classList.remove("user-toggled")
  } else {
    root.classList.remove("user-toggled")
  }

  const onToggleClick = (e: Event) => {
    e.stopPropagation()
    root.classList.add("user-toggled")
    const currentlyExpanded = toggle.getAttribute("aria-expanded") === "true"
    setExpanded(root, toggle, !currentlyExpanded)
  }
  const onDocClick = (e: Event) => {
    // Only auto-close when narrow (drawer mode) and currently open
    if (mq.matches) return
    if (toggle.getAttribute("aria-expanded") !== "true") return
    const t = e.target as Node | null
    if (!t || root.contains(t)) return
    setExpanded(root, toggle, false)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !mq.matches) {
      setExpanded(root, toggle, false)
    }
  }
  const onMqChange = (e: MediaQueryListEvent) => {
    // Re-sync default state when viewport crosses the breakpoint
    if (!root.classList.contains("user-toggled")) {
      setExpanded(root, toggle, e.matches)
    }
  }

  toggle.addEventListener("click", onToggleClick)
  document.addEventListener("click", onDocClick)
  document.addEventListener("keydown", onKey)
  mq.addEventListener("change", onMqChange)

  window.addCleanup(() => {
    toggle.removeEventListener("click", onToggleClick)
    document.removeEventListener("click", onDocClick)
    document.removeEventListener("keydown", onKey)
    mq.removeEventListener("change", onMqChange)
  })
}

document.addEventListener("nav", () => {
  document.querySelectorAll<HTMLElement>(".nav-menu").forEach(attachNavMenu)
})
