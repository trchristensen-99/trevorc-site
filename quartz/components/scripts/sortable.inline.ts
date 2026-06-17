type Direction = "asc" | "desc"

function sortRows(table: HTMLTableElement, dataAttr: string, dir: Direction) {
  const tbody = table.querySelector("tbody")
  if (!tbody) return
  const rows = Array.from(tbody.querySelectorAll("tr"))
  rows.sort((a, b) => {
    const av = a.getAttribute(`data-${dataAttr}`) ?? ""
    const bv = b.getAttribute(`data-${dataAttr}`) ?? ""
    const an = parseFloat(av)
    const bn = parseFloat(bv)
    if (!isNaN(an) && !isNaN(bn)) {
      return dir === "asc" ? an - bn : bn - an
    }
    return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
  })
  for (const row of rows) tbody.appendChild(row)
}

function scrollToHash() {
  const hash = window.location.hash
  if (!hash) return
  const id = hash.substring(1)
  const row = document.getElementById(id)
  if (!row) return
  requestAnimationFrame(() => {
    row.scrollIntoView({ behavior: "smooth", block: "center" })
    row.classList.add("highlight-row")
    setTimeout(() => row.classList.remove("highlight-row"), 2500)
  })
}

function applyInitialSortFromURL(table: HTMLTableElement) {
  const params = new URLSearchParams(window.location.search)
  let sortKey = params.get("sort")
  const dirParam = params.get("dir")
  // Fall back to whichever column is marked data-default-sort if the
  // URL doesn't request a specific sort. Keeps the table from showing
  // raw file order when a reader lands on /all without query params.
  if (!sortKey) {
    const defaultTh = table.querySelector<HTMLElement>('th[data-default-sort="true"]')
    if (defaultTh) sortKey = defaultTh.getAttribute("data-sort")
  }
  if (!sortKey) return
  const th = table.querySelector<HTMLElement>(`th[data-sort="${sortKey}"]`)
  if (!th) return
  const defaultDir = (th.getAttribute("data-default-dir") as Direction | null) ?? "desc"
  const dir: Direction = dirParam === "asc" || dirParam === "desc" ? dirParam : defaultDir
  table.querySelectorAll<HTMLElement>("th[data-sort]").forEach((h) => h.removeAttribute("data-dir"))
  th.setAttribute("data-dir", dir)
  sortRows(table, sortKey, dir)
}

function attachOne(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("table")
  if (!table) return
  applyInitialSortFromURL(table)

  const headers = table.querySelectorAll<HTMLElement>("th[data-sort]")
  headers.forEach((th) => {
    const handler = () => {
      const key = th.getAttribute("data-sort")!
      const defaultDir = (th.getAttribute("data-default-dir") as Direction | null) ?? "desc"
      const currentDir = th.getAttribute("data-dir")
      const newDir: Direction = currentDir
        ? currentDir === "asc"
          ? "desc"
          : "asc"
        : defaultDir
      headers.forEach((h) => h.removeAttribute("data-dir"))
      th.setAttribute("data-dir", newDir)
      sortRows(table, key, newDir)

      const url = new URL(window.location.href)
      url.searchParams.set("sort", key)
      url.searchParams.set("dir", newDir)
      url.hash = ""
      window.history.replaceState({}, "", url.toString())
    }
    th.addEventListener("click", handler)
    window.addCleanup(() => th.removeEventListener("click", handler))
  })

  scrollToHash()
}

function attachSortHandlers() {
  document.querySelectorAll<HTMLDivElement>(".sortable-list").forEach((root) => attachOne(root))
}

// Run on every navigation event, AND on the initial page load: when a
// reader follows a /all?sort=... link directly (not through SPA nav),
// spa.inline.ts fires its one-shot "nav" event before this listener is
// registered, so we'd otherwise miss it and the table stays unsorted.
document.addEventListener("nav", attachSortHandlers)
if (document.readyState !== "loading") attachSortHandlers()
else document.addEventListener("DOMContentLoaded", attachSortHandlers, { once: true })
