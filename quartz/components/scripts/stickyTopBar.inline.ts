// Sticky top bar tied to scroll direction. Behavior is configurable
// via html[data-topbar-reveal]:
//
//   off     → bar stays hidden once scrolled past; only the top-of-page
//             pin zone reveals it.
//   slow    → upward scroll of 80 px triggers reveal (long, slow fade)
//   normal  → 30 px (default, moderate fade)
//   fast    → 10 px (short, snappy fade)
//   instant → any upward motion reveals; no transition
//
// The bar is a binary visible/hidden state with a smooth CSS
// transition; we accumulate scroll delta in the current direction
// and flip state once the threshold is crossed. This is more
// predictable than tracking pixel offsets per frame, and the smooth
// transition matches the fade used elsewhere on the site.

interface RevealConfig {
  showThreshold: number
  hideThreshold: number
  durationMs: number
  alwaysReveal: boolean
}

const REVEAL_CONFIG: Record<string, RevealConfig> = {
  off: { showThreshold: Infinity, hideThreshold: 30, durationMs: 200, alwaysReveal: false },
  slow: { showThreshold: 80, hideThreshold: 30, durationMs: 400, alwaysReveal: false },
  normal: { showThreshold: 30, hideThreshold: 30, durationMs: 250, alwaysReveal: false },
  fast: { showThreshold: 10, hideThreshold: 30, durationMs: 150, alwaysReveal: false },
  instant: { showThreshold: 1, hideThreshold: 30, durationMs: 0, alwaysReveal: true },
}

// Top-of-page pin zone — bar stays visible inside this slab regardless
// of scroll direction so sub-pixel jitter near y=0 doesn't flash it
// off and on.
const STAY_VISIBLE_PX = 4

let lastY = 0
let accumDelta = 0
let lastSignedDir = 0
let hidden = false
let ticking = false

function revealMode(): string {
  return document.documentElement.getAttribute("data-topbar-reveal") || "normal"
}

function applyState(headers: NodeListOf<HTMLElement>, cfg: RevealConfig) {
  headers.forEach((h) => {
    h.style.transition = `transform ${cfg.durationMs}ms ease-out`
    h.style.transform = hidden ? "translateY(-100%)" : "translateY(0)"
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
    const mode = revealMode()
    const cfg = REVEAL_CONFIG[mode] ?? REVEAL_CONFIG.normal

    // Reset the accumulator whenever direction flips, so a quick
    // up-then-down doesn't combine into a misleading sum.
    const dir = Math.sign(dy)
    if (dir !== 0 && dir !== lastSignedDir) {
      accumDelta = 0
      lastSignedDir = dir
    }
    accumDelta += dy

    let nextHidden = hidden
    if (y < STAY_VISIBLE_PX) {
      // Pinned visible near the top.
      nextHidden = false
      accumDelta = 0
    } else if (cfg.alwaysReveal && dy < 0) {
      nextHidden = false
      accumDelta = 0
    } else if (!hidden && accumDelta > cfg.hideThreshold) {
      nextHidden = true
      accumDelta = 0
    } else if (hidden && accumDelta < -cfg.showThreshold) {
      nextHidden = false
      accumDelta = 0
    }

    if (nextHidden !== hidden) {
      hidden = nextHidden
      applyState(headers, cfg)
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
    accumDelta = 0
    lastSignedDir = 0
    hidden = false
    // Apply the initial (visible, no transition) state so the bar
    // doesn't animate in on first paint.
    document.querySelectorAll<HTMLElement>(".page-header > header").forEach((h) => {
      h.style.transition = "transform 0ms"
      h.style.transform = "translateY(0)"
    })
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
