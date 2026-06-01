// Sticky top bar with binary show/hide driven by scroll direction.
// Any upward scroll reveals the bar; a small accumulated downward scroll
// hides it. CSS handles the slide animation via a transition on transform.
const ALWAYS_SHOW_BELOW = 1
const HIDE_AFTER_DOWN_PX = 12

let lastY = 0
let downAccum = 0
let ticking = false

function setVisible(headers: NodeListOf<HTMLElement>, visible: boolean) {
  headers.forEach((h) => {
    h.style.transform = visible ? "" : "translateY(-100%)"
  })
}

function update() {
  try {
    const headers = document.querySelectorAll<HTMLElement>(".page-header > header")
    if (headers.length === 0) {
      ticking = false
      return
    }
    const y = Math.max(0, window.scrollY)
    const dy = y - lastY

    if (y < ALWAYS_SHOW_BELOW) {
      setVisible(headers, true)
      downAccum = 0
    } else if (dy < 0) {
      // Any upward scroll → reveal.
      setVisible(headers, true)
      downAccum = 0
    } else if (dy > 0) {
      // Downward; accumulate a small distance before hiding so a stray
      // jitter doesn't flicker the bar away.
      downAccum += dy
      if (downAccum > HIDE_AFTER_DOWN_PX) {
        setVisible(headers, false)
      }
    }

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
    downAccum = 0
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
