// Sticky top bar with proportional reveal: each pixel of scroll up
// reveals exactly 1 pixel of bar (1:1 with the page's own scroll rate),
// and each pixel of scroll down hides 1 pixel. Same logic on every
// viewport so the bar drops in/out at the same rate as the page scrolls.
const ALWAYS_SHOW_BELOW = 1

let lastY = 0
let barOffset = 0
let ticking = false

function update() {
  try {
    const headers = document.querySelectorAll<HTMLElement>(".page-header > header")
    if (headers.length === 0) {
      ticking = false
      return
    }
    const y = Math.max(0, window.scrollY)
    const dy = y - lastY

    headers.forEach((h) => {
      const barHeight = h.offsetHeight || 50
      if (y < ALWAYS_SHOW_BELOW) {
        barOffset = 0
      } else {
        barOffset = Math.max(-barHeight, Math.min(0, barOffset - dy))
      }
      h.style.transform = `translateY(${barOffset}px)`
    })

    lastY = y
  } catch (_e) {
    /* swallow */
  }
  ticking = false
}

function onScroll() {
  if (ticking) return
  ticking = true
  window.requestAnimationFrame(update)
}

function init() {
  try {
    lastY = window.scrollY
    barOffset = 0
    window.addEventListener("scroll", onScroll, { passive: true })
    if (typeof window.addCleanup === "function") {
      window.addCleanup(() => window.removeEventListener("scroll", onScroll))
    }
  } catch (_e) {
    /* swallow */
  }
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
