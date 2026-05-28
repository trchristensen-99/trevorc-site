const STORAGE_KEY = "trevorc-breadcrumb-minimized"

function applyState(nav: HTMLElement, minimized: boolean) {
  nav.setAttribute("data-minimized", minimized ? "true" : "false")
}

function attach(nav: HTMLElement) {
  const hide = nav.querySelector<HTMLButtonElement>(".breadcrumb-hide")
  const show = nav.querySelector<HTMLButtonElement>(".breadcrumb-show")
  applyState(nav, localStorage.getItem(STORAGE_KEY) === "true")

  const onHide = () => {
    applyState(nav, true)
    localStorage.setItem(STORAGE_KEY, "true")
  }
  const onShow = () => {
    applyState(nav, false)
    localStorage.setItem(STORAGE_KEY, "false")
  }

  hide?.addEventListener("click", onHide)
  show?.addEventListener("click", onShow)

  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      hide?.removeEventListener("click", onHide)
      show?.removeEventListener("click", onShow)
    })
  }
}

function init() {
  document.querySelectorAll<HTMLElement>(".breadcrumb-container").forEach(attach)
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
