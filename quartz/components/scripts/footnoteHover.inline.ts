// Footnote hover/click tooltip. Replaces Quartz's default link-preview
// popover behavior and the browser's anchor-jump for footnote refs with
// a small tooltip that shows the footnote text near the reference.
//
// Hover (desktop): show tooltip while the cursor is on the ref.
// Click (any device): prevent the page-bottom jump and "pin" the tooltip
// so it stays open. Click the same ref to toggle off; click anywhere
// outside to dismiss.

const HOVER_DELAY_MS = 200

let tooltipEl: HTMLDivElement | null = null
let pendingTimer: number | null = null
let pinnedRef: HTMLAnchorElement | null = null

function ensureTooltip(): HTMLDivElement {
  if (tooltipEl && tooltipEl.isConnected) return tooltipEl
  tooltipEl = document.createElement("div")
  tooltipEl.className = "footnote-tooltip"
  tooltipEl.setAttribute("role", "tooltip")
  tooltipEl.style.display = "none"
  document.body.appendChild(tooltipEl)
  return tooltipEl
}

function getFootnoteText(href: string): string | null {
  if (!href.startsWith("#")) return null
  const id = decodeURIComponent(href.slice(1))
  const target = document.getElementById(id)
  if (!target) return null
  // Clone so we can strip the back-reference arrow without touching the
  // real DOM.
  const clone = target.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll("a[data-footnote-backref], .data-footnote-backref")
    .forEach((el) => el.remove())
  return clone.textContent?.trim().replace(/\s+/g, " ") ?? null
}

function positionTooltip(tip: HTMLDivElement, link: HTMLElement) {
  // Reset to top-left to measure natural size.
  tip.style.left = "0px"
  tip.style.top = "0px"
  tip.style.transform = "translate(-9999px, -9999px)"
  tip.style.display = "block"

  const linkRect = link.getBoundingClientRect()
  const tipRect = tip.getBoundingClientRect()
  const margin = 8
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight

  // Prefer placement below the link, anchored to its left edge.
  let x = linkRect.left
  let y = linkRect.bottom + 6

  // Clamp horizontally inside the viewport.
  if (x + tipRect.width + margin > vw) x = vw - tipRect.width - margin
  if (x < margin) x = margin

  // Flip above the link if there isn't room below.
  if (y + tipRect.height + margin > vh) {
    y = linkRect.top - tipRect.height - 6
    if (y < margin) y = margin
  }

  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
}

function showFor(link: HTMLAnchorElement) {
  const href = link.getAttribute("href")
  if (!href) return
  const text = getFootnoteText(href)
  if (!text) return
  const tip = ensureTooltip()
  tip.textContent = text
  positionTooltip(tip, link)
}

function hide() {
  if (pendingTimer != null) {
    window.clearTimeout(pendingTimer)
    pendingTimer = null
  }
  if (tooltipEl) tooltipEl.style.display = "none"
  pinnedRef = null
}

function bind(link: HTMLAnchorElement) {
  // Suppress Quartz's default link-preview popover on footnote refs —
  // we replace it with our own tooltip.
  link.setAttribute("data-no-popover", "true")

  const onEnter = () => {
    if (pinnedRef) return
    if (pendingTimer != null) window.clearTimeout(pendingTimer)
    pendingTimer = window.setTimeout(() => showFor(link), HOVER_DELAY_MS)
  }
  const onLeave = () => {
    if (pinnedRef) return
    hide()
  }
  const onClick = (e: MouseEvent) => {
    // Suppress the browser's jump-to-anchor behaviour; the reader can
    // see the footnote in the tooltip instead.
    e.preventDefault()
    if (pinnedRef === link) {
      // Second click on the same ref toggles the tooltip off.
      hide()
      return
    }
    pinnedRef = link
    showFor(link)
  }

  link.addEventListener("mouseenter", onEnter)
  link.addEventListener("mouseleave", onLeave)
  link.addEventListener("click", onClick)
  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => {
      link.removeEventListener("mouseenter", onEnter)
      link.removeEventListener("mouseleave", onLeave)
      link.removeEventListener("click", onClick)
    })
  }
}

function init() {
  document
    .querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]")
    .forEach(bind)
}

// Click-anywhere-outside dismisses a pinned tooltip. Installed once
// (not per ref) since the listener lives on document for the page's
// lifetime.
let outsideInstalled = false
function installOutsideHandler() {
  if (outsideInstalled) return
  outsideInstalled = true
  document.addEventListener(
    "click",
    (e) => {
      if (!pinnedRef) return
      const t = e.target as Element | null
      if (!t) return
      // Clicks on a footnote ref are handled by its own onClick.
      if (t.closest("a[data-footnote-ref]")) return
      // Clicks inside the tooltip itself shouldn't dismiss.
      if (tooltipEl && tooltipEl.contains(t)) return
      hide()
    },
    true,
  )
}

document.addEventListener("nav", init)
installOutsideHandler()
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
