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
const STAY_VISIBLE_PX = 96

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
    const mode = revealMode()

    headers.forEach((h) => {
      const barHeight = h.offsetHeight || 50
      const pinUntil = Math.max(STAY_VISIBLE_PX, barHeight)

      if (y < pinUntil) {
        // Near the top of the page: the bar stays put. The user
        // shouldn't see it slide off on the tiniest scroll.
        barOffset = 0
      } else if (mode === "instant") {
        // Any upward dy snaps fully visible; downward hides 1:1.
        if (dy < 0) {
          barOffset = 0
        } else if (dy > 0) {
          barOffset = Math.max(-barHeight, barOffset - dy * HIDE_GAIN)
        }
      } else if (mode === "off") {
        // No reveal on scroll up; only the pin zone above brings it back.
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
