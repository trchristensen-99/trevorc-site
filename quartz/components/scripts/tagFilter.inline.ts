// Content vs meta toggle for the /tags index. Default: only content tags
// are shown. The user can enable meta tags via the checkbox; the choice is
// persisted in localStorage so it survives page navigation.
const STORAGE_KEY = "trevorc-tag-filter"
const DEFAULT_VISIBLE = new Set(["content"])

function parseSavedFilter(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return new Set(DEFAULT_VISIBLE)
  return new Set(raw.split(",").filter((s) => s.length > 0))
}

function applyFilter(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>(".tag-index-list")
  if (!list) return
  const visible = parseSavedFilter()
  list.querySelectorAll<HTMLLIElement>("li").forEach((li) => {
    const cat = li.getAttribute("data-category") ?? "content"
    li.style.display = visible.has(cat) ? "" : "none"
  })
}

function attach(root: HTMLElement) {
  const visible = parseSavedFilter()
  const checkboxes = root.querySelectorAll<HTMLInputElement>(
    ".tag-filter-controls input[type='checkbox']",
  )
  checkboxes.forEach((cb) => {
    cb.checked = visible.has(cb.value)
    const handler = () => {
      const next = new Set<string>()
      checkboxes.forEach((other) => {
        if (other.checked) next.add(other.value)
      })
      localStorage.setItem(STORAGE_KEY, Array.from(next).join(","))
      applyFilter(root)
    }
    cb.addEventListener("change", handler)
    window.addCleanup(() => cb.removeEventListener("change", handler))
  })
  applyFilter(root)
}

function initTagFilter() {
  document.querySelectorAll<HTMLElement>(".tag-filter-root").forEach(attach)
}

document.addEventListener("nav", initTagFilter)
if (document.readyState !== "loading") initTagFilter()
else document.addEventListener("DOMContentLoaded", initTagFilter, { once: true })
