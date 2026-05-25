// Mobile-only: hide the top bar when the user scrolls down, reveal it as
// soon as they scroll up. Saves screen real-estate while keeping the bar
// reachable.
const MOBILE_MQ = "(max-width: 700px)"
const HIDE_THRESHOLD = 80 // px scrolled past before hiding starts

let lastY = 0
let ticking = false

function update() {
  const mq = window.matchMedia(MOBILE_MQ)
  const headers = document.querySelectorAll<HTMLElement>(".page-header")
  if (headers.length === 0) {
    ticking = false
    return
  }
  const y = window.scrollY
  const dy = y - lastY
  headers.forEach((h) => {
    if (!mq.matches) {
      h.classList.remove("top-bar-hidden")
      return
    }
    if (y < HIDE_THRESHOLD) {
      h.classList.remove("top-bar-hidden")
    } else if (dy > 4) {
      h.classList.add("top-bar-hidden")
    } else if (dy < -4) {
      h.classList.remove("top-bar-hidden")
    }
  })
  lastY = y
  ticking = false
}

function onScroll() {
  if (ticking) return
  ticking = true
  window.requestAnimationFrame(update)
}

function init() {
  lastY = window.scrollY
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addCleanup(() => window.removeEventListener("scroll", onScroll))
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
