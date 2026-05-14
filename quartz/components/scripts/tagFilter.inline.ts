// Sort control for the /tags index page. State persisted in localStorage
// so the choice survives navigation.

const SORT_KEY = "trevorc-tag-sort"
const DEFAULT_SORT = "alpha-asc"

type SortMode = "alpha-asc" | "alpha-desc" | "count-desc" | "count-asc"

function readSort(): SortMode {
  const raw = localStorage.getItem(SORT_KEY)
  if (raw === "alpha-asc" || raw === "alpha-desc" || raw === "count-desc" || raw === "count-asc") {
    return raw
  }
  return DEFAULT_SORT
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
  const sort = readSort()
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
  applySort(root)
}

function init() {
  document.querySelectorAll<HTMLElement>(".tag-filter-root").forEach(attach)
}

document.addEventListener("nav", init)
if (document.readyState !== "loading") init()
else document.addEventListener("DOMContentLoaded", init, { once: true })
