import "./style.css"
import { dateLabel } from "./time"
import { DETAIL_DEFAULT, ROUTE_COLORS, TreeView, fmtValue, kindShape, type Display, type Filters } from "./tree"
import type { Details, Metric, Node, Source, Tree } from "./types"

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
  milestone: "Milestone",
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
// An effort's date: a year or [from, to], with BC for negative years.
function whenLabel(w: unknown): string {
  const y = (v: unknown) => (typeof v === "number" ? (v < 0 ? `${(-v).toLocaleString("en-US")} BC` : v < 1000 ? `AD ${v}` : String(v)) : String(v))
  if (Array.isArray(w)) {
    const [a, b] = w as number[]
    if (typeof a === "number" && typeof b === "number" && a < 0 && b < 0) return `${(-a).toLocaleString("en-US")} to ${(-b).toLocaleString("en-US")} BC`
    return `${y(a)} to ${y(b)}`
  }
  return y(w)
}
function sourcesHTML(sources: Source[] | undefined, title = "Sources") {
  if (!sources?.length) return ""
  return `<h3>${title}</h3><ul class="sources">${sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ul>`
}

const SCENARIO_COLORS = ["#7b5ea7", "#d0587e", "#2a9d8f", "#c9772a", "#2f8fb0", "#8aa33a"]
const SCENARIO_KIND: Record<string, string> = {
  trend: "trend",
  projection: "official projection",
  survey: "survey",
  market: "forecasters and markets",
  model: "model",
  judgment: "my estimate",
}

