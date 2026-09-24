// Click-to-reveal spoiler spans. Authors write
//   <span class="spoiler">hidden text</span>
// in markdown; this blurs the text until clicked, then reveals it
// permanently for that page view. Keyboard accessible: the span is
// focusable and responds to Enter/Space.

function reveal(el: HTMLElement) {
  el.setAttribute("data-revealed", "true")
  el.setAttribute("aria-expanded", "true")
  el.removeAttribute("tabindex")
  el.removeAttribute("role")
}

function bind(el: HTMLElement) {
  if (el.getAttribute("data-spoiler-bound") === "true") return
  el.setAttribute("data-spoiler-bound", "true")
  el.setAttribute("data-revealed", "false")
  el.setAttribute("role", "button")
  el.setAttribute("tabindex", "0")
  el.setAttribute("aria-expanded", "false")
  el.setAttribute("aria-label", "Spoiler, click to reveal")

  const onClick = () => reveal(el)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      reveal(el)
    }
  }
  el.addEventListener("click", onClick)
  el.addEventListener("keydown", onKey)
  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      el.removeEventListener("click", onClick)
      el.removeEventListener("keydown", onKey)
    })
  }
}

function init() {
  document.querySelectorAll<HTMLElement>("span.spoiler, .spoiler").forEach(bind)
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
