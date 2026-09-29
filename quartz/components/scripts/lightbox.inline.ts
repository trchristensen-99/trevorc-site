// Click-to-expand lightbox for images.
//
// Serves two cases with one overlay:
//   - Article images: open the full image (content images are often
//     scaled down in the column) with its alt text as a caption and a
//     Download link so readers can keep a copy.
//   - /site-art thumbnails: the grid crops every thumbnail to 16:9 via
//     object-fit: cover, so the art page was showing slices of art it
//     was crediting. The lightbox shows the real uncropped image, and
//     carries the "Set as site background" action that used to fire on
//     a bare thumbnail click -- pinning a background is a deliberate
//     choice, not something a click on a picture should do silently.

let overlay: HTMLDivElement | null = null
let imgEl: HTMLImageElement | null = null
let capEl: HTMLElement | null = null
let actionsEl: HTMLElement | null = null
let lastFocus: HTMLElement | null = null

const SETTINGS_KEY = "trevorc-settings-v1"

function build(): HTMLDivElement {
  if (overlay && overlay.isConnected) return overlay
  overlay = document.createElement("div")
  overlay.className = "lightbox"
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-modal", "true")
  overlay.setAttribute("aria-label", "Expanded image")
  overlay.hidden = true
  overlay.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="Close">&times;</button>
    <figure class="lightbox-figure">
      <img class="lightbox-img" alt="" />
      <figcaption class="lightbox-caption"></figcaption>
      <div class="lightbox-actions"></div>
    </figure>`
  document.body.appendChild(overlay)
  imgEl = overlay.querySelector(".lightbox-img")
  capEl = overlay.querySelector(".lightbox-caption")
  actionsEl = overlay.querySelector(".lightbox-actions")

  overlay.addEventListener("click", (e) => {
    const t = e.target as Element
    // Backdrop or close button dismiss; clicks on the figure don't.
    if (t === overlay || t.closest(".lightbox-close")) close()
  })
  return overlay
}

function close() {
  if (!overlay) return
  overlay.hidden = true
  document.documentElement.style.overflow = ""
  if (lastFocus) {
    lastFocus.focus()
    lastFocus = null
  }
}

function filenameOf(src: string): string {
  try {
    return decodeURIComponent(new URL(src, location.href).pathname.split("/").pop() || "image")
  } catch {
    return "image"
  }
}

function open(src: string, caption: string, directArt: string | null, trigger: HTMLElement) {
  const el = build()
  lastFocus = trigger
  imgEl!.src = src
  imgEl!.alt = caption
  capEl!.textContent = caption
  capEl!.hidden = !caption

  actionsEl!.innerHTML = ""
  const dl = document.createElement("a")
  dl.href = src
  dl.download = filenameOf(src)
  dl.className = "lightbox-action"
  dl.textContent = "Download"
  actionsEl!.appendChild(dl)

  if (directArt) {
    const pin = document.createElement("button")
    pin.type = "button"
    pin.className = "lightbox-action"
    pin.textContent = "Set as site background"
    pin.addEventListener("click", () => {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        parsed.directArt = directArt
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed))
      } catch (_e) {
        /* swallow */
      }
      document.documentElement.setAttribute("data-direct-art", directArt)
      document.dispatchEvent(new CustomEvent("site-art-changed"))
      pin.textContent = "Set ✓"
      window.setTimeout(close, 450)
    })
    actionsEl!.appendChild(pin)
  }

  el.hidden = false
  // Lock body scroll while the overlay is up.
  document.documentElement.style.overflow = "hidden"
  ;(el.querySelector(".lightbox-close") as HTMLElement)?.focus()
}

function captionFor(img: HTMLImageElement): string {
  const fig = img.closest("figure")
  const cap = fig?.querySelector("figcaption")
  if (cap) {
    // The /site-art figcaption holds the band and the artist as separate
    // elements stacked by CSS; textContent would glue them into
    // "before_sunrise Quantum Quasar Studio", so join the parts instead.
    const band = cap.querySelector(".band")?.textContent?.trim()
    const artist = cap.querySelector(".artist")?.textContent?.trim()
    if (band || artist) return [band, artist].filter(Boolean).join(" — ")
    const txt = cap.textContent?.trim()
    if (txt) return txt.replace(/\s+/g, " ")
  }
  return (img.getAttribute("alt") || "").trim()
}

function bind(img: HTMLImageElement) {
  if (img.getAttribute("data-lightbox-bound") === "true") return
  img.setAttribute("data-lightbox-bound", "true")
  img.style.cursor = "zoom-in"
  const handler = (e: Event) => {
    e.preventDefault()
    open(img.currentSrc || img.src, captionFor(img), img.getAttribute("data-direct-art"), img)
  }
  img.addEventListener("click", handler)
  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => img.removeEventListener("click", handler))
  }
}

function init() {
  // Article body images plus the /site-art credits grid. The fixed
  // background frames are decorative and deliberately excluded.
  document
    .querySelectorAll<HTMLImageElement>("article img:not(.site-art-frame), .art-grid img")
    .forEach(bind)
}

let escBound = false
function bindEsc() {
  if (escBound) return
  escBound = true
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && !overlay.hidden) close()
  })
}

document.addEventListener("nav", init)
bindEsc()
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
