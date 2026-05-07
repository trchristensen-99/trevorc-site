function sortRows(table: HTMLTableElement, key: string, dir: "asc" | "desc") {
  const tbody = table.querySelector("tbody")
  if (!tbody) return
  const rows = Array.from(tbody.querySelectorAll("tr"))
  rows.sort((a, b) => {
    const av = a.getAttribute(`data-${key}`) ?? ""
    const bv = b.getAttribute(`data-${key}`) ?? ""
    const an = parseFloat(av)
    const bn = parseFloat(bv)
    const bothNumeric = !isNaN(an) && !isNaN(bn)
    if (bothNumeric) {
      return dir === "asc" ? an - bn : bn - an
    }
    return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
  })
  for (const row of rows) tbody.appendChild(row)
}

function attachSortHandlers() {
  document.querySelectorAll<HTMLTableElement>(".sortable-list table").forEach((table) => {
    const headers = table.querySelectorAll<HTMLElement>("th[data-sort]")
    headers.forEach((th) => {
      const handler = () => {
        const key = th.getAttribute("data-sort")!
        const currentDir = th.getAttribute("data-dir")
        const newDir: "asc" | "desc" = currentDir === "asc" ? "desc" : "asc"
        headers.forEach((h) => h.removeAttribute("data-dir"))
        th.setAttribute("data-dir", newDir)
        sortRows(table, key, newDir)
      }
      th.addEventListener("click", handler)
      window.addCleanup(() => th.removeEventListener("click", handler))
    })
  })
}

document.addEventListener("nav", attachSortHandlers)