// A small log-scale chart of a metric with its fitted trend carried
// forward, and its milestones as thresholds.
function metricChart(m: Metric, milestones: Node[], highlight?: string, title = true) {
  const W = 300, H = 160, L = 50, B = 22, T = 8, Rr = 8
  // Log scale, or linear for steady growth.
  const f = (v: number) => (m.log ? Math.log10(v) : v)
  const inv = (u: number) => (m.log ? 10 ** u : u)
  const pts = m.points.filter(([, y]) => !m.log || y > 0)
  if (pts.length < 2) return ""
  const future = milestones.filter((n) => n.status !== "achieved").map((n) => n.at)
  const scen = m.scenarios ?? []
  const scenEnd = Math.max(...scen.flatMap((sc) => sc.points.map((p) => p[0])), -Infinity)
  const x0 = pts[0][0], x1 = Math.min(2100, Math.max(pts.at(-1)![0] + (m.trend ? 10 : 0), scenEnd, ...future.map((y) => Math.min(y + 3, 2100))))
  const ys = [...pts.map((p) => f(p[1])), ...milestones.map((n) => f(n.threshold!.value))]
  for (const sc of scen) for (const [x, v] of [...sc.points, ...sc.low, ...sc.high]) if (x <= x1 && (!m.log || v > 0)) ys.push(f(v))
  let y0 = Math.min(...ys), y1 = Math.max(...ys)
  if (m.trend) {
    const ext = m.trend.slope * x1 + m.trend.intercept
    y0 = Math.min(y0, ext)
    y1 = Math.max(y1, ext)
  }
  if (m.log) {
    y0 = Math.floor(y0)
    y1 = Math.ceil(y1)
  } else {
    const pad = (y1 - y0) * 0.08 || 1
    y0 -= pad
    y1 += pad
  }
  const px = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rr)
  const py = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B)
  const grid: string[] = []
  // Grid: powers of ten, or round steps on a linear scale.
  const raw = (y1 - y0) / 5
  const step = m.log ? Math.max(1, Math.ceil(raw)) : (() => { const p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map((k) => k * p).find((k) => k >= raw)! })()
  for (let v = m.log ? y0 : Math.ceil(y0 / step) * step; v <= y1; v += step)
    grid.push(`<line x1="${L}" x2="${W - Rr}" y1="${py(v)}" y2="${py(v)}" class="grid"/><text x="${L - 4}" y="${py(v)}" class="ylab">${esc(fmtValue(inv(v), m.unit === "USD" ? "USD" : "").trim())}</text>`)
  const xt = [x0, Math.round((x0 + x1) / 2), x1].map((x) => `<text x="${px(x)}" y="${H - 6}" class="xlab">${Math.round(x)}</text>`)
  const dots = pts.map(([x, y]) => `<circle cx="${px(x)}" cy="${py(f(y))}" r="2.4"><title>${Math.round(x)}: ${esc(fmtValue(y, m.unit))}</title></circle>`).join("")
  const tr = m.trend
  const trend = tr
    ? `<line x1="${px(tr.from)}" y1="${py(tr.slope * tr.from + tr.intercept)}" x2="${px(tr.to)}" y2="${py(tr.slope * tr.to + tr.intercept)}" class="fit"/>` +
      `<line x1="${px(tr.to)}" y1="${py(tr.slope * tr.to + tr.intercept)}" x2="${px(x1)}" y2="${py(tr.slope * x1 + tr.intercept)}" class="fit ext"/>`
    : ""
  // Forecast scenarios: dotted lines in their own colors, with bands.
  const line = (list: [number, number][]) => list.filter(([x, v]) => x <= x1 && (!m.log || v > 0)).map(([x, v], j) => `${j ? "L" : "M"}${px(x).toFixed(1)},${py(f(v)).toFixed(1)}`).join("")
  const scenSvg = scen.map((sc, i) => {
    const c = SCENARIO_COLORS[i % SCENARIO_COLORS.length]
    const band = sc.low.length > 1 && sc.high.length > 1 ? `<path d="${line(sc.low)}${line([...sc.high].reverse()).replace(/^M/, "L")}Z" fill="${c}" opacity="0.12"/>` : ""
    return `${band}<path d="${line(sc.points)}" fill="none" stroke="${c}" stroke-width="1.6" stroke-dasharray="2 2.5"/>`
  }).join("")
  const marks = milestones.map((n) => {
    const v = f(n.threshold!.value)
    const cls = `ms${n.id === highlight ? " on" : ""}`
    return `<line x1="${L}" x2="${W - Rr}" y1="${py(v)}" y2="${py(v)}" class="${cls}"/><text x="${W - Rr - 2}" y="${py(v) - 3}" class="mslab${n.id === highlight ? " on" : ""}">${esc(n.threshold!.label ?? n.name)}</text>`
  }).join("")
  const rate = !tr ? "No clean trend"
    : tr.linear ? `${tr.slope > 0 ? "Rises" : "Falls"} about ${esc(fmtValue(Math.abs(tr.slope * 10), m.unit))} a decade (r² ${tr.r2.toFixed(2)})`
    : `${tr.slope < 0 ? "Halves" : "Doubles"} about every ${tr.years!.toFixed(1)} years (r² ${tr.r2.toFixed(2)})`
  const wright = m.wright ? `; falls ${(m.wright.learningRate * 100).toFixed(0)}% each time cumulative production doubles` : ""
  return `${title ? `<h3>${esc(m.name)}</h3>` : ""}
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.name)}">${grid.join("")}${xt.join("")}${marks}${scenSvg}${trend}${dots}</svg>
    <p class="rate">${rate}${wright}.${tr ? " Dashed: the trend carried forward." : ""}${scen.length ? " Dotted: forecasts." : ""}${milestones.length ? " Lines across: milestones." : ""}</p>
    ${scen.length ? `<ul class="scenarios">${scen.map((sc, i) => `<li><span class="sw" style="background:${SCENARIO_COLORS[i % SCENARIO_COLORS.length]}"></span><div><strong>${esc(sc.name)}</strong> <span class="tag">${esc(SCENARIO_KIND[sc.kind] ?? sc.kind)}</span>${sc.note ? `<br><span class="note">${esc(sc.note)}</span>` : ""}${sc.sources?.length ? `<br><span class="note">${sc.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join("; ")}</span>` : ""}</div></li>`).join("")}</ul>` : ""}
    ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
    ${m.source ? `<p class="note">Data: <a href="${esc(m.source.url)}" target="_blank" rel="noopener">${esc(m.source.title)}</a>${m.license ? ` (${esc(m.license)})` : ""}</p>` : ""}`
}

// ------------------------------------------------------------------ main

