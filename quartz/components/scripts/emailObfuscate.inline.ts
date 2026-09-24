// Scraper-resistant but human-visible email addresses.
//
// Markup (safe to write in markdown):
//   <span class="email-obf" data-eml="<base64>">contact at trevorc dot com</span>
//
// The base64 payload is decoded at runtime and becomes a real mailto
// link. Three audiences, three outcomes:
//   - JS on:  a normal clickable "contact@trevorc.com" link.
//   - JS off: the fallback text stays, which a human can read but a
//             regex harvester won't match (no "@", no bare domain).
//   - Naive scrapers: see only the fallback text and an opaque blob.
//
// This is a speed bump rather than a wall -- a headless-browser scraper
// still gets the address -- but it stops the large majority of simple
// crawlers, which is the same bargain Cloudflare's version makes. The
// difference is that the no-JS fallback here is readable instead of
// the useless "[email protected]".

function decode(b64: string): string | null {
  try {
    return atob(b64)
  } catch {
    return null
  }
}

function hydrate(el: HTMLElement) {
  if (el.getAttribute("data-eml-done") === "true") return
  const payload = el.getAttribute("data-eml")
  if (!payload) return
  const addr = decode(payload)
  if (!addr || !addr.includes("@")) return

  const a = document.createElement("a")
  a.href = "mailto:" + addr
  a.textContent = addr
  a.className = "external-nolink"
  el.textContent = ""
  el.appendChild(a)
  el.setAttribute("data-eml-done", "true")
}

function init() {
  document.querySelectorAll<HTMLElement>("span.email-obf[data-eml]").forEach(hydrate)
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
