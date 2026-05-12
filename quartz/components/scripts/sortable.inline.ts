const STORAGE_IMPORTANCE_MODE = "trevorc-importance-mode"

type ImportanceMode = "raw" | "calibrated"
type Direction = "asc" | "desc"

function getImportanceMode(root: HTMLElement): ImportanceMode {
  const saved = localStorage.getItem(STORAGE_IMPORTANCE_MODE)
  if (saved === "raw" || saved === "calibrated") return saved
  const attr = root.getAttribute("data-importance-mode")
  return attr === "raw" ? "raw" : "calibrated"
}

function setImportanceMode(root: HTMLElement, mode: ImportanceMode) {
  root.setAttribute("data-importance-mode", mode)
  localStorage.setItem(STORAGE_IMPORTANCE_MODE, mode)
  root.querySelectorAll<HTMLButtonElement>(".importance-toggle button").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.getAttribute("data-mode") === mode ? "true" : "false")
  })
  root.querySelectorAll<HTMLTableCellElement>(".imp-cell").forEach((cell) => {
    cell.textContent = cell.getAttribute(`data-${mode}-text`) ?? "-"
  })
}

// Map the column-display key to the actual data attribute used for sorting
function resolveSortAttr(displayKey: string, root: HTMLElement): string {
  if (displayKey === "importance") return getImportanceMode(root)
  return displayKey
}

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
  // CSS.escape so slugs with special chars work; ids contain `--` but no `.`
  const row = document.getElementById(id)
  if (!row) return
  // Wait for next paint so sort completes before scrolling
  requestAnimationFrame(() => {
    row.scrollIntoView({ behavior: "smooth", block: "center" })
    row.classList.add("highlight-row")
    setTimeout(() => row.classList.remove("highlight-row"), 2500)
  })
}

function applyInitialSortFromURL(root: HTMLElement, table: HTMLTableElement) {
  const params = new URLSearchParams(window.location.search)
  const sortParam = params.get("sort")
  const dirParam = params.get("dir")
  if (!sortParam) return

  // sort=raw or sort=calibrated: switch toggle and use importance column
  let displayKey: string = sortParam
  if (sortParam === "raw" || sortParam === "calibrated") {
    setImportanceMode(root, sortParam as ImportanceMode)
    displayKey = "importance"
  }

  const th = table.querySelector<HTMLElement>(`th[data-sort="${displayKey}"]`)
  if (!th) return

  const defaultDir = (th.getAttribute("data-default-dir") as Direction | null) ?? "desc"
  const dir: Direction = dirParam === "asc" || dirParam === "desc" ? dirParam : defaultDir
  table
    .querySelectorAll<HTMLElement>("th[data-sort]")
    .forEach((h) => h.removeAttribute("data-dir"))
  th.setAttribute("data-dir", dir)

  sortRows(table, resolveSortAttr(displayKey, root), dir)
}

function attachOne(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("table")
  if (!table) return

  // Apply persisted importance mode (independent of URL)
  setImportanceMode(root, getImportanceMode(root))
  applyInitialSortFromURL(root, table)

  const headers = table.querySelectorAll<HTMLElement>("th[data-sort]")
  headers.forEach((th) => {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.closest(".importance-toggle")) return
      const displayKey = th.getAttribute("data-sort")!
      const defaultDir = (th.getAttribute("data-default-dir") as Direction | null) ?? "desc"
      const currentDir = th.getAttribute("data-dir")
      const newDir: Direction = currentDir
        ? currentDir === "asc"
          ? "desc"
          : "asc"
        : defaultDir
      headers.forEach((h) => h.removeAttribute("data-dir"))
      th.setAttribute("data-dir", newDir)
      sortRows(table, resolveSortAttr(displayKey, root), newDir)

      const url = new URL(window.location.href)
      url.searchParams.set("sort", displayKey)
      url.searchParams.set("dir", newDir)
      url.hash = ""
      window.history.replaceState({}, "", url.toString())
    }
    th.addEventListener("click", handler)
    window.addCleanup(() => th.removeEventListener("click", handler))
  })

  root.querySelectorAll<HTMLButtonElement>(".importance-toggle button").forEach((btn) => {
    const handler = (e: Event) => {
      e.stopPropagation()
      const mode = btn.getAttribute("data-mode") as ImportanceMode | null
      if (!mode) return
      setImportanceMode(root, mode)
      const impTh = table.querySelector<HTMLElement>('th[data-sort="importance"]')
      const currentDir = impTh?.getAttribute("data-dir") as Direction | null
      if (currentDir) sortRows(table, mode, currentDir)
    }
    btn.addEventListener("click", handler)
    window.addCleanup(() => btn.removeEventListener("click", handler))
  })

  scrollToHash()
}

function attachSortHandlers() {
  document.querySelectorAll<HTMLDivElement>(".sortable-list").forEach((root) => attachOne(root))
}

document.addEventListener("nav", attachSortHandlers)
