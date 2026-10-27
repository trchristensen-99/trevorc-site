import "./style.css"
import { dateLabel } from "./time"
import { TreeView, kindShape, type Filters } from "./tree"
import type { Metric, Node, Source, Tree } from "./types"

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

const KIND_LABEL: Record<Node["kind"], string> = {
  precondition: "Precondition",
  resource: "Natural resource",
  discovery: "Discovery",
  technique: "Technique",
  device: "Device",
  infrastructure: "Infrastructure",
  institution: "Institution",
}
const STATUS_LABEL: Record<Node["status"], string> = {
  achieved: "Achieved",
  ongoing: "Being worked on",
  speculative: "Not yet achieved",
  lost: "Lost or forgotten",
}
const OUTCOME_LABEL: Record<string, string> = {
  achieved: "achieved",
  ongoing: "working on it",
  abandoned: "abandoned",
  rival: "rival effort",
  independent: "independent invention",
}

// ---------------------------------------------------------------- theme

function siteTheme(): "light" | "dark" {
  try {
    const parentTheme = window.parent !== window ? window.parent.document.documentElement.getAttribute("saved-theme") : null
    const stored = parentTheme ?? localStorage.getItem("theme")
    if (stored === "dark" || stored === "light") return stored
  } catch {
    /* cross-origin parent or storage blocked */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

// ---------------------------------------------------------------- format

const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v).replace(/[,_ $]/g, "")))
function money(v: unknown) {
  const n = num(v)
  if (!Number.isFinite(n)) return esc(v)
  if (n >= 1e12) return `$${+(n / 1e12).toPrecision(2)} trillion`
  if (n >= 1e9) return `$${+(n / 1e9).toPrecision(2)} billion`
  if (n >= 1e6) return `$${+(n / 1e6).toPrecision(2)} million`
  if (n >= 1e3) return `$${Math.round(n / 1e3)},000`
  return `$${n}`
}
function people(v: unknown) {
  const n = num(v)
  return Number.isFinite(n) ? `about ${n.toLocaleString("en-US")}` : esc(v)
}
function sourcesHTML(sources: Source[] | undefined, title = "Sources") {
  if (!sources?.length) return ""
  return `<h3>${title}</h3><ul class="sources">${sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ul>`
}
function valueLabel(v: number, unit: string) {
  const abs = Math.abs(v)
  const s = abs >= 1e12 ? `${+(v / 1e12).toPrecision(3)}T` : abs >= 1e9 ? `${+(v / 1e9).toPrecision(3)}B` : abs >= 1e6 ? `${+(v / 1e6).toPrecision(3)}M` : abs >= 1e3 ? `${+(v / 1e3).toPrecision(3)}k` : `${+v.toPrecision(3)}`
  return unit === "USD" ? `$${s}` : `${s} ${unit}`
}

// A small log-scale chart of a metric with its fitted trend, extended ten
// years past the data.
function metricChart(m: Metric) {
  const W = 290, H = 150, L = 46, B = 22, T = 8, Rr = 8
  const pts = m.points.filter(([, y]) => y > 0)
  if (pts.length < 2) return ""
  const x0 = pts[0][0], x1 = Math.max(pts.at(-1)![0], m.trend ? m.trend.to + 10 : 0)
  const ys = pts.map((p) => Math.log10(p[1]))
  let y0 = Math.min(...ys), y1 = Math.max(...ys)
  if (m.trend) {
    const ext = m.trend.slope * x1 + m.trend.intercept
    y0 = Math.min(y0, ext)
    y1 = Math.max(y1, ext)
  }
  y0 = Math.floor(y0)
  y1 = Math.ceil(y1)
  const px = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rr)
  const py = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B)
  const grid: string[] = []
  const step = Math.max(1, Math.ceil((y1 - y0) / 5))
  for (let v = y0; v <= y1; v += step)
    grid.push(`<line x1="${L}" x2="${W - Rr}" y1="${py(v)}" y2="${py(v)}" class="grid"/><text x="${L - 4}" y="${py(v)}" class="ylab">${valueLabel(10 ** v, m.unit === "USD" ? "USD" : "").trim()}</text>`)
  const xt = [x0, Math.round((x0 + x1) / 2), x1].map((x) => `<text x="${px(x)}" y="${H - 6}" class="xlab">${Math.round(x)}</text>`)
  const dots = pts.map(([x, y]) => `<circle cx="${px(x)}" cy="${py(Math.log10(y))}" r="2.4"><title>${Math.round(x)}: ${valueLabel(y, m.unit)}</title></circle>`).join("")
  const trend = m.trend
    ? `<line x1="${px(m.trend.from)}" y1="${py(m.trend.slope * m.trend.from + m.trend.intercept)}" x2="${px(m.trend.to)}" y2="${py(m.trend.slope * m.trend.to + m.trend.intercept)}" class="fit"/>` +
      `<line x1="${px(m.trend.to)}" y1="${py(m.trend.slope * m.trend.to + m.trend.intercept)}" x2="${px(x1)}" y2="${py(m.trend.slope * x1 + m.trend.intercept)}" class="fit ext"/>`
    : ""
  const rate = m.trend
    ? `${m.trend.slope < 0 ? "Halves" : "Doubles"} about every ${m.trend.years < 2 ? m.trend.years.toFixed(1) : m.trend.years.toFixed(1)} years (r² ${m.trend.r2.toFixed(2)})`
    : ""
  const wright = m.wright ? `; falls ${(m.wright.learningRate * 100).toFixed(0)}% each time cumulative production doubles` : ""
  return `<h3>${esc(m.name)}</h3>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.name)}">${grid.join("")}${xt.join("")}${trend}${dots}</svg>
    <p class="rate">${rate}${wright}. Dashed: the trend carried forward.</p>
    ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
    ${m.source ? `<p class="note">Data: <a href="${esc(m.source.url)}" target="_blank" rel="noopener">${esc(m.source.title)}</a>${m.license ? ` (${esc(m.license)})` : ""}</p>` : ""}`
}

