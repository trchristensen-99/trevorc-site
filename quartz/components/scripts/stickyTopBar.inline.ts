// Sticky top bar tied to scroll direction. Reveal is moderately
// accelerated (REVEAL_GAIN px of bar per 1 px of scroll up) so a
// little scroll-up brings the bar most of the way back in without
// snapping it fully visible on the lightest touch. Hide tracks scroll
// 1:1 so the bar doesn't disappear in a flash when you start
// scrolling down.
const ALWAYS_SHOW_BELOW = 1
const REVEAL_GAIN = 2
const HIDE_GAIN = 1

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
        const gain = dy < 0 ? REVEAL_GAIN : HIDE_GAIN
        barOffset = Math.max(-barHeight, Math.min(0, barOffset - dy * gain))
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
