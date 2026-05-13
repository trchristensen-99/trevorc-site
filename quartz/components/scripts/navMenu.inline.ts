// Event-delegation based menu handlers. One listener on the document catches
// all clicks regardless of when the menu DOM was attached or replaced, so the
// behavior survives SPA navigations and partial DOM updates.

function closeMenu(nm: HTMLElement) {
  nm.classList.add("collapsed")
  const list = nm.querySelector<HTMLElement>(".nav-menu-list")
  if (list) list.setAttribute("hidden", "")
  const toggle = nm.querySelector<HTMLButtonElement>(".nav-menu-toggle")
  if (toggle) toggle.setAttribute("aria-expanded", "false")
}

function openMenu(nm: HTMLElement) {
  nm.classList.remove("collapsed")
  const list = nm.querySelector<HTMLElement>(".nav-menu-list")
  if (list) list.removeAttribute("hidden")
  const toggle = nm.querySelector<HTMLButtonElement>(".nav-menu-toggle")
  if (toggle) toggle.setAttribute("aria-expanded", "true")
}

let handlersInstalled = false
function installGlobalHandlers() {
  if (handlersInstalled) return
  handlersInstalled = true

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      // Close button inside menu
      if (target.closest(".nav-menu-close")) {
        const nm = (target.closest(".nav-menu-close") as HTMLElement).closest(
          ".nav-menu",
        ) as HTMLElement | null
        if (nm) {
          closeMenu(nm)
          e.stopPropagation()
          e.preventDefault()
        }
        return
      }

      // Hamburger toggle
      const tBtn = target.closest(".nav-menu-toggle") as HTMLElement | null
      if (tBtn) {
        const nm = tBtn.closest(".nav-menu") as HTMLElement | null
        if (nm) {
          if (nm.classList.contains("collapsed")) openMenu(nm)
          else closeMenu(nm)
          e.stopPropagation()
        }
        return
      }

      // Clicking a link in the menu also closes the menu
      const lnk = target.closest(".nav-menu-link") as HTMLElement | null
      if (lnk) {
        const nm = lnk.closest(".nav-menu") as HTMLElement | null
        if (nm) closeMenu(nm)
        return
      }

      // Click outside any menu: close all open menus
      if (!target.closest(".nav-menu")) {
        document
          .querySelectorAll<HTMLElement>(".nav-menu:not(.collapsed)")
          .forEach((nm) => closeMenu(nm))
      }
    },
    true,
  )

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document
        .querySelectorAll<HTMLElement>(".nav-menu:not(.collapsed)")
        .forEach((nm) => closeMenu(nm))
    }
  })
}

function init() {
  installGlobalHandlers()
  // Force-collapsed state on every page (initial load and SPA nav)
  document.querySelectorAll<HTMLElement>(".nav-menu").forEach((nm) => closeMenu(nm))
}

document.addEventListener("nav", init)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true })
} else {
  init()
}
