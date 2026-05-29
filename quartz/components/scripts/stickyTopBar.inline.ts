// Mobile-only sticky top bar. Binary state (fully visible / fully hidden)
// with a CSS transition for the animation. Binary state is the only way to
// keep the bar flush with the top of the viewport — any partial transform
// leaves a gap above the bar where scrolling content shows through.
const MOBILE_MQ = "(max-width: 700px)"
const ALWAYS_SHOW_BELOW = 1
const REVEAL_THRESHOLD = 0 // any scroll-up reveals
const HIDE_THRESHOLD = 6 // px scroll-down before hiding

let lastY = 0
let ticking = false

function setHidden(h: HTMLElement, hidden: boolean) {
  if (hidden) h.classList.add("top-bar-hidden")
  else h.classList.remove("top-bar-hidden")
}

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
        setHidden(h, false)
        return
      }
      const barHeight = h.offsetHeight || 50
      if (y < ALWAYS_SHOW_BELOW) {
        setHidden(h, false)
      } else if (dy < 0) {
        // Any scroll up at all reveals the bar immediately.
        setHidden(h, false)
      } else if (dy > HIDE_THRESHOLD && y > barHeight) {
        setHidden(h, true)
      }
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
