// Switcher between the copied trees, added to each copy. Also opens outside links in a new tab,
// so following a source from a node's notes doesn't replace the tree.
;(() => {
  const PAGES = [
    ["foresight-longevity", "Longevity"],
    ["foresight-neurotech", "Neurotech"],
    ["foresight-nanotech", "Nanotech"],
    ["foresight-space", "Space"],
    ["foresight-cooperation", "Cooperation"],
    ["antimortality", "Antimortality"],
  ]
  const here = document.currentScript.dataset.current
  const style = document.createElement("style")
  style.textContent = `
    .insp-nav { position: fixed; z-index: 2147483000; left: 12px; bottom: 12px; max-width: calc(100% - 24px);
      display: flex; gap: 2px; align-items: center; overflow-x: auto; scrollbar-width: none;
      padding: 4px; border-radius: 10px; background: rgba(20, 24, 30, 0.88); box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      font: 13px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .insp-nav a { color: #dfe5ec; text-decoration: none; padding: 5px 9px; border-radius: 7px; white-space: nowrap; }
    .insp-nav a:hover { background: rgba(255,255,255,0.12); }
    .insp-nav a[aria-current] { background: #e7ebef; color: #11161c; }
    .insp-nav .sep { width: 1px; align-self: stretch; margin: 4px 3px; background: rgba(255,255,255,0.25); flex: none; }
    @media print { .insp-nav { display: none; } }`
  const nav = document.createElement("nav")
  nav.className = "insp-nav"
  nav.setAttribute("aria-label", "Inspirations")
  const link = (href, text, current) => {
    const a = document.createElement("a")
    a.href = href
    a.textContent = text
    if (current) a.setAttribute("aria-current", "page")
    return a
  }
  nav.append(link("../", "← Inspirations"))
  const sep = () => Object.assign(document.createElement("span"), { className: "sep" })
  nav.append(sep())
  PAGES.forEach(([dir, name], i) => {
    if (dir === "antimortality") nav.append(sep())
    nav.append(link(`../${dir}/`, name, dir === here))
  })
  const add = () => { document.head.append(style); document.body.append(nav) }
  document.body ? add() : document.addEventListener("DOMContentLoaded", add)

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]")
    if (!a || a.target || nav.contains(a)) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin) { a.target = "_blank"; a.rel = "noopener" }
  }, true)
})()
