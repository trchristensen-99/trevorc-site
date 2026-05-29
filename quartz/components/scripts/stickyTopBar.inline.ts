// Mobile-only sticky top bar with proportional reveal: each px of scroll up
// reveals 1 px of bar. After scrolling up by the bar's own height, the bar
// is fully visible. Same logic on scroll-down. The bar's CSS uses top: -2px
// and padding-top: 2px so its background extends past the viewport edge —
// no sliver of text shows above it during partial states.
const MOBILE_MQ = "(max-width: 700px)"
const ALWAYS_SHOW_BELOW = 1

let lastY = 0
let barOffset = 0
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
