// Sticky top bar tied to scroll direction. Behavior is configurable
// via html[data-topbar-reveal]:
//
//   off     → bar stays hidden once scrolled past; only the top-of-page
//             "fixed" zone shows it again.
//   slow    → 1× scroll rate (true 1:1 with the page)
//   normal  → 2× scroll rate (default)
//   fast    → 4× scroll rate
//   instant → snaps fully visible on any upward scroll
//
// Hide always tracks scroll 1:1 so the bar doesn't blink away when the
// user starts scrolling down. While the user is still in the top
// STAY_VISIBLE_PX of the page the bar is pinned visible (it shouldn't
// slide off on tiny scrolls near the top).
const HIDE_GAIN = 1
// Tiny pin zone — just enough to absorb sub-pixel jitter at exact y=0
// (browser repaints, address-bar adjustments on mobile). Beyond that
// the bar tracks scroll the same as the rest of the page.
const STAY_VISIBLE_PX = 4

const REVEAL_GAINS: Record<string, number> = {
  off: 0,
  slow: 2,
  normal: 5,
  fast: 10,
  instant: 99999,
}

let lastY = 0
let barOffset = 0
let ticking = false
// Track the most recent non-zero scroll direction so a sub-pixel
// upward motion (touch fling, smooth-scroll snapping) still flips us
// into reveal mode even if the rAF frame's dy reads as exactly 0.
let lastDir = 0

function revealMode(): string {
  return document.documentElement.getAttribute("data-topbar-reveal") || "normal"
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
    if (dy !== 0) lastDir = dy < 0 ? -1 : 1
    const mode = revealMode()

    headers.forEach((h) => {
      const barHeight = h.offsetHeight || 50

      // Tiny absolute pin: bar stays put only in the first few px of
      // scroll to absorb sub-pixel jitter. Once past that, the reveal
      // logic for the active mode runs every frame.
      if (y < STAY_VISIBLE_PX) {
        barOffset = 0
      } else if (mode === "instant") {
        if (dy < 0 || (dy === 0 && lastDir < 0)) {
          barOffset = 0
        } else if (dy > 0) {
          barOffset = Math.max(-barHeight, barOffset - dy * HIDE_GAIN)
        }
      } else if (mode === "off") {
        if (dy > 0) {
          barOffset = Math.max(-barHeight, barOffset - dy * HIDE_GAIN)
        }
      } else {
        const gain = dy < 0 ? REVEAL_GAINS[mode] ?? REVEAL_GAINS.normal : HIDE_GAIN
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
