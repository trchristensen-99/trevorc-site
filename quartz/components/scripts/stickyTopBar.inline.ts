// Sticky top bar tied to scroll direction, configurable via
// html[data-topbar-reveal]:
//
//   off     → only the top-of-page pin zone brings it back
//   slow    → reveals at half your scroll rate
//   normal  → reveals 1:1 with your scroll (default)
//   fast    → reveals at twice your scroll rate
//   instant → snaps fully open on any upward scroll
//
// The bar tracks scroll position directly rather than flipping between
// two states on a threshold. Scrolling up drags it back into view by
// the distance you scrolled (times the gain), so a small scroll peeks
// at it and a larger one pulls it fully down. That makes it usable for
// a quick glance without committing to a full reveal. Hiding is always
// 1:1 so it doesn't snap away under you.

interface RevealConfig {
  gain: number
  snap: boolean
}

const REVEAL_CONFIG: Record<string, RevealConfig> = {
  off: { gain: 0, snap: false },
  slow: { gain: 0.5, snap: false },
  normal: { gain: 1, snap: false },
  fast: { gain: 2, snap: false },
  instant: { gain: 0, snap: true },
}

// Bar stays pinned inside this slab at the top so sub-pixel jitter at
// y≈0 can't flicker it.
const STAY_VISIBLE_PX = 4

let lastY = 0
let barOffset = 0
let ticking = false

function revealMode(): string {
  return document.documentElement.getAttribute("data-topbar-reveal") || "normal"
}

function paint(headers: NodeListOf<HTMLElement>, animate: boolean) {
  headers.forEach((h) => {
    h.style.transition = animate ? "transform 150ms ease-out" : "transform 0ms"
    // A non-none transform makes the header a containing block for the
    // position:fixed search modal, which knocks it off-centre. Fully
    // revealed is the common case, so clear the transform entirely there.
    h.style.transform = barOffset === 0 ? "none" : `translateY(${barOffset}px)`
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
    lastY = y
    const cfg = REVEAL_CONFIG[revealMode()] ?? REVEAL_CONFIG.normal
    const barHeight = headers[0].offsetHeight || 50
    const prev = barOffset
    let animate = false

    if (y < STAY_VISIBLE_PX) {
      barOffset = 0
    } else if (dy > 0) {
      // Hiding always tracks 1:1 with the scroll.
      barOffset = Math.max(-barHeight, barOffset - dy)
    } else if (dy < 0) {
      if (cfg.snap) {
        barOffset = 0
        animate = true
      } else {
        barOffset = Math.min(0, barOffset + -dy * cfg.gain)
      }
    }

    if (barOffset !== prev) paint(headers, animate)
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

let scrollBound = false
function init() {
  try {
    lastY = window.scrollY
    barOffset = 0
    document.querySelectorAll<HTMLElement>(".page-header > header").forEach((h) => {
      h.style.transition = "transform 0ms"
      h.style.transform = "none"
    })
    if (!scrollBound) {
      scrollBound = true
      window.addEventListener("scroll", onScroll, { passive: true })
      if (typeof window.addCleanup === "function") {
        window.addCleanup(() => {
          scrollBound = false
          window.removeEventListener("scroll", onScroll)
        })
      }
    }
  } catch (_e) {
    /* swallow */
  }
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
