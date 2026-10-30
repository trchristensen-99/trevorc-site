import "./style.css"
import { dateLabel } from "./time"
import { DETAIL_DEFAULT, DISPLAY_DEFAULTS, EFFORT_STOPS, KIND_COLORS, RISK_COLORS, ROUTE_COLORS, SERIES_COLORS, STATUS_COLORS, TreeView, effortColor, fmtValue, kindShape, seriesOf, type Display, type Filters } from "./tree"
import type { Details, Metric, Models, Node, ResourceUse, Source, Supply, Tree } from "./types"

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

// The viewer's own choice (Display > Theme), else the site's, else the
// system's.
function siteTheme(): "light" | "dark" {
  try {
    const own = localStorage.getItem("tech-tree-theme")
    if (own === "dark" || own === "light") return own
  } catch {
    /* storage blocked */
  }
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
// Round to two significant figures, with commas: 1,234,567 -> "1,200,000".
const sig = (n: number, d = 2) => (n >= 10 ** d ? Math.round(+n.toPrecision(d)) : +n.toPrecision(d)).toLocaleString("en-US")
// A big quantity in words: 2.3 billion, 450,000.
function qty(n: number) {
  if (n >= 1e12) return `${+(n / 1e12).toPrecision(2)} trillion`
  if (n >= 1e9) return `${+(n / 1e9).toPrecision(2)} billion`
  if (n >= 1e6) return `${+(n / 1e6).toPrecision(2)} million`
  return sig(n)
}
const UNIT_WORD: Record<string, string> = { t: "tonnes", kg: "kg", barrels: "barrels", "m³": "cubic meters", "million m³": "million cubic meters" }
const amountOf = (v: { value: number; unit: string }) => `${qty(v.value)} ${UNIT_WORD[v.unit] ?? v.unit}`
const yr = (y: number) => String(Math.round(y))
const range = (a: number, b: number) => (Math.round(a) === Math.round(b) ? yr(a) : `${yr(a)} to ${Math.round(b) > 2200 ? "after 2200" : yr(b)}`)
const badge = (rating: string) => `<span class="badge" style="--c:${RISK_COLORS[rating] ?? "var(--muted)"}">${esc(rating)}</span>`

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

// Suggestions go to the site's GitHub issues, with a template.
const SUGGEST = "https://github.com/trchristensen-99/trevorc-site/issues/new?template=tech-tree.md"

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
  const W = 300, H = 170, L = 50, B = 22, T = 8, Rr = 8
  // Log scale, or linear for steady growth. Several series share one scale.
  const f = (v: number) => (m.log ? Math.log10(v) : v)
  const inv = (u: number) => (m.log ? 10 ** u : u)
  const ok = (v: number) => !m.log || v > 0
  const lines = seriesOf(m).map((ln) => ({ ...ln, points: ln.points.filter(([, y]) => ok(y)) })).filter((ln) => ln.points.length >= 2)
  if (!lines.length) return ""
  const many = lines.length > 1
  const future = milestones.filter((n) => n.status !== "achieved").map((n) => n.at)
  const allScen = lines.flatMap((ln) => ln.scenarios)
  const scenEnd = Math.max(...allScen.flatMap((sc) => sc.points.map((p) => p[0])), -Infinity)
  const lastX = Math.max(...lines.map((ln) => ln.points.at(-1)![0]))
  const x0 = Math.min(...lines.map((ln) => ln.points[0][0]))
  const x1 = Math.min(2100, Math.max(lastX + (lines.some((ln) => ln.trend) ? 10 : 0), scenEnd, ...future.map((y) => Math.min(y + 3, 2100))))
  const ys = milestones.map((n) => f(n.threshold!.value))
  for (const ln of lines) {
    for (const [, v] of ln.points) ys.push(f(v))
    for (const sc of ln.scenarios) for (const [x, v] of [...sc.points, ...sc.low, ...sc.high]) if (x <= x1 && ok(v)) ys.push(f(v))
    if (ln.trend) ys.push(ln.trend.slope * x1 + ln.trend.intercept)
  }
  let y0 = Math.min(...ys), y1 = Math.max(...ys)
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
  const path = (list: [number, number][]) => list.filter(([x, v]) => x <= x1 && ok(v)).map(([x, v], j) => `${j ? "L" : "M"}${px(x).toFixed(1)},${py(f(v)).toFixed(1)}`).join("")
  // One color per series (or per scenario when there's one line); dashes
  // tell a series' scenarios apart.
  const DASHES = ["2 2.5", "6 3", "1 2", "8 3 2 3"]
  const lineColor = (i: number) => (many ? SERIES_COLORS[i % SERIES_COLORS.length] : "var(--accent)")
  const scenColor = (i: number, j: number) => (many ? lineColor(i) : SCENARIO_COLORS[j % SCENARIO_COLORS.length])
  const body = lines.map((ln, i) => {
    const c = lineColor(i)
    const tr = ln.trend
    const trend = tr
      ? `<line x1="${px(tr.from)}" y1="${py(tr.slope * tr.from + tr.intercept)}" x2="${px(tr.to)}" y2="${py(tr.slope * tr.to + tr.intercept)}" class="fit"/>` +
        `<line x1="${px(tr.to)}" y1="${py(tr.slope * tr.to + tr.intercept)}" x2="${px(x1)}" y2="${py(tr.slope * x1 + tr.intercept)}" class="fit ext"/>`
      : ""
    const scen = ln.scenarios.map((sc, j) => {
      const sc_c = scenColor(i, j)
      const band = sc.low.length > 1 && sc.high.length > 1 ? `<path d="${path(sc.low)}${path([...sc.high].reverse()).replace(/^M/, "L")}Z" fill="${sc_c}" opacity="${many ? 0.08 : 0.12}"/>` : ""
      return `${band}<path d="${path(sc.points)}" fill="none" stroke="${sc_c}" stroke-width="1.5" stroke-dasharray="${many ? DASHES[j % DASHES.length] : "2 2.5"}"/>`
    }).join("")
    const dots = many
      ? `<path d="${path(ln.points)}" fill="none" stroke="${c}" stroke-width="1.8"><title>${esc(ln.name)}</title></path>`
      : ln.points.map(([x, y]) => `<circle cx="${px(x)}" cy="${py(f(y))}" r="2.4"><title>${Math.round(x)}: ${esc(fmtValue(y, m.unit))}</title></circle>`).join("")
    return scen + trend + dots
  }).join("")
  const marks = milestones.map((n) => {
    const v = f(n.threshold!.value)
    const cls = `ms${n.id === highlight ? " on" : ""}`
    return `<line x1="${L}" x2="${W - Rr}" y1="${py(v)}" y2="${py(v)}" class="${cls}"/><text x="${W - Rr - 2}" y="${py(v) - 3}" class="mslab${n.id === highlight ? " on" : ""}">${esc(n.threshold!.label ?? n.name)}</text>`
  }).join("")
  const rateOf = (tr: Metric["trend"]) => !tr ? "no clean trend"
    : tr.linear ? `${tr.slope > 0 ? "rises" : "falls"} about ${esc(fmtValue(Math.abs(tr.slope * 10), m.unit))} a decade (r² ${tr.r2.toFixed(2)})`
    : `${tr.slope < 0 ? "halves" : "doubles"} about every ${tr.years!.toFixed(1)} years (r² ${tr.r2.toFixed(2)})`
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
  const wright = m.wright ? `; falls ${(m.wright.learningRate * 100).toFixed(0)}% each time cumulative production doubles` : ""
  const key = `${lines.some((ln) => ln.trend) ? " Dashed: the trend carried forward." : ""}${allScen.length ? ` ${many ? "Patterned" : "Dotted"}: forecasts.` : ""}${milestones.length ? " Lines across: milestones." : ""}`
  const rates = many
    ? `<ul class="series">${lines.map((ln, i) => `<li><span class="sw" style="background:${lineColor(i)}"></span><div><strong>${esc(ln.name)}</strong>: ${rateOf(ln.trend)}${ln.points.length ? `; ${esc(fmtValue(ln.points.at(-1)![1], m.unit))} in ${Math.round(ln.points.at(-1)![0])}` : ""}</div></li>`).join("")}</ul><p class="rate">${key.trim()}</p>`
    : `<p class="rate">${cap(rateOf(lines[0].trend))}${wright}.${key}</p>`
  const scenList = lines.map((ln, i) => ln.scenarios.length
    ? `${many ? `<p class="kind">${esc(ln.name)}</p>` : ""}<ul class="scenarios">${ln.scenarios.map((sc, j) => `<li>${many ? `<svg width="18" height="8"><line x1="0" x2="18" y1="4" y2="4" stroke="${scenColor(i, j)}" stroke-width="2" stroke-dasharray="${DASHES[j % DASHES.length]}"/></svg>` : `<span class="sw" style="background:${scenColor(i, j)}"></span>`}<div><strong>${esc(sc.name)}</strong> <span class="tag">${esc(SCENARIO_KIND[sc.kind] ?? sc.kind)}</span>${sc.note ? `<br><span class="note">${esc(sc.note)}</span>` : ""}${sc.sources?.length ? `<br><span class="note">${sc.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join("; ")}</span>` : ""}</div></li>`).join("")}</ul>`
    : "").join("")
  return `${title ? `<h3>${esc(m.name)}</h3>` : ""}
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.name)}">${grid.join("")}${xt.join("")}${marks}${body}</svg>
    ${rates}
    ${scenList ? `<details class="forecasts"${many ? "" : " open"}><summary>Forecasts</summary>${scenList}</details>` : ""}
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
  const applyTheme = (choice?: string) => {
    const dark = choice === "dark" || (choice !== "light" && siteTheme() === "dark")
    document.documentElement.dataset.theme = dark ? "dark" : "light"
    view.setDark(dark)
  }
  try {
    window.parent.document.addEventListener("themechange", () => applyTheme())
  } catch {
    /* not same-origin */
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme())
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
  // The key changes with what the colors mean.
  const renderLegend = () => {
    const by = display.colorBy
    const colors = by === "status"
      ? (Object.keys(STATUS_COLORS) as Node["status"][]).map((k) => `<li><span class="sw" style="background:${STATUS_COLORS[k]}"></span>${STATUS_LABEL[k]}</li>`).join("")
      : by === "kind"
        ? (Object.keys(KIND_COLORS) as Node["kind"][]).map((k) => `<li><span class="sw" style="background:${KIND_COLORS[k]}"></span>${KIND_LABEL[k]}</li>`).join("")
        : by === "risk"
          ? Object.entries(RISK_COLORS).map(([k, c]) => `<li><span class="sw" style="background:${c}"></span>${k.charAt(0).toUpperCase() + k.slice(1)}</li>`).join("") + `<li><span class="sw" style="background:var(--line)"></span>No rated resources</li>`
          : by === "effort"
            ? `<li><span class="sw ramp" style="background:linear-gradient(90deg,${EFFORT_STOPS.join(",")})"></span>1 to a million person-years</li>` + [1, 100, 10000, 1e6].map((v) => `<li><span class="sw" style="background:${effortColor(Math.log10(v))}"></span>${sig(v)}</li>`).join("") + `<li><span class="sw" style="background:var(--line)"></span>Not recorded</li>`
            : tree.fields.map((f) => `<li><span class="sw" style="background:${f.color}"></span>${esc(f.name)}</li>`).join("") + `<li><span class="sw" style="background:${tree.roots.color}"></span>Roots</li>`
    const heading = { field: "field", status: "status", kind: "kind", risk: "supply risk", effort: "what it took" }[by]
    $("#legend").innerHTML =
      `<li class="head">Colors: ${heading}</li>${colors}<li class="head">Shapes: kind</li>` +
      (Object.keys(KIND_LABEL) as Node["kind"][]).map((k) => `<li>${icon(k, "var(--muted)")}${KIND_LABEL[k]}</li>`).join("") +
      `<li class="head">Fill: status</li>` +
      `<li>${icon("device", "var(--muted)")}<span>Solid: achieved</span></li>` +
      `<li>${icon("device", "var(--muted)", "var(--muted)", "", 0.42)}<span>Half-filled: being worked on</span></li>` +
      `<li>${icon("device", "var(--bg-panel)", "var(--muted)", "2 1.5")}<span>Dashed: not yet; the bar is its likely window</span></li>` +
      `<li>${icon("device", "#c9cbc6", "var(--muted)")}<span>Gray: lost or forgotten</span></li>` +
      `<li class="head">Links</li><li><span class="sw line"></span>needs</li><li><span class="sw line dash"></span>helped by</li><li><span class="sw line dot"></span>uses a resource</li>`
  }

  // ----------------------------------------------------------- display
  // Detail: a slider from nothing (0) through the default set to
  // everything (100).
  const display: Display = { ...DISPLAY_DEFAULTS, trends: [] }
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
  // The display options: every control marked data-opt sets that option
  // (checkboxes on and off, menus their value).
  type Opt = Exclude<keyof Display, "detail" | "trends">
  const optControls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-opt]")]
  const readOpt = (el: HTMLInputElement | HTMLSelectElement) => {
    const key = el.dataset.opt as Opt
    const v = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : typeof DISPLAY_DEFAULTS[key] === "number" ? +el.value : el.value
    return { [key]: v } as Partial<Display>
  }
  const writeOpt = (el: HTMLInputElement | HTMLSelectElement) => {
    const v = display[el.dataset.opt as Opt]
    if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = !!v
    else el.value = String(v)
  }
  for (const el of optControls)
    el.addEventListener("change", () => {
      setDisplay(readOpt(el))
      if (el.dataset.opt === "colorBy") renderLegend()
    })
  $("#reset-display").addEventListener("click", () => {
    setDisplay({ ...DISPLAY_DEFAULTS, detail: display.detail, trends: display.trends, trendLayout: display.trendLayout, grow: display.grow, frontier: display.frontier })
    optControls.forEach(writeOpt)
    renderLegend()
  })
  // Theme: the site's (or system's) unless the viewer picks one.
  const themeSel = $<HTMLSelectElement>("#theme")
  try {
    themeSel.value = localStorage.getItem("tech-tree-theme") ?? "auto"
  } catch {
    /* storage blocked */
  }
  themeSel.addEventListener("change", () => {
    try {
      if (themeSel.value === "auto") localStorage.removeItem("tech-tree-theme")
      else localStorage.setItem("tech-tree-theme", themeSel.value)
    } catch {
      /* storage blocked: applies for this visit only */
    }
    applyTheme(themeSel.value)
  })

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
    info.classList.toggle("wide", what === "models")
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

  const models = tree.models
  const KIND_GROUP = (kind: string) => models.effort?.kinds.find((k) => k.kinds.includes(kind))
  // How many times bigger (or smaller) than typical, in words.
  const times = (dex: number) => {
    const f = 10 ** Math.abs(dex)
    if (f < 2) return "about typical"
    const w = f < 15 ? `${Math.round(f)} times` : f < 150 ? `${Math.round(f / 10) * 10} times` : `${sig(f, 1)} times`
    return dex > 0 ? `about ${w} the typical effort` : `about 1/${f < 15 ? Math.round(f) : f < 150 ? Math.round(f / 10) * 10 : sig(f, 1)} of the typical effort`
  }

  // What it took (or has taken so far).
  const effortHTML = (n: Node, d: Details) => {
    const e = d.effort, c = d.effortCalc
    if (!e) return ""
    const open = n.status === "ongoing" || n.status === "speculative"
    const span = Array.isArray(e.span) ? `${whenLabel(e.span[0])} to ${open ? "now" : whenLabel(e.span[1])}${c?.years ? ` (${sig(c.years)} year${c.years === 1 ? "" : "s"})` : ""}` : ""
    const g = KIND_GROUP(n.kind)
    const vs = c?.vsTrend != null && g ? `<dt>Compared</dt><dd>${times(c.vsTrend)} for ${g.name === "discovery" ? "a discovery" : g.name === "technique or device" ? "a technique or device" : "infrastructure or an institution"} of its time <span class="note">(the fit in What it takes)</span></dd>` : ""
    const rows = (span ? `<dt>Time</dt><dd>${esc(span)}</dd>` : "") +
      (e.people ? `<dt>${open ? "People now" : "People"}</dt><dd>${people(e.people)}</dd>` : "") +
      (c?.py ? `<dt>Person-years</dt><dd>about ${sig(c.py)}${open ? " so far" : ""}</dd>` : "") +
      (e.cost_usd ? `<dt>Cost</dt><dd>${money(e.cost_usd)}${open ? " so far" : ""} (2025 dollars)</dd>` : "") +
      (e.compute_usd ? `<dt>Computing</dt><dd>${money(e.compute_usd)} for the final training run</dd>` : "") +
      (open && e.growth ? `<dt>Growing</dt><dd>about ${Math.round(e.growth * 100)}% a year</dd>` : "") + vs
    const tags = [c?.work === "build" ? "mostly building, not finding out how" : "", e.rough ? "rough estimate" : ""].filter(Boolean)
    if (!rows && !e.note) return ""
    return `<h3>${open ? "What it has taken so far" : "What it took"}</h3>${tags.length ? `<p class="note">${tags.map((t) => `<span class="tag">${t}</span>`).join(" ")}</p>` : ""}${rows ? `<dl>${rows}</dl>` : ""}${e.note ? `<p class="note">${esc(e.note)}</p>` : ""}`
  }

  // Estimates from the tree's own history, beside the judgment above.
  const outsideView = (n: Node, d: Details) => {
    const em = d.effortModel, pm = d.prereqModel
    if (!em && !pm) return ""
    const rows: string[] = []
    if (em) rows.push(`<dt>From effort</dt><dd>${yr(em.q50)} <span class="note">(80%: ${range(em.q10, em.q90)})</span><br><span class="note">If it needs as much work as breakthroughs typically do, given that ${sig(em.spent)} person-years haven't been enough, at ${sig(em.people)} people${em.growth ? `, growing ${Math.round(em.growth * 100)}% a year` : ""}${pm && pm.ready > now + 0.5 ? `, and not before its prerequisites (${yr(pm.ready)})` : ""}.</span></dd>`)
    if (pm) rows.push(`<dt>From prerequisites</dt><dd>${yr(pm.q50)} <span class="note">(middle half: ${range(pm.q25, pm.q75)})</span><br><span class="note">${pm.last > now + 0.5 ? `Its prerequisites should be in place by ${yr(pm.last)}` : `Its prerequisites were in place by ${yr(pm.last)}`}; since 1950, technologies came a median ${Math.round(models.lag.basis.q50)} years after their last prerequisite${pm.waited >= 1 ? `, and longer for those that had already waited ${Math.round(pm.waited)} years` : ""}.</span></dd>`)
    return `<h3>Outside view</h3><dl>${rows.join("")}</dl>`
  }

  // A technology's resources, with how much it needs and the supply risk.
  const resourcesHTML = (ids: string[], use: ResourceUse[]) => {
    const byRes = new Map(use.map((u) => [u.resource, u]))
    return `<h3>Resources</h3><ul class="resources">${ids.map((id) => {
      const r = byId.get(id), u = byRes.get(id)
      return `<li>${link(id)}${r?.risk ? ` ${badge(r.risk)}` : ""}${u?.share ? ` <span class="note">${u.share}% of world use</span>` : ""}${u?.amount ? `<br><span class="note">${esc(u.amount)}</span>` : ""}${u?.substitute ? `<br><span class="note">Avoided by ${link(u.substitute)}</span>` : ""}${u?.source ? `<br><span class="note"><a href="${esc(u.source.url)}" target="_blank" rel="noopener">${esc(u.source.title)}</a></span>` : ""}</li>`
    }).join("")}</ul>`
  }
  const usedByHTML = (list: ResourceUse[]) => {
    const sorted = [...list].sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || (b.amount ? 1 : 0) - (a.amount ? 1 : 0) || (byId.get(a.tech!)?.at ?? 0) - (byId.get(b.tech!)?.at ?? 0))
    return `<h3>Used by</h3><ul class="resources">${sorted.map((u) => `<li>${link(u.tech!)}${u.share ? ` <span class="note">${u.share}% of world use</span>` : ""}${u.amount ? `<br><span class="note">${esc(u.amount)}</span>` : ""}</li>`).join("")}</ul>`
  }

  // A resource's supply: where it comes from, how long it lasts, and the
  // rating built from them.
  const PART_HELP: Record<string, string> = {
    concentration: "how few countries produce or process it",
    depletion: "reserves against production",
    recycling: "how little is recycled",
    "demand growth": "demand in 2040 against today",
  }
  const supplyHTML = (d: Details) => {
    const s: Supply | undefined = d.supply, c = d.supplyCalc
    if (!s) return ""
    const share = (list: [string, number][]) => list.map(([k, v]) => `${esc(k)} ${v}%`).join(", ")
    const rows: string[] = []
    if (s.production) rows.push(`<dt>Production</dt><dd>${amountOf(s.production)}${s.production.what ? ` <span class="note">(${esc(s.production.what)})</span>` : ""} in ${s.year ?? ""}</dd>`)
    if (s.reserves) rows.push(`<dt>Reserves</dt><dd>${s.reserves.more ? "over " : ""}${amountOf(s.reserves)}${c?.rp ? `, about ${sig(c.rp)} years of production` : ""}</dd>`)
    if (s.producers?.length) rows.push(`<dt>Producers</dt><dd>${share(s.producers)}</dd>`)
    if (s.processing) rows.push(`<dt>${esc(s.processing.stage.charAt(0).toUpperCase() + s.processing.stage.slice(1))}</dt><dd>${share(s.processing.producers)}</dd>`)
    if (s.recycling) rows.push(`<dt>Recycled</dt><dd>${esc(s.recycling)} at end of life</dd>`)
    if (s.demand_2040) rows.push(`<dt>Demand</dt><dd>${s.demand_2040 >= 2 ? `${s.demand_2040} times` : `up ${Math.round((s.demand_2040 - 1) * 100)}%`} by 2040 (IEA, stated policies)</dd>`)
    if (s.uses?.length) rows.push(`<dt>Uses</dt><dd>${share(s.uses)}</dd>`)
    const parts = c && !c.judged && c.score != null
      ? `<ul class="parts">${Object.entries(c.parts).map(([k, v]) => `<li><span class="bar"><span style="width:${Math.round(v * 100)}%"></span></span>${esc(k)} <span class="note">${PART_HELP[k] ?? ""}</span></li>`).join("")}</ul><p class="note">Score ${c.score.toFixed(2)} of 1, from the parts shown (see What it takes).</p>`
      : s.risk?.note ? `<p class="note">${esc(s.risk.note)}</p>` : ""
    return `<h3>Supply</h3>${c ? `<p>${badge(c.rating)} supply risk</p>` : ""}${parts}${rows.length ? `<dl>${rows.join("")}</dl>` : ""}${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}${sourcesHTML(s.sources, "Supply sources")}`
  }

  // Steps toward it, done and not; the open ones are its open problems.
  const checklistHTML = (d: Details) => {
    const c = d.checklist
    if (!c?.length) return ""
    const done = c.filter((x) => x.done != null).length
    return `<h3>Steps and open problems</h3><p class="note"><span class="bar"><span style="width:${Math.round((100 * done) / c.length)}%"></span></span> ${done} of ${c.length} done</p><ul class="checklist">${c.map((x) =>
      `<li class="${x.done != null ? "done" : ""}"><span class="box">${x.done != null ? "✓" : ""}</span><div>${x.node ? `<a href="#n=${esc(x.node)}" data-node="${esc(x.node)}">${esc(x.step)}</a>` : esc(x.step)}${x.done != null ? ` <span class="note">${x.done}</span>` : ""}${x.who ? `<br><span class="note">${esc(x.who)}</span>` : ""}${x.note ? `<br><span class="note">${esc(x.note)}</span>` : ""}</div></li>`).join("")}</ul>`
  }

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
    if (n.trendYear && open) rows.push(`<dt>Trend</dt><dd>${n.trendYear < now
      ? `Behind its trend line, which passed this level around ${Math.round(n.trendYear)}`
      : `The trend alone gets there around ${Math.round(n.trendYear)}`}</dd>`)
    if (n.scenarioYears?.length && open) {
      const mm = metrics.get(n.threshold!.metric)!
      const ln = seriesOf(mm).find((x) => !mm.series || x.id === n.threshold!.series)
      rows.push(`<dt>Forecasts</dt><dd>${n.scenarioYears.map((x) => {
        const sc = ln?.scenarios.find((y) => y.id === x.id)
        return `${esc(sc?.name ?? x.id)}: ${x.year == null ? "not by " + Math.round(Math.max(...(sc?.points ?? [[2100, 0]]).map((p) => p[0]))) : Math.round(x.year)}`
      }).join("<br>")}</dd>`)
    }
    rows.push(`<dt>Status</dt><dd>${STATUS_LABEL[n.status]}</dd>`)
    if (n.lane !== "roots") rows.push(`<dt>Fields</dt><dd>${n.fields.map(fieldName).map(esc).join(", ")}</dd>`)
    if (n.kind === "resource" && d.supplyCalc) rows.push(`<dt>Supply risk</dt><dd>${badge(d.supplyCalc.rating)}${d.supplyCalc.judged ? " <span class=\"note\">my judgment</span>" : ""}</dd>`)
    else if (d.risk) rows.push(`<dt>Supply risk</dt><dd>${badge(d.risk.rating)} <span class="note">from ${link(d.risk.resource)}</span></dd>`)
    if (d.scarcity) rows.push(`<dt>Scarcity</dt><dd>${esc(d.scarcity)} <span class="note">long run, my judgment</span></dd>`)
    const effort = effortHTML(n, d)
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
      ? `<p class="threshold">Reached when <a href="#" data-metric="${esc(m.id)}">${esc(m.name.charAt(0).toLowerCase() + m.name.slice(1))}</a>${n.threshold.series ? ` (${esc(m.series?.find((x) => x.id === n.threshold!.series)?.name ?? n.threshold.series)})` : ""} ${m.better === "lower" ? "falls to" : "reaches"} <strong>${esc(fmtValue(n.threshold.value, m.unit))}</strong>.</p>`
      : ""
    return `<p class="kind">${KIND_LABEL[n.kind]}</p><h2>${esc(n.name)}</h2>` +
      threshold +
      (d.summary ? `<p>${esc(d.summary)}</p>` : "") +
      (d.criterion ? `<div class="criterion"><h3>Counts as done when</h3><p>${esc(d.criterion)}</p></div>` : "") +
      `<dl>${rows.join("")}</dl>` +
      (d.lost ? `<h3>Lost</h3><p>${esc(d.lost)}</p>` : "") +
      (d.note ? `<p class="note">${esc(d.note)}</p>` : "") +
      routes + checklistHTML(d) +
      (d.alsoHelps?.length ? `<h3>Would also help with</h3><p>${d.alsoHelps.map(esc).join(", ")}</p>` : "") +
      efforts + effort + outsideView(n, d) +
      (n.kind === "resource" ? supplyHTML(d) : "") +
      (d.forecast?.note ? `<h3>Forecast</h3><p>${esc(d.forecast.note)}</p>${sourcesHTML(d.forecast.sources, "Forecast sources")}` : "") +
      (m ? metricChart(m, milestonesOf(m), n.id) : "") +
      (needs.length ? `<h3>${routes ? "Needs on every route" : "Needs"}</h3><p>${linkList(needs)}</p>` : "") +
      (uses.length ? resourcesHTML(uses, d.resourceUse ?? []) : "") +
      (helped.length ? `<h3>Helped by</h3><p>${linkList(helped)}</p>` : "") +
      (rivals.length ? `<h3>Competed with</h3><p>${linkList(rivals)}</p>` : "") +
      (n.kind === "resource" && d.usedBy?.length ? usedByHTML(d.usedBy) : led.length ? `<h3>Led to</h3><p>${linkList(led)}</p>` : "") +
      sourcesHTML(d.sources) +
      `<p class="note suggest"><a href="${SUGGEST}&title=${encodeURIComponent(`[tech tree] ${n.name}`)}" target="_blank" rel="noopener">Suggest a change to this</a></p>`
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
        return `<li>${link(n.id)} <span class="note">${esc(dateLabel(n.from, n.to, n.at, now, true))}${n.steps ? `; ${n.steps[0]} of ${n.steps[1]} steps done` : ""}</span>${efforts.length ? `<br><span class="note">${efforts.map((x) => esc(x.who)).slice(0, 5).join(" · ")}${efforts.length > 5 ? " …" : ""}</span>` : ""}</li>`
      }).join("")}</ul>`).join(""), "frontier")
  })

  // What it takes: the effort fit and its chart, how long technologies
  // waited after their prerequisites, the frontier's outside-view
  // estimates, and the resources by supply risk.
  const timeX = (year: number) => {
    const t = tree.meta.time
    const dd = year - now
    return dd >= 0 ? t.futureGain * Math.log10(1 + dd / t.tau) : -Math.log10(1 + -dd / t.tau)
  }
  const effortChart = (d: Record<string, Details>, m: NonNullable<Models["effort"]>) => {
    const W = 312, H = 210, L = 34, B = 20, T = 8, R = 6
    const x0 = timeX(m.from), x1 = timeX(2030)
    const px = (year: number) => L + ((timeX(year) - x0) / (x1 - x0)) * (W - L - R)
    const py = (v: number) => T + (1 - v / 7) * (H - T - B)
    const pts = tree.nodes.filter((n) => n.py != null && n.at >= m.from && d[n.id]?.effortCalc)
    const grid = [0, 1, 2, 3, 4, 5, 6, 7].map((v) => `<line x1="${L}" x2="${W - R}" y1="${py(v)}" y2="${py(v)}" class="grid"/><text x="${L - 4}" y="${py(v)}" class="ylab">${v < 4 ? sig(10 ** v) : v >= 6 ? `${10 ** (v - 6)}M` : `${10 ** (v - 3)}k`}</text>`).join("")
    const xt = [1500, 1700, 1800, 1900, 1950, 2000, 2025].map((y) => `<text x="${px(y)}" y="${H - 6}" class="xlab">${y}</text>`).join("")
    // The fitted line for each kind group, with the main group's scatter.
    const line = (shift: number) => (y: number) => m.beta[0] + m.beta[1] * ((y - 1900) / 100) + shift
    const years = Array.from({ length: 41 }, (_, i) => m.from + ((2026 - m.from) * i) / 40)
    const path = (f: (y: number) => number) => years.map((y, i) => `${i ? "L" : "M"}${px(y).toFixed(1)},${py(f(y)).toFixed(1)}`).join("")
    const main = line(m.kinds[1]?.shift ?? 0)
    const band = "M" + [...years.map((y) => [px(y), py(main(y) + m.sd)]), ...years.map((y) => [px(y), py(main(y) - m.sd)]).reverse()].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z"
    const lines = m.kinds.map((k, i) => `<path d="${path(line(k.shift))}" fill="none" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="${["", "6 3", "2 2"][i]}" opacity="0.65"/>`).join("")
    const dots = pts.map((n) => {
      const c = d[n.id].effortCalc!
      const open = n.status !== "achieved"
      const col = fieldColor.get(n.fields[0]) ?? "var(--muted)"
      const x = px(open ? now : n.at), y = py(n.py!)
      const label = `${n.name}: about ${sig(10 ** n.py!)} person-years${open ? " so far" : ""}${c.rough ? " (rough)" : ""}${c.work === "build" ? ", mostly building" : ""}`
      const style = c.work === "build" || open ? `fill:none;stroke:${col};stroke-width:1.3` : c.rough ? `fill:${col};fill-opacity:0.35;stroke:${col}` : `fill:${col}`
      const shape = open ? `<path d="M${x},${y - 4}L${x + 4},${y}L${x},${y + 4}L${x - 4},${y}Z" style="${style}"/>` : c.work === "build" ? `<rect x="${x - 2.8}" y="${y - 2.8}" width="5.6" height="5.6" style="${style}"/>` : `<circle cx="${x}" cy="${y}" r="3" style="${style}"/>`
      return `<a href="#n=${esc(n.id)}" data-node="${esc(n.id)}"><title>${esc(label)}</title>${shape}</a>`
    }).join("")
    return `<svg class="chart effort" viewBox="0 0 ${W} ${H}" role="img" aria-label="Person-years behind each technology, by the year it was achieved">${grid}${xt}<path d="${band}" fill="var(--ink)" opacity="0.06"/>${lines}${dots}</svg>
      <p class="note">Person-years (log scale) by year achieved, on the tree's time axis. Filled: research efforts (faded: rough estimates); squares: mostly building; diamonds: not yet achieved, effort so far. Lines: the fit for ${m.kinds.map((k, i) => `${k.name} (${["solid", "dashed", "dotted"][i]})`).join(", ")}; the band is one standard deviation.</p>`
  }

  $("#models").addEventListener("click", async () => {
    view.select(null)
    const d = details ?? (await detailsReady)
    const m = models.effort, cost = models.cost, span = models.span, lag = models.lag
    const effortText = m
      ? `<p>The tree records what ${m.n} research efforts since ${m.from} took, in people and years. In a least-squares fit, the person-years behind a breakthrough grew about ${m.fold.toFixed(1)}-fold a century, and ${m.kinds.slice(1).map((k) => { const f = 10 ** k.shift; return `${k.name === "technique or device" ? "techniques and devices" : "infrastructure and institutions"} took ${f < 1.5 && f > 0.67 ? "about the same as discoveries" : `about ${f >= 1 ? Math.round(f) : (Math.round(f * 10) / 10)} times as much as discoveries`}` }).join(", while ")}. But the scatter dwarfs both: one standard deviation is a factor of ${Math.round(10 ** m.sd)}, and the fit explains only ${Math.round(m.r2 * 100)}% of the variation. Maxwell's equations took one person; the Manhattan Project took 130,000.${cost ? ` Costs (2025 dollars, ${cost.n} efforts since 1900) grew faster, about ${Math.round(cost.fold)}-fold a century, as each person came with more equipment.` : ""}${span ? ` Bigger efforts take longer, but not in proportion: years rose as person-years to the power ${span.exponent.toFixed(2)}, so a hundred times the effort took about ${(100 ** span.exponent).toFixed(1)} times as long. Mostly, more work means more people at once.` : ""}</p>
        <p class="note">This matches Bloom, Jones, Van Reenen and Webb (2020), who found that research effort per unit of progress keeps rising (Moore's law takes 18 times the researchers it did in 1971), though a list of famous successes can't say what failed. Whose effort counts is a judgment: the core team, not the trial volunteers or the users.</p>`
      : ""
    const lagRows = lag.eras.filter((e) => e.n).map((e) => `<tr><td>${e.from < 0 ? "Before 1500" : e.to >= now - 1 ? `Since ${e.from}` : `${e.from} to ${e.to}`}</td><td>${e.n}</td><td>${Math.round(e.q50!)}</td><td>${Math.round(e.q25!)} to ${Math.round(e.q75!)}</td></tr>`).join("")
    const open = tree.nodes.filter((n) => (n.status === "ongoing" || n.status === "speculative") && (d[n.id]?.effortModel || (d[n.id]?.prereqModel && n.tier <= 2))).sort((a, b) => a.at - b.at)
    const est = open.map((n) => {
      const em = d[n.id].effortModel, pm = d[n.id].prereqModel
      return `<tr><td>${link(n.id)}</td><td>${yr(n.at)}</td><td>${em ? `${yr(em.q50)}<span class="note"><br>${range(em.q10, em.q90)}</span>` : ""}</td><td>${pm ? `${yr(pm.q50)}<span class="note"><br>${range(pm.q25, pm.q75)}</span>` : ""}</td></tr>`
    }).join("")
    const res = tree.nodes.filter((n) => n.kind === "resource" && d[n.id]?.supplyCalc).sort((a, b) => ["very high", "high", "moderate", "low"].indexOf(a.risk!) - ["very high", "high", "moderate", "low"].indexOf(b.risk!) || (d[b.id].supplyCalc!.score ?? 0) - (d[a.id].supplyCalc!.score ?? 0))
    const resRows = res.map((n) => {
      const s = d[n.id].supply!, c = d[n.id].supplyCalc!
      const top = s.processing && s.processing.producers[0][1] > (s.producers?.[0]?.[1] ?? 0) ? s.processing.producers[0] : s.producers?.[0]
      return `<tr><td>${link(n.id)}</td><td>${badge(c.rating)}</td><td>${top ? `${esc(top[0])} ${top[1]}%` : ""}</td><td>${c.rp ? sig(c.rp) : ""}</td></tr>`
    }).join("")
    show(`<p class="kind">Models</p><h2>What it takes</h2>
      <p>Rough models built from the tree itself: how much effort technologies took, how long they came after what they needed, and how secure the resources they use are. They give an outside view beside the judgment behind each future window.</p>
      <h3>Effort</h3>${m ? effortChart(d, m) : ""}${effortText}
      <h3>Time after prerequisites</h3>
      <p>How many years after its last prerequisite each technology came. The wait has shrunk from centuries to about a decade; since 1950 the median is ${Math.round(lag.basis.q50)} years (middle half ${Math.round(lag.basis.q25)} to ${Math.round(lag.basis.q75)}).</p>
      <table class="t"><thead><tr><th>Achieved</th><th>n</th><th>Median</th><th>Middle half</th></tr></thead><tbody>${lagRows}</tbody></table>
      <p class="note">Lags are measured to the latest direct prerequisite that is a technology, so missing links make lags look longer than they were.</p>
      <h3>The frontier, from the outside</h3>
      <p>For what isn't done yet, two estimates that ignore everything except the tree's history. <strong>From effort:</strong> treat the work a breakthrough needs as uncertain in the way past ones were; something that has absorbed a lot of work without success probably needs more still; divide what's left by the people on it now. <strong>From prerequisites:</strong> add the gaps seen since 1950 to when its prerequisites are in place. Both are crude, and the effort figures for future work are rough, but where they disagree with the tree's window, one of them is worth a second look.</p>
      <table class="t est"><thead><tr><th></th><th>Tree</th><th>From effort</th><th>From prereqs</th></tr></thead><tbody>${est}</tbody></table>
      <p class="note">Medians, with 80% ranges (effort) and middle halves (prerequisites). Shown for everything with effort figures and the major (tier 1 and 2) technologies; each technology's panel has both.</p>
      <h3>Resources by supply risk</h3>
      <p>A score from 0 to 1 for each resource: how concentrated its mining or processing is among countries (45%), its reserves against production (20%), how little is recycled (15%), and how fast demand is growing to 2040 (20%), averaged over the parts that are known. A technology takes the rating of the riskiest resource it uses; color the tree by supply risk under Display to see them.</p>
      <table class="t"><thead><tr><th></th><th>Risk</th><th>Leading country</th><th>Years of reserves</th></tr></thead><tbody>${resRows}</tbody></table>
      <p class="note">Concentration is by country, not company or alliance (OPEC+ coordinates oil output, which this understates). Reserves are what is economic to mine now; they grow as prices rise and exploration continues, so years of reserves is a warning light, not a countdown.</p>`, "models")
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
  // #n=id selects a technology; #z=x,y,zoom keeps the view; d (detail), t
  // and tl (trend lines and layout) and OPT_KEYS keep the display options,
  // when they differ from the defaults.
  const OPT_KEYS: Record<Opt, string> = { grow: "g", frontier: "f", links: "lk", colorBy: "cb", labels: "lb", nodeSize: "ns", bars: "br", trackNames: "tn", eras: "er", trendLayout: "tl" }
  let pending = 0
  const save = () => {
    const h = new URLSearchParams()
    if (view.selection) h.set("n", view.selection.id)
    const [x, y, k] = view.view()
    h.set("z", `${Math.round(x)},${Math.round(y)},${k.toFixed(2)}`)
    if (display.detail !== DETAIL_DEFAULT) h.set("d", String(display.detail))
    if (display.trendLayout !== "auto") h.set("tl", display.trendLayout)
    for (const [key, short] of Object.entries(OPT_KEYS)) {
      const v = display[key as Opt]
      if (v !== DISPLAY_DEFAULTS[key as Opt]) h.set(short, typeof v === "boolean" ? (v ? "1" : "0") : String(v))
    }
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
  for (const [key, short] of Object.entries(OPT_KEYS)) {
    const v = h.get(short)
    if (v == null) continue
    const def = DISPLAY_DEFAULTS[key as Opt]
    ;(restored as Record<string, unknown>)[key] = typeof def === "boolean" ? v === "1" : typeof def === "number" ? +v || def : v
  }
  if (h.get("l") === "1") restored.links = "all" // older links
  const t = h.get("t")?.split(",").filter((id) => metrics.has(id))
  if (t?.length) {
    for (const id of t) trendBoxes.get(id)!.checked = true
    restored.trends = sortedMetrics.filter((m) => t.includes(m.id)).map((m) => m.id)
    ;($("#trends") as HTMLDetailsElement).open = true
  }
  slider.value = String(restored.detail ?? DETAIL_DEFAULT)
  setDisplay(restored)
  optControls.forEach(writeOpt)
  renderLegend()

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