// ------------------------------------------------------------------ main

async function main() {
  const tree: Tree = await fetch("./data/tree.json").then((r) => {
    if (!r.ok) throw new Error(`${r.status} loading the tree`)
    return r.json()
  })
  const byId = new Map(tree.nodes.map((n) => [n.id, n]))
  const metrics = new Map(tree.metrics.map((m) => [m.id, m]))
  const svg = document.querySelector<SVGSVGElement>("#tree")!
  const view = new TreeView(svg, tree)
  const now = tree.meta.now

  $("#counts").textContent = `${tree.nodes.filter((n) => n.kind !== "resource" && n.kind !== "precondition").length} technologies, ${tree.edges.filter((e) => e.kind === "requires").length} links`

  // Theme follows the site.
  const applyTheme = () => {
    const dark = siteTheme() === "dark"
    document.documentElement.dataset.theme = dark ? "dark" : "light"
    view.setDark(dark)
  }
  try {
    window.parent.document.addEventListener("themechange", applyTheme)
  } catch {
    /* not same-origin */
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme)
  applyTheme()

  // Embedded in the project page vs. opened on its own.
  const embedded = window.parent !== window
  const out = $<HTMLAnchorElement>("#elsewhere")
  out.href = embedded ? location.href : "/projects/real-life-tech-tree"
  out.textContent = embedded ? "Open full screen ↗" : "About this tree"
  if (embedded) out.target = "_top"

  // ------------------------------------------------------------ legend
  const icon = (kind: Node["kind"], fill: string, stroke = "none", dash = "") =>
    `<svg width="18" height="16" viewBox="-9 -8 18 16"><path d="${kindShape(kind, 5.5)}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" ${dash ? `stroke-dasharray="${dash}"` : ""} fill-rule="evenodd"/></svg>`
  $("#legend").innerHTML =
    (Object.keys(KIND_LABEL) as Node["kind"][]).map((k) => `<li>${icon(k, "var(--muted)")}${KIND_LABEL[k]}</li>`).join("") +
    `<li>${icon("device", "var(--muted)")}<span>Solid: achieved</span></li>` +
    `<li>${icon("device", "var(--bg-panel)", "var(--muted)", "2 1.5")}<span>Dashed: not yet; the bar is its likely window</span></li>` +
    `<li>${icon("device", "#c9cbc6", "var(--muted)")}<span>Gray: lost or forgotten</span></li>` +
    `<li><span class="sw line"></span>needs</li><li><span class="sw line dash"></span>helped by</li><li><span class="sw line dot"></span>uses a resource</li>`

  // ----------------------------------------------------------- filters
  const filters: Filters = { fields: new Set(), statuses: new Set(), kinds: new Set() }
  const box = (parent: string, id: string, label: string, set: Set<string>, swatch?: string) => {
    const l = document.createElement("label")
    const i = document.createElement("input")
    i.type = "checkbox"
    i.addEventListener("change", () => {
      if (i.checked) set.add(id)
      else set.delete(id)
      view.setFilters(filters)
    })
    l.append(i)
    if (swatch) l.insertAdjacentHTML("beforeend", `<span class="sw" style="background:${swatch}"></span>`)
    l.append(` ${label}`)
    $(parent).append(l)
  }
  for (const f of tree.fields) box("#f-fields", f.id, f.name, filters.fields, f.color)
  box("#f-fields", "roots", "Roots", filters.fields, tree.roots.color)
  for (const [s, label] of Object.entries(STATUS_LABEL)) box("#f-status", s, label, filters.statuses)
  for (const [k, label] of Object.entries(KIND_LABEL)) box("#f-kinds", k, label, filters.kinds)
  $<HTMLInputElement>("#all-links").addEventListener("change", (e) => {
    view.showAllLinks = (e.target as HTMLInputElement).checked
    view.setFilters(filters)
  })

  // ------------------------------------------------------------ search
  const dl = $("#names")
  for (const n of [...tree.nodes].sort((a, b) => a.name.localeCompare(b.name))) dl.insertAdjacentHTML("beforeend", `<option value="${esc(n.name)}">`)
  const search = $<HTMLInputElement>("#search")
  search.addEventListener("input", () => {
    const exact = tree.nodes.find((n) => n.name.toLowerCase() === search.value.trim().toLowerCase())
    if (exact) {
      view.setSearch("")
      view.select(exact)
      view.focusNode(exact)
    } else view.setSearch(search.value)
  })

  // -------------------------------------------------------------- info
  const info = $<HTMLElement>("#info")
  const show = (html: string) => {
    info.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`
    info.hidden = false
    info.querySelector(".close")!.addEventListener("click", () => {
      info.hidden = true
      view.select(null)
    })
    info.querySelectorAll<HTMLAnchorElement>("a[data-node]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault()
        const n = byId.get(a.dataset.node!)
        if (n) {
          view.select(n)
          view.focusNode(n)
        }
      }),
    )
  }
  const link = (id: string) => {
    const n = byId.get(id)
    return n ? `<a href="#n=${esc(id)}" data-node="${esc(id)}">${esc(n.name)}</a>` : ""
  }
  const linkList = (ids: string[]) => ids.map(link).filter(Boolean).join(", ")
  const fieldName = (id: string) => tree.fields.find((f) => f.id === id)?.name ?? id

  const nodeHTML = (n: Node) => {
    const needs = tree.edges.filter((e) => e.t === n.id && e.kind === "requires").map((e) => e.s)
    const uses = tree.edges.filter((e) => e.t === n.id && e.kind === "uses").map((e) => e.s)
    const helped = tree.edges.filter((e) => e.t === n.id && e.kind === "helped").map((e) => e.s)
    const rivals = tree.edges.filter((e) => e.kind === "competes" && (e.s === n.id || e.t === n.id)).map((e) => (e.s === n.id ? e.t : e.s))
    const led = tree.edges.filter((e) => e.s === n.id && (e.kind === "requires" || e.kind === "uses")).map((e) => e.t)
    const rows: string[] = []
    rows.push(`<dt>When</dt><dd>${esc(dateLabel(n.from, n.to, n.at, now, n.status === "speculative" || n.status === "ongoing"))}</dd>`)
    rows.push(`<dt>Status</dt><dd>${STATUS_LABEL[n.status]}</dd>`)
    if (n.lane !== "roots") rows.push(`<dt>Fields</dt><dd>${n.fields.map(fieldName).map(esc).join(", ")}</dd>`)
    if (n.scarcity) rows.push(`<dt>Scarcity</dt><dd>${esc(n.scarcity)}</dd>`)
    const e = n.effort
    let effort = ""
    if (e) {
      const span = Array.isArray(e.span) ? `${e.span[0]} to ${e.span[1]} (${e.span[1] - e.span[0]} years)` : e.span ? `${e.span} years` : ""
      effort = `<h3>What it took</h3><dl>` +
        (span ? `<dt>Time</dt><dd>${esc(span)}</dd>` : "") +
        (e.people ? `<dt>People</dt><dd>${people(e.people)}</dd>` : "") +
        (e.cost_usd ? `<dt>Cost</dt><dd>${money(e.cost_usd)} (2025 dollars)</dd>` : "") +
        `</dl>` + (e.note ? `<p class="note">${esc(e.note)}</p>` : "")
    }
    const efforts = n.efforts?.length
      ? `<h3>${n.status === "achieved" || n.status === "lost" ? "Who" : "Who's working on it"}</h3><ul class="efforts">${n.efforts.map((x) =>
          `<li><strong>${esc(x.who)}</strong>${x.where ? `, ${esc(x.where)}` : ""}${x.when != null ? ` (${esc(typeof x.when === "number" && x.when < 0 ? `${-x.when} BCE` : x.when)})` : ""}${x.outcome && x.outcome !== "achieved" ? ` <span class="tag ${esc(x.outcome)}">${esc(OUTCOME_LABEL[x.outcome] ?? x.outcome)}</span>` : ""}${x.note ? `<br><span class="note">${esc(x.note)}</span>` : ""}</li>`).join("")}</ul>`
      : ""
    const metric = n.metric && metrics.get(n.metric) ? metricChart(metrics.get(n.metric)!) : ""
    return `<p class="kind">${KIND_LABEL[n.kind]}</p><h2>${esc(n.name)}</h2>` +
      (n.summary ? `<p>${esc(n.summary)}</p>` : "") +
      `<dl>${rows.join("")}</dl>` +
      (n.lost ? `<h3>Lost</h3><p>${esc(n.lost)}</p>` : "") +
      (n.note ? `<p class="note">${esc(n.note)}</p>` : "") +
      efforts + effort +
      (n.forecast?.note ? `<h3>Forecast</h3><p>${esc(n.forecast.note)}</p>${sourcesHTML(n.forecast.sources, "Forecast sources")}` : "") +
      metric +
      (needs.length ? `<h3>Needs</h3><p>${linkList(needs)}</p>` : "") +
      (uses.length ? `<h3>Uses</h3><p>${linkList(uses)}</p>` : "") +
      (helped.length ? `<h3>Helped by</h3><p>${linkList(helped)}</p>` : "") +
      (rivals.length ? `<h3>Competed with</h3><p>${linkList(rivals)}</p>` : "") +
      (led.length ? `<h3>Led to</h3><p>${linkList(led)}</p>` : "") +
      sourcesHTML(n.sources)
  }

  view.onSelect = (n) => {
    if (n) show(nodeHTML(n))
    else if (!frontierOpen) info.hidden = true
    saveSoon()
  }

  // What people are working on now: everything ongoing, with its efforts.
  let frontierOpen = false
  $("#frontier").addEventListener("click", () => {
    frontierOpen = true
    view.select(null)
    const open = tree.nodes.filter((n) => n.status === "ongoing" || n.status === "speculative").sort((a, b) => a.at - b.at)
    const groups = tree.fields.map((f) => ({ f, list: open.filter((n) => n.fields[0] === f.id) })).filter((g) => g.list.length)
    show(`<p class="kind">The frontier</p><h2>What people are working on</h2>
      <p>Technologies not yet achieved, by field, with their likely windows and the groups working on them.</p>` +
      groups.map(({ f, list }) => `<h3><span class="sw" style="background:${f.color}"></span>${esc(f.name)}</h3><ul class="frontier">${list.map((n) =>
        `<li>${link(n.id)} <span class="note">${esc(dateLabel(n.from, n.to, n.at, now, true))}</span>${n.efforts?.length ? `<br><span class="note">${n.efforts.map((x) => esc(x.who)).slice(0, 6).join(" · ")}${n.efforts.length > 6 ? " …" : ""}</span>` : ""}</li>`).join("")}</ul>`).join(""))
    info.querySelector(".close")!.addEventListener("click", () => (frontierOpen = false))
  })

  // ----------------------------------------------------------- tooltip
  const tip = $<HTMLDivElement>("#tooltip")
  view.onHover = (n, at) => {
    if (!n || matchMedia("(hover: none)").matches) {
      tip.hidden = true
      return
    }
    tip.innerHTML = `<strong>${esc(n.name)}</strong> <span>${esc(dateLabel(n.from, n.to, n.at, now, n.status !== "achieved"))}</span>`
    tip.hidden = false
    const r = svg.getBoundingClientRect()
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 8, at[0] + 14)}px`
    tip.style.top = `${at[1] + 14}px`
  }

  // --------------------------------------------------------- URL state
  // #n=id selects a technology; #z=x,y,zoom keeps the view.
  let pending = 0
  const save = () => {
    const h = new URLSearchParams()
    if (view.selection) h.set("n", view.selection.id)
    const [x, y, k] = view.view()
    h.set("z", `${Math.round(x)},${Math.round(y)},${k.toFixed(2)}`)
    history.replaceState(null, "", `#${h}`)
  }
  const saveSoon = () => {
    clearTimeout(pending)
    pending = window.setTimeout(save, 300)
  }
  // Once someone zooms in, the options fold into the ☰ button so they don't
  // cover the tree.
  let folded = false
  view.onViewChange = () => {
    saveSoon()
    const zoomed = view.view()[2] > 1.4
    if (zoomed !== folded) {
      folded = zoomed
      document.body.classList.toggle("folded", zoomed)
      if (!zoomed) document.body.classList.remove("controls-open")
    }
  }

  $("#toggle-controls").addEventListener("click", () => document.body.classList.toggle("controls-open"))

  view.resize()
  new ResizeObserver(() => view.resize()).observe(svg)
  const h = new URLSearchParams(location.hash.slice(1))
  const z = h.get("z")?.split(",").map(Number)
  if (z?.length === 3 && z.every(Number.isFinite)) view.focus(z[0], z[1], z[2])
  const start = h.get("n") && byId.get(h.get("n")!)
  if (start) {
    view.select(start)
    if (!z) view.focusNode(start)
  }
}

main()
  .then(() => ($("#status").textContent = ""))
  .catch((err) => ($("#status").textContent = `Couldn't load the tree (${err.message}).`))
  .finally(() => document.body.classList.add("ready"))
