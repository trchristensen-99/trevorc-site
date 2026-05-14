function attachRelatedToggle(root: HTMLElement) {
  const toggle = root.querySelector<HTMLButtonElement>(".similar-toggle")
  if (!toggle) return
  const handler = () => {
    const expanded = root.getAttribute("data-expanded") === "true"
    root.setAttribute("data-expanded", expanded ? "false" : "true")
    toggle.textContent = expanded ? "more" : "less"
  }
  toggle.addEventListener("click", handler)
  window.addCleanup(() => toggle.removeEventListener("click", handler))
}

function initRelated() {
  document.querySelectorAll<HTMLElement>(".similar-pages").forEach(attachRelatedToggle)
}

document.addEventListener("nav", initRelated)
if (document.readyState !== "loading") initRelated()
else document.addEventListener("DOMContentLoaded", initRelated, { once: true })
