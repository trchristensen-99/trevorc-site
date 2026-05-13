function attachNavMenu(root: HTMLElement) {
  const toggle = root.querySelector<HTMLButtonElement>(".nav-menu-toggle")
  if (!toggle) return

  const open = () => {
    root.classList.remove("collapsed")
    toggle.setAttribute("aria-expanded", "true")
  }
  const close = () => {
    root.classList.add("collapsed")
    toggle.setAttribute("aria-expanded", "false")
  }

  const onToggleClick = (e: Event) => {
    e.stopPropagation()
    if (toggle.getAttribute("aria-expanded") === "true") close()
    else open()
  }
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