async function main() {
  const tree: Tree = await fetch("./data/tree.json").then((r) => {
    if (!r.ok) throw new Error(`${r.status} loading the tree`)
    return r.json()
  })
  // The text loads after the tree is drawn.
  let details: Record<string, Details> | null = null
  const detailsReady: Promise<Record<string, Details>> = fetch("./data/details.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => (details = d))
  const detail = async (id: string): Promise<Details> => (details ?? (await detailsReady))[id] ?? ({} as Details)

  const byId = new Map(tree.nodes.map((n) => [n.id, n]))
  const metrics = new Map(tree.metrics.map((m) => [m.id, m]))
  const svg = document.querySelector<SVGSVGElement>("#tree")!
  const view = new TreeView(svg, tree)
  const now = tree.meta.now
  const fieldColor = new Map(tree.fields.map((f) => [f.id, f.color]))
  const fieldName = (id: string) => tree.fields.find((f) => f.id === id)?.name ?? id

  const techCount = tree.nodes.filter((n) => n.kind !== "resource" && n.kind !== "precondition").length
  $("#counts").textContent = `${techCount} technologies, ${tree.edges.filter((e) => e.kind === "requires").length} links`

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
  const icon = (kind: Node["kind"], fill: string, stroke = "none", dash = "", fillOpacity = 1) =>
    `<svg width="18" height="16" viewBox="-9 -8 18 16"><path d="${kindShape(kind, 5.5)}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="1.4" ${dash ? `stroke-dasharray="${dash}"` : ""} fill-rule="evenodd"/></svg>`
  $("#legend").innerHTML =
    (Object.keys(KIND_LABEL) as Node["kind"][]).map((k) => `<li>${icon(k, "var(--muted)")}${KIND_LABEL[k]}</li>`).join("") +
    `<li>${icon("device", "var(--muted)")}<span>Solid: achieved</span></li>` +
    `<li>${icon("device", "var(--muted)", "var(--muted)", "", 0.42)}<span>Half-filled: being worked on</span></li>` +
    `<li>${icon("device", "var(--bg-panel)", "var(--muted)", "2 1.5")}<span>Dashed: not yet; the bar is its likely window</span></li>` +
    `<li>${icon("device", "#c9cbc6", "var(--muted)")}<span>Gray: lost or forgotten</span></li>` +
    `<li><span class="sw line"></span>needs</li><li><span class="sw line dash"></span>helped by</li><li><span class="sw line dot"></span>uses a resource</li>`

  // ----------------------------------------------------------- display
  // Detail: a slider from nothing (0) through the default set to
  // everything (100).
  const display: Display = { detail: DETAIL_DEFAULT, grow: true, frontier: false, allLinks: false, trends: [], trendLayout: "auto" }
  const slider = $<HTMLInputElement>("#detail")
  slider.value = String(DETAIL_DEFAULT)
  const readout = () => ($("#detail-count").textContent = `${view.shown} of ${tree.nodes.length} showing`)
  // After each draw: the count, and the room the trend panel takes, so the
  // panels can clear it.
  let strips = -1
  view.onRender = () => {
    readout()
    const sh = view.stripsHeight()
    if (sh !== strips) document.body.style.setProperty("--strips", `${(strips = sh)}px`)
  }
  const setDisplay = (d: Partial<Display>) => {
    Object.assign(display, d)
    view.setDisplay(display)
    saveSoon()
  }
  slider.addEventListener("input", () => setDisplay({ detail: +slider.value }))
  const layoutSel = $<HTMLSelectElement>("#trend-layout")
  layoutSel.addEventListener("change", () => setDisplay({ trendLayout: layoutSel.value as Display["trendLayout"] }))
  const check = (id: string, key: "grow" | "frontier" | "allLinks") => {
    const i = $<HTMLInputElement>(id)
    i.addEventListener("change", () => setDisplay({ [key]: i.checked }))
    return i
  }
  const growBox = check("#grow", "grow")
  const frontierBox = check("#show-frontier", "frontier")
  const linksBox = check("#all-links", "allLinks")

  // Trend strips: one checkbox per metric, by field.
  const trendBoxes = new Map<string, HTMLInputElement>()
  const trendList = $("#trend-list")
  const sortedMetrics = [...tree.metrics].sort((a, b) => tree.fields.findIndex((f) => f.id === a.field) - tree.fields.findIndex((f) => f.id === b.field) || a.short.localeCompare(b.short))
  for (const m of sortedMetrics) {
    const l = document.createElement("label")
    const i = document.createElement("input")
    i.type = "checkbox"
    i.addEventListener("change", () => setDisplay({ trends: sortedMetrics.filter((x) => trendBoxes.get(x.id)!.checked).map((x) => x.id) }))
    trendBoxes.set(m.id, i)
    l.append(i)
    l.insertAdjacentHTML("beforeend", `<span class="sw" style="background:${fieldColor.get(m.field ?? "") ?? "var(--muted)"}"></span>`)
    l.append(` ${m.short}`)
    l.title = m.name
    trendList.append(l)
  }

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

  // ------------------------------------------------------------ search
  const dl = $("#names")
  dl.innerHTML = [...tree.nodes].sort((a, b) => a.name.localeCompare(b.name)).map((n) => `<option value="${esc(n.name)}">`).join("")
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
  let showing = ""
  const show = (html: string, what: string) => {
    showing = what
    info.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`
    info.hidden = false
    info.scrollTop = 0
    info.querySelector(".close")!.addEventListener("click", () => {
      info.hidden = true
      showing = ""
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
    info.querySelectorAll<HTMLAnchorElement>("a[data-metric]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault()
        const m = metrics.get(a.dataset.metric!)
        if (m) showMetric(m)
      }),
    )
  }
  const link = (id: string) => {
    const n = byId.get(id)
    return n ? `<a href="#n=${esc(id)}" data-node="${esc(id)}">${esc(n.name)}</a>` : ""
  }
  const linkList = (ids: string[]) => ids.map(link).filter(Boolean).join(", ")
  const milestonesOf = (m: Metric) => m.milestones.map((id) => byId.get(id)).filter((n): n is Node => !!n?.threshold).sort((a, b) => a.at - b.at)

  const nodeHTML = (n: Node, d: Details) => {
    const into = tree.edges.filter((e) => e.t === n.id)
    const needs = into.filter((e) => e.kind === "requires" && !e.routes).map((e) => e.s)
    const uses = into.filter((e) => e.kind === "uses" && !e.routes).map((e) => e.s)
    const helped = into.filter((e) => e.kind === "helped").map((e) => e.s)
    const rivals = tree.edges.filter((e) => e.kind === "competes" && (e.s === n.id || e.t === n.id)).map((e) => (e.s === n.id ? e.t : e.s))
    const led = tree.edges.filter((e) => e.s === n.id && (e.kind === "requires" || e.kind === "uses")).map((e) => e.t)
    const open = n.status === "speculative" || n.status === "ongoing"
    const rows: string[] = []
    rows.push(`<dt>When</dt><dd>${esc(dateLabel(n.from, n.to, n.at, now, open))}</dd>`)
    if (n.trendYear && open) rows.push(`<dt>Trend</dt><dd>The trend alone gets there around ${Math.round(n.trendYear)}</dd>`)
    if (n.scenarioYears?.length && open) {
      const mm = metrics.get(n.threshold!.metric)!
      rows.push(`<dt>Forecasts</dt><dd>${n.scenarioYears.map((x) => {
        const sc = mm.scenarios.find((y) => y.id === x.id)
        return `${esc(sc?.name ?? x.id)}: ${x.year == null ? "not by " + Math.round(Math.max(...(sc?.points ?? [[2100, 0]]).map((p) => p[0]))) : Math.round(x.year)}`
      }).join("<br>")}</dd>`)
    }
    rows.push(`<dt>Status</dt><dd>${STATUS_LABEL[n.status]}</dd>`)
    if (n.lane !== "roots") rows.push(`<dt>Fields</dt><dd>${n.fields.map(fieldName).map(esc).join(", ")}</dd>`)
    if (d.scarcity) rows.push(`<dt>Scarcity</dt><dd>${esc(d.scarcity)}</dd>`)
    const e = d.effort
    let effort = ""
    if (e) {
      const span = Array.isArray(e.span) ? `${e.span[0]} to ${e.span[1]} (${e.span[1] - e.span[0]} years)` : e.span ? `${e.span} years` : ""
      effort = `<h3>What it took</h3><dl>` +
        (span ? `<dt>Time</dt><dd>${esc(span)}</dd>` : "") +
        (e.people ? `<dt>People</dt><dd>${people(e.people)}</dd>` : "") +
        (e.cost_usd ? `<dt>Cost</dt><dd>${money(e.cost_usd)} (2025 dollars)</dd>` : "") +
        `</dl>` + (e.note ? `<p class="note">${esc(e.note)}</p>` : "")
    }
    const efforts = d.efforts?.length
      ? `<h3>${n.status === "achieved" || n.status === "lost" ? "Who" : "Who's working on it"}</h3><ul class="efforts">${d.efforts.map((x) =>
          `<li><strong>${esc(x.who)}</strong>${x.where ? `, ${esc(x.where)}` : ""}${x.when != null ? ` (${esc(whenLabel(x.when))})` : ""}${x.outcome && x.outcome !== "achieved" ? ` <span class="tag ${esc(x.outcome)}">${esc(OUTCOME_LABEL[x.outcome] ?? x.outcome)}</span>` : ""}${x.note ? `<br><span class="note">${esc(x.note)}</span>` : ""}</li>`).join("")}</ul>`
      : ""
    // Alternative routes, colored as they're drawn.
    const routes = d.routes?.length
      ? `<h3>Routes</h3><p class="note">Any one of these would do.</p><ol class="routes">${d.routes.map((r, i) =>
          `<li><span class="sw" style="background:${ROUTE_COLORS[i % ROUTE_COLORS.length]}"></span><div><strong>${esc(r.name)}</strong>${r.requires.length ? `: ${linkList(r.requires)}` : ""}${r.note ? `<br><span class="note">${esc(r.note)}</span>` : ""}</div></li>`).join("")}</ol>`
      : ""
    const m = n.metric ? metrics.get(n.metric) : undefined
    const threshold = n.threshold && m
      ? `<p class="threshold">Reached when <a href="#" data-metric="${esc(m.id)}">${esc(m.name.charAt(0).toLowerCase() + m.name.slice(1))}</a> ${m.better === "lower" ? "falls to" : "reaches"} <strong>${esc(fmtValue(n.threshold.value, m.unit))}</strong>.</p>`
      : ""
    return `<p class="kind">${KIND_LABEL[n.kind]}</p><h2>${esc(n.name)}</h2>` +
      threshold +
      (d.summary ? `<p>${esc(d.summary)}</p>` : "") +
      (d.criterion ? `<div class="criterion"><h3>Counts as done when</h3><p>${esc(d.criterion)}</p></div>` : "") +
      `<dl>${rows.join("")}</dl>` +
      (d.lost ? `<h3>Lost</h3><p>${esc(d.lost)}</p>` : "") +
      (d.note ? `<p class="note">${esc(d.note)}</p>` : "") +
      routes +
      efforts + effort +
      (d.forecast?.note ? `<h3>Forecast</h3><p>${esc(d.forecast.note)}</p>${sourcesHTML(d.forecast.sources, "Forecast sources")}` : "") +
      (m ? metricChart(m, milestonesOf(m), n.id) : "") +
      (needs.length ? `<h3>${routes ? "Needs on every route" : "Needs"}</h3><p>${linkList(needs)}</p>` : "") +
      (uses.length ? `<h3>Uses</h3><p>${linkList(uses)}</p>` : "") +
      (helped.length ? `<h3>Helped by</h3><p>${linkList(helped)}</p>` : "") +
      (rivals.length ? `<h3>Competed with</h3><p>${linkList(rivals)}</p>` : "") +
      (led.length ? `<h3>Led to</h3><p>${linkList(led)}</p>` : "") +
      sourcesHTML(d.sources)
  }

  const showMetric = (m: Metric) => {
    view.select(null)
    const ms = milestonesOf(m)
    show(`<p class="kind">Trend</p><h2>${esc(m.name)}</h2>` + metricChart(m, ms, undefined, false) +
      (ms.length ? `<h3>Milestones</h3><ul class="frontier">${ms.map((n) => `<li>${link(n.id)} <span class="note">${esc(n.status === "achieved" ? `reached ${Math.round(n.at)}` : dateLabel(n.from, n.to, n.at, now, true))}</span></li>`).join("")}</ul>` : "") +
      (() => {
        const techs = tree.nodes.filter((n) => n.metric === m.id && !n.threshold)
        return techs.length ? `<h3>Technologies it tracks</h3><p>${linkList(techs.map((n) => n.id))}</p>` : ""
      })(), `metric:${m.id}`)
  }
  view.onMetric = showMetric

  view.onSelect = async (n) => {
    if (n) {
      const want = `node:${n.id}`
      showing = want
      if (!details) show(`<h2>${esc(n.name)}</h2><p class="note">Loading…</p>`, want)
      const d = await detail(n.id)
      if (view.selection === n) show(nodeHTML(n, d), want)
    } else if (showing.startsWith("node:")) {
      info.hidden = true
      showing = ""
    }
    saveSoon()
  }

  // What people are working on now: everything not yet achieved, by field.
  $("#frontier").addEventListener("click", async () => {
    view.select(null)
    const d = details ?? (await detailsReady)
    const open = tree.nodes.filter((n) => n.status === "ongoing" || n.status === "speculative").sort((a, b) => a.at - b.at)
    const groups = tree.fields.map((f) => ({ f, list: open.filter((n) => n.fields[0] === f.id) })).filter((g) => g.list.length)
    show(`<p class="kind">The frontier</p><h2>What people are working on</h2>
      <p>Technologies not yet achieved, by field, with their likely windows and the groups working on them. Tick <em>Always show the frontier</em> to see them all on the tree.</p>` +
      groups.map(({ f, list }) => `<h3><span class="sw" style="background:${f.color}"></span>${esc(f.name)}</h3><ul class="frontier">${list.map((n) => {
        const efforts = d[n.id]?.efforts ?? []
        return `<li>${link(n.id)} <span class="note">${esc(dateLabel(n.from, n.to, n.at, now, true))}</span>${efforts.length ? `<br><span class="note">${efforts.map((x) => esc(x.who)).slice(0, 5).join(" · ")}${efforts.length > 5 ? " …" : ""}</span>` : ""}</li>`
      }).join("")}</ul>`).join(""), "frontier")
  })

  // ----------------------------------------------------------- tooltip
  const tip = $<HTMLDivElement>("#tooltip")
  view.onHover = (n, at, text) => {
    if ((!n && !text) || matchMedia("(hover: none)").matches) {
      tip.hidden = true
      return
    }
    tip.innerHTML = n
      ? `<strong>${esc(n.name)}</strong> <span>${esc(dateLabel(n.from, n.to, n.at, now, n.status !== "achieved"))}</span>`
      : esc(text)
    tip.hidden = false
    const r = svg.getBoundingClientRect()
    tip.style.left = `${Math.max(4, Math.min(r.width - tip.offsetWidth - 8, at[0] + 14))}px`
    tip.style.top = `${at[1] + 14}px`
  }

  // --------------------------------------------------------- URL state
  // #n=id selects a technology; #z=x,y,zoom keeps the view; d, f, g, l and
  // t keep the display options.
  let pending = 0
  const save = () => {
    const h = new URLSearchParams()
    if (view.selection) h.set("n", view.selection.id)
    const [x, y, k] = view.view()
    h.set("z", `${Math.round(x)},${Math.round(y)},${k.toFixed(2)}`)
    if (display.detail !== DETAIL_DEFAULT) h.set("d", String(display.detail))
    if (display.trendLayout !== "auto") h.set("tl", display.trendLayout)
    if (display.frontier) h.set("f", "1")
    if (!display.grow) h.set("g", "0")
    if (display.allLinks) h.set("l", "1")
    if (display.trends.length) h.set("t", display.trends.join(","))
    history.replaceState(null, "", `#${h}`.replace(/%2C/g, ","))
  }
  function saveSoon() {
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

  // Restore the options from the URL, then the view.
  const h = new URLSearchParams(location.hash.slice(1))
  const d = h.get("d")
  const restored: Partial<Display> = {}
  if (d) restored.detail = d === "all" ? 100 : Math.min(100, Math.max(0, Math.round(+d))) || 0
  const tl = h.get("tl")
  if (tl === "strips" || tl === "compact" || tl === "combined") restored.trendLayout = layoutSel.value = tl
  if (h.get("f") === "1") restored.frontier = frontierBox.checked = true
  if (h.get("g") === "0") restored.grow = growBox.checked = false
  if (h.get("l") === "1") restored.allLinks = linksBox.checked = true
  const t = h.get("t")?.split(",").filter((id) => metrics.has(id))
  if (t?.length) {
    for (const id of t) trendBoxes.get(id)!.checked = true
    restored.trends = sortedMetrics.filter((m) => t.includes(m.id)).map((m) => m.id)
    ;($("#trends") as HTMLDetailsElement).open = true
  }
  slider.value = String(restored.detail ?? DETAIL_DEFAULT)
  setDisplay(restored)

  view.resize()
  new ResizeObserver(() => view.resize()).observe(svg)
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
