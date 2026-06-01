// Sticky top bar tied to scroll direction. The reveal speed (and
// whether the bar reveals at all on scroll-up) is configurable via
// the settings panel — see data-topbar-reveal on <html>.
//
//   off     → bar stays hidden after the first scroll-down, only
//             reappears when the page reaches the top.
//   slow    → 1× scroll rate (bar moves 1 px per 1 px of scroll up)
//   normal  → 2× scroll rate (default)
//   fast    → 4× scroll rate
//   instant → bar snaps fully visible on any upward scroll
//
// Hide always tracks scroll 1:1 so the bar doesn't disappear in a
// flash when the user starts scrolling down.
const ALWAYS_SHOW_BELOW = 1
const HIDE_GAIN = 1

const REVEAL_GAINS: Record<string, number> = {
  off: 0,
  slow: 1,
  normal: 2,
  fast: 4,
  instant: 99999,
}

let lastY = 0
let barOffset = 0
let ticking = false

function revealGain(): number {
  const mode = document.documentElement.getAttribute("data-topbar-reveal") || "normal"
  return REVEAL_GAINS[mode] ?? REVEAL_GAINS.normal
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
    const gainUp = revealGain()

    headers.forEach((h) => {
      const barHeight = h.offsetHeight || 50
      if (y < ALWAYS_SHOW_BELOW) {
        barOffset = 0
      } else {
        const gain = dy < 0 ? gainUp : HIDE_GAIN
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
