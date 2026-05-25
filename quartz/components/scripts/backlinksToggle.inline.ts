function attachToggle(root: HTMLElement) {
  const toggle = root.querySelector<HTMLButtonElement>(".backlinks-toggle")
  if (!toggle) return
  const handler = () => {
    const expanded = root.getAttribute("data-expanded") === "true"
    root.setAttribute("data-expanded", expanded ? "false" : "true")
    toggle.textContent = expanded ? "more" : "less"
  }
  toggle.addEventListener("click", handler)
  window.addCleanup(() => toggle.removeEventListener("click", handler))
}

function init() {
  document.querySelectorAll<HTMLElement>(".backlinks").forEach(attachToggle)
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
