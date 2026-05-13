function attachNavMenu(root: HTMLElement) {
  const toggle = root.querySelector<HTMLButtonElement>(".nav-menu-toggle")
  const closeBtn = root.querySelector<HTMLButtonElement>(".nav-menu-close")
  const list = root.querySelector<HTMLElement>(".nav-menu-list")
  if (!toggle || !list) return

  const open = () => {
    list.removeAttribute("hidden")
    root.classList.remove("collapsed")
    toggle.setAttribute("aria-expanded", "true")
  }
  const close = () => {
    list.setAttribute("hidden", "")
    root.classList.add("collapsed")
    toggle.setAttribute("aria-expanded", "false")
  }

  const onToggleClick = (e: Event) => {
    e.stopPropagation()
    if (toggle.getAttribute("aria-expanded") === "true") close()
    else open()
  }
  const onCloseClick = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
    close()
  }
  const onLinkClick = () => close()
  const onDocClick = (e: Event) => {
    if (toggle.getAttribute("aria-expanded") !== "true") return
    const t = e.target as Node | null
    if (!t || root.contains(t)) return
    close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close()
  }

  toggle.addEventListener("click", onToggleClick)
  closeBtn?.addEventListener("click", onCloseClick)
  const links = root.querySelectorAll<HTMLAnchorElement>(".nav-menu-link")
  links.forEach((link) => link.addEventListener("click", onLinkClick))
  document.addEventListener("click", onDocClick)
  document.addEventListener("keydown", onKey)

  window.addCleanup(() => {
    toggle.removeEventListener("click", onToggleClick)
    closeBtn?.removeEventListener("click", onCloseClick)
    links.forEach((link) => link.removeEventListener("click", onLinkClick))
    document.removeEventListener("click", onDocClick)
    document.removeEventListener("keydown", onKey)
  })
}

function initAll() {
  document.querySelectorAll<HTMLElement>(".nav-menu").forEach((root) => {
    // Force collapsed state on every (re)initialization
    root.classList.add("collapsed")
    const list = root.querySelector<HTMLElement>(".nav-menu-list")
    if (list) list.setAttribute("hidden", "")
    const toggle = root.querySelector<HTMLButtonElement>(".nav-menu-toggle")
    if (toggle) toggle.setAttribute("aria-expanded", "false")
    attachNavMenu(root)
  })
}

document.addEventListener("nav", initAll)
// Fallback for initial page load if the SPA nav event doesn't fire
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll, { once: true })
} else {
  initAll()
}
