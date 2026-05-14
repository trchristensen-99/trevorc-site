// Filter (content vs meta) + sort controls for the /tags index page.
// State persisted in localStorage so the choice survives navigation.

const FILTER_KEY = "trevorc-tag-filter"
const SORT_KEY = "trevorc-tag-sort"
const DEFAULT_FILTER = new Set(["content"])
const DEFAULT_SORT = "alpha-asc"

type SortMode = "alpha-asc" | "alpha-desc" | "count-desc" | "count-asc"

function readFilter(): Set<string> {
  const raw = localStorage.getItem(FILTER_KEY)
  if (raw === null) return new Set(DEFAULT_FILTER)
  return new Set(raw.split(",").filter((s) => s.length > 0))
}

function readSort(): SortMode {
  const raw = localStorage.getItem(SORT_KEY)
  if (raw === "alpha-asc" || raw === "alpha-desc" || raw === "count-desc" || raw === "count-asc") {
    return raw
  }
  return DEFAULT_SORT
}

function applyFilter(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>(".tag-index-list")
  if (!list) return
  const visible = readFilter()
  list.querySelectorAll<HTMLLIElement>("li").forEach((li) => {
    const cat = li.getAttribute("data-category") ?? "content"
    li.style.display = visible.has(cat) ? "" : "none"
  })
}

function applySort(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>(".tag-index-list")
  if (!list) return
  const mode = readSort()
  const items = Array.from(list.querySelectorAll<HTMLLIElement>("li"))
  items.sort((a, b) => {
    if (mode === "alpha-asc" || mode === "alpha-desc") {
      const an = (a.getAttribute("data-name") ?? "").toLowerCase()
      const bn = (b.getAttribute("data-name") ?? "").toLowerCase()
      const cmp = an.localeCompare(bn)
      return mode === "alpha-asc" ? cmp : -cmp
    }
    const ac = parseFloat(a.getAttribute("data-count") ?? "0")
    const bc = parseFloat(b.getAttribute("data-count") ?? "0")
    return mode === "count-desc" ? bc - ac : ac - bc
  })
  for (const li of items) list.appendChild(li)
}

function attach(root: HTMLElement) {
  const filter = readFilter()
  const sort = readSort()

  const checkboxes = root.querySelectorAll<HTMLInputElement>(
    ".tag-control-checkbox input[type='checkbox']",
  )
  checkboxes.forEach((cb) => {
    cb.checked = filter.has(cb.value)
    const handler = () => {
      const next = new Set<string>()
      checkboxes.forEach((other) => {
        if (other.checked) next.add(other.value)
      })
      localStorage.setItem(FILTER_KEY, Array.from(next).join(","))
      applyFilter(root)
    }
    cb.addEventListener("change", handler)
    window.addCleanup(() => cb.removeEventListener("change", handler))
  })

  const sortSel = root.querySelector<HTMLSelectElement>(".tag-sort-select")
  if (sortSel) {
    sortSel.value = sort
    const handler = () => {
      localStorage.setItem(SORT_KEY, sortSel.value)
      applySort(root)
    }
    sortSel.addEventListener("change", handler)
    window.addCleanup(() => sortSel.removeEventListener("change", handler))
  }

  applyFilter(root)
  applySort(root)
}

function init() {
  document.querySelectorAll<HTMLElement>(".tag-filter-root").forEach(attach)
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
