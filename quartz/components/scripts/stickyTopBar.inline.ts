// Mobile-only sticky top bar with proportional reveal: as the user scrolls
// up, the bar slides down at the same rate, as if it were the next element
// in line above the page. Scrolling down hides it at the same rate.
const MOBILE_MQ = "(max-width: 700px)"
const ALWAYS_SHOW_BELOW = 20 // px scrolled past top: above this, allow hide

let lastY = 0
let barOffset = 0 // current translateY in px (range: [-barHeight, 0])
let ticking = false

function update() {
  try {
    const mq = window.matchMedia(MOBILE_MQ)
    const headers = document.querySelectorAll<HTMLElement>(".page-header > header")
    if (headers.length === 0) {
      ticking = false
      return
    }
    const y = Math.max(0, window.scrollY)
    const dy = y - lastY

    headers.forEach((h) => {
      if (!mq.matches) {
        h.style.transform = ""
        return
      }
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
    // Defensive: don't let a scroll-handler error break other scripts.
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
