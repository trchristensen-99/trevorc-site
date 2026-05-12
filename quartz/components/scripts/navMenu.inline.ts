function attachNavMenu(root: HTMLElement) {
  const toggle = root.querySelector<HTMLButtonElement>(".nav-menu-toggle")
  const panel = root.querySelector<HTMLElement>(".nav-menu-list")
  if (!toggle || !panel) return

  const open = () => {
    panel.removeAttribute("hidden")
    toggle.setAttribute("aria-expanded", "true")
    root.classList.add("nav-menu-open")
  }
  const close = () => {
    panel.setAttribute("hidden", "")
    toggle.setAttribute("aria-expanded", "false")
    root.classList.remove("nav-menu-open")
  }
  const toggleOpen = () => {
    if (toggle.getAttribute("aria-expanded") === "true") close()
    else open()
  }

  const onToggleClick = (e: Event) => {
    e.stopPropagation()
    toggleOpen()
  }
  const onDocClick = (e: Event) => {
    if (toggle.getAttribute("aria-expanded") !== "true") return
    const t = e.target as Node | null
    if (!t) return
    if (root.contains(t)) return
    close()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close()
  }

  toggle.addEventListener("click", onToggleClick)
  document.addEventListener("click", onDocClick)
  document.addEventListener("keydown", onKey)

  window.addCleanup(() => {
    toggle.removeEventListener("click", onToggleClick)
    document.removeEventListener("click", onDocClick)
    document.removeEventListener("keydown", onKey)
  })
}

document.addEventListener("nav", () => {
  document.querySelectorAll<HTMLElement>(".nav-menu").forEach(attachNavMenu)
})
