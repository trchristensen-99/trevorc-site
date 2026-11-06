import "./style.css"
import { Sandbox } from "./sandbox"
import { dateLabel } from "./time"
import { DETAIL_DEFAULT, DISPLAY_DEFAULTS, EFFORT_STOPS, KIND_COLORS, RISK_COLORS, ROUTE_COLORS, SERIES_COLORS, STATUS_COLORS, TreeView, effortColor, fmtValue, kindShape, seriesOf, type Display, type Filters } from "./tree"
import type { Details, Growth, Metric, Models, Node, Pool, PoolInput, Quantiles, ResourceUse, Source, Supply, Tree } from "./types"

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
let clips = 0
function metricChart(m: Metric, milestones: Node[], highlight?: string, title = true) {
  const clipId = `${m.id}-${++clips}`
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
    const band = tr?.band?.length
      ? `<path d="${path(tr.band.map(([x, lo]) => [x, lo] as [number, number]))}${path([...tr.band].reverse().map(([x, , hi]) => [x, hi] as [number, number])).replace(/^M/, "L")}Z" fill="${c}" opacity="${many ? 0.07 : 0.12}" clip-path="url(#clip-${clipId})"/>`
      : ""
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
    return band + scen + trend + dots
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
  const key = `${lines.some((ln) => ln.trend) ? ` Dashed: the trend carried forward${lines.some((ln) => ln.trend?.band) ? "; shaded: where it could be (80 percent) if it moves like its own past, a random walk around the trend from the latest point" : ""}.` : ""}${allScen.length ? ` ${many ? "Patterned" : "Dotted"}: forecasts.` : ""}${milestones.length ? " Lines across: milestones." : ""}`
  const rates = many
    ? `<ul class="series">${lines.map((ln, i) => `<li><span class="sw" style="background:${lineColor(i)}"></span><div><strong>${esc(ln.name)}</strong>: ${rateOf(ln.trend)}${ln.points.length ? `; ${esc(fmtValue(ln.points.at(-1)![1], m.unit))} in ${Math.round(ln.points.at(-1)![0])}` : ""}</div></li>`).join("")}</ul><p class="rate">${key.trim()}</p>`
    : `<p class="rate">${cap(rateOf(lines[0].trend))}${wright}.${key}</p>`
  const scenList = lines.map((ln, i) => ln.scenarios.length
    ? `${many ? `<p class="kind">${esc(ln.name)}</p>` : ""}<ul class="scenarios">${ln.scenarios.map((sc, j) => `<li>${many ? `<svg width="18" height="8"><line x1="0" x2="18" y1="4" y2="4" stroke="${scenColor(i, j)}" stroke-width="2" stroke-dasharray="${DASHES[j % DASHES.length]}"/></svg>` : `<span class="sw" style="background:${scenColor(i, j)}"></span>`}<div><strong>${esc(sc.name)}</strong> <span class="tag">${esc(SCENARIO_KIND[sc.kind] ?? sc.kind)}</span>${sc.note ? `<br><span class="note">${esc(sc.note)}</span>` : ""}${sc.sources?.length ? `<br><span class="note">${sc.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join("; ")}</span>` : ""}</div></li>`).join("")}</ul>`
    : "").join("")
  return `${title ? `<h3>${esc(m.name)}</h3>` : ""}
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.name)}"><clipPath id="clip-${clipId}"><rect x="${L}" y="${T}" width="${W - L - Rr}" height="${H - T - B}"/></clipPath>${grid.join("")}${xt.join("")}${marks}${body}</svg>
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
  const detailsReady: Promise<Record<string, Details>> = fetch(`./data/details.json${tree.meta.details ? `?v=${tree.meta.details}` : ""}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => (details = d))
  const detail = async (id: string): Promise<Details> => (details ?? (await detailsReady))[id] ?? ({} as Details)

  const byId = new Map(tree.nodes.map((n) => [n.id, n]))
  const metrics = new Map(tree.metrics.map((m) => [m.id, m]))
  const svg = document.querySelector<SVGSVGElement>("#tree")!
  const view = new TreeView(svg, tree)
  const now = tree.meta.now
  const fieldColor = new Map(tree.fields.map((f) => [f.id, f.color]))
  const fieldName = (id: string) => tree.fields.find((f) => f.id === id)?.name ?? id
  const trackName = (id: string) => `the ${(tree.lanes.flatMap((l) => l.tracks).find((t) => t.id === id)?.name ?? id).toLowerCase()} track`

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
    setDisplay({ ...DISPLAY_DEFAULTS, detail: display.detail, trends: display.trends, trendLayout: display.trendLayout, trendHeight: display.trendHeight, grow: display.grow, frontier: display.frontier })
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
    info.querySelectorAll<HTMLInputElement>("input[data-my]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const n = view.selection
        if (!n) return
        const v = Object.fromEntries([...info.querySelectorAll<HTMLInputElement>("input[data-my]")].map((x) => [x.dataset.my, +x.value]))
        editTo(n, [v.from, v.at, v.to], true)
      }))
    info.querySelector("[data-my-reset]")?.addEventListener("click", () => {
      const n = view.selection
      if (!n) return
      sandbox.clear(n.id)
      editTo(null, null, true)
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

  // Every source's forecast beside the judgment: a row each, on a scale of
  // log years from now, with the pool and the tree simulated from the
  // judgment. Quantiles are at 5, 10, 25, 50, 75, 90 and 95 percent.
  const KIND_NAME: Record<PoolInput["kind"], string> = {
    crowd: "forecasters", market: "market", survey: "expert survey", expert: "expert", projection: "official projection",
    target: "announced target", model: "model", trend: "trend", outside: "base rates",
  }
  const Q = (q: Quantiles, i: number) => q[i] ?? Infinity
  const forecastChart = (rows: { label: string; q: Quantiles; cls: string; tip?: string }[]) => {
    const W = 312, L = 4, R = 8, ROW = 24, T = 16
    const ends = rows.flatMap((r) => [Q(r.q, 1), Q(r.q, 5)]).filter(Number.isFinite)
    const end = Math.min(3000, Math.max(now + 12, ...ends) + 2)
    const xs = (y: number) => Math.log(1 + Math.max(0, Math.min(y, end) - now))
    const px = (y: number) => L + (xs(y) / xs(end)) * (W - L - R)
    const H = T + rows.length * ROW + 4
    const ticks = [2030, 2040, 2050, 2075, 2100, 2150, 2200, 2300, 2500, 3000].filter((y) => y < end - 2 && y > now + 1)
    const tick = ticks.map((y) => `<line x1="${px(y)}" x2="${px(y)}" y1="${T - 4}" y2="${H}" class="grid"/><text x="${px(y)}" y="${T - 6}" class="xlab">${y}</text>`).join("")
    const body = rows.map((r, i) => {
      const y = T + i * ROW + 15
      const lo = Q(r.q, 1), q25 = Q(r.q, 2), med = Q(r.q, 3), q75 = Q(r.q, 4), hi = Q(r.q, 5)
      const never = (v: number) => !Number.isFinite(v)
      const arrow = never(hi) ? `<path d="M${W - R - 5},${y - 3}L${W - R},${y}L${W - R - 5},${y + 3}" class="arrow"/>` : ""
      return `<g class="${r.cls}"><title>${esc(r.tip ?? r.label)}</title><text x="${L}" y="${y - 7}" class="rowlab">${esc(r.label.length > 58 ? r.label.slice(0, 56) + "…" : r.label)}</text>` +
        (never(lo) ? `<text x="${W - R}" y="${y + 3}" class="never">not in this source</text>` :
        `<line x1="${px(lo)}" x2="${px(hi)}" y1="${y}" y2="${y}" class="whisker"/>${arrow}` +
        (never(q25) ? "" : `<rect x="${px(q25)}" y="${y - 3.5}" width="${Math.max(2, px(q75) - px(q25))}" height="7" rx="2" class="box"/>`) +
        (never(med) ? "" : `<circle cx="${px(med)}" cy="${y}" r="3" class="med"/>`)) + "</g>"
    }).join("")
    return `<svg class="chart fc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Forecasts compared">${tick}${body}</svg>`
  }
  const when = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "never, in this source" : v > 3000 ? "after 3000" : yr(v))
  const middle = (q: Quantiles) => `${when(q[3])} <span class="note">(middle half ${q[2] == null ? "?" : yr(q[2])} to ${when(q[4])})</span>`
  const SHARE_WORD = (w: string) => models.forecasting.work[w] ?? w
  const forecastsHTML = (n: Node, d: Details) => {
    const p = d.pool, em = d.effortModel
    if (!p) return ""
    const inputs = [...p.inputs].sort((a, b) => b.weight - a.weight)
    const rows = [
      { label: "This tree's judgment", q: p.judged, cls: "row judged" },
      { label: `Pooled from ${inputs.length} source${inputs.length === 1 ? "" : "s"} below`, q: p.pooled, cls: "row pooled" },
      ...inputs.map((i) => ({ label: i.kind === "outside" ? i.label : `${i.label} (${KIND_NAME[i.kind]})`, q: i.q, cls: `row input k-${i.kind}`, tip: `${i.label}, weight ${i.weight}` })),
      { label: "The judgment, with what it needs varying", q: p.sim.judged, cls: "row sim" },
      ...(p.accel ? [{ label: "Base rates alone, without AI speedups (not pooled)", q: p.sim.base, cls: "row base" }] : []),
    ]
    const flag = p.flag
      ? `<p class="flagnote">The tree's best guess, ${yr(n.at)}, is ${p.flag} than the pool's middle half${p.outsideOnly ? ", but the only other source is the base rate, which can't see how far along it is" : ""}.</p>`
      : ""
    const shift = (p.sim.judged[3] ?? 0) - n.at
    const simNote = Math.abs(shift) >= 2
      ? ` With the uncertainty in what it needs (and in the AI milestones that would speed it up), the judgment's own logic puts it ${Math.round(Math.abs(shift))} years ${shift > 0 ? "later" : "earlier"}, around ${yr(p.sim.judged[3]!)}${p.sim.early ? "; its best guess comes before the likely dates of what it needs" : ""}.`
      : p.sim.early ? " Its best guess comes before the likely dates of what it needs." : ""
    const c = p.cond
    const condNote = c
      ? `<p>It moves with ${link(c.source)}: in the runs where that comes by ${yr(c.earlyBy)} (the earliest third), it comes around ${yr(c.early)}; where it comes after ${yr(c.lateAfter)} (the latest third), around ${yr(c.late)}.</p>`
      : ""
    const accel = p.accel
      ? `<p class="note">What's left, by kind of work: ${Object.entries(p.accel.shares).sort((a, b) => b[1] - a[1]).map(([w, v]) => `${SHARE_WORD(w)} ${Math.round(v * 100)}%`).join(", ")}. Sped up by ${p.accel.by.map((id) => { const m = models.forecasting.mechanisms.find((x) => x.id === id); return m ? `${esc(m.name)} (${link(m.from)})` : esc(id) }).join(", ")}.</p>`
      : ""
    const list = inputs.filter((i) => i.kind !== "outside").map((i) => {
      const meta = [KIND_NAME[i.kind], i.asof ? `as of ${Math.floor(i.asof)}` : "", i.match && i.match !== "same" ? `${i.match} question` : "", `weight ${i.weight}`].filter(Boolean).join(", ")
      const what = i.kind === "target" ? `target ${yr(i.year!)}, read as ${when(i.q[3])}` : `${when(i.q[3])}${i.q[2] != null && i.q[4] != null ? ` (middle half ${yr(i.q[2])} to ${when(i.q[4])})` : ""}`
      return `<li>${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.label)}</a>` : esc(i.label)}: ${what} <span class="note">${esc(meta)}</span>${i.note ? `<br><span class="note">${esc(i.note)}</span>` : ""}</li>`
    }).join("")
    const effort = em ? `<p class="note">From effort alone: ${yr(em.q50)} (80%: ${range(em.q10, em.q90)}), if it needs as much work as breakthroughs typically do, given that ${sig(em.spent)} person-years haven't been enough, at ${sig(em.people)} people${em.growth ? ` growing ${Math.round(em.growth * 100)}% a year` : ""}.</p>` : ""
    return `<h3>Forecasts compared</h3>
      <dl><dt>Pooled</dt><dd>${middle(p.pooled)}</dd></dl>${flag}
      ${forecastChart(rows)}
      <p class="note">Dots are medians, boxes the middle half, lines 10 to 90 percent; the scale is log years from now. The pool weights each source's quantiles by its kind, its horizon, its age and how well its question matches (What it takes explains).${simNote}</p>
      ${condNote}${accel}${list ? `<ul class="fclist">${list}</ul>` : ""}${effort}`
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
    if (editing && sandbox.editable(n.id)) {
      const o = sandbox.originalOf(n.id)!
      const mine = sandbox.edits.has(n.id)
      const field = (k: string, v: number) => `<input type="number" step="1" data-my="${k}" value="${Math.round(v)}" aria-label="${k}">`
      rows.push(`<dt>Yours</dt><dd class="my-dates">${field("from", n.from)} to ${field("to", n.to)}, best guess ${field("at", n.at)}<br><span class="note">The tree's: ${esc(dateLabel(o[0], o[2], o[1], now, true))}.${poolNote(n)}${mine ? ` <button type="button" class="link" data-my-reset>Back to the tree's</button>` : lastMoved.has(n.id) ? " Moved by what it depends on." : ""}</span></dd>`)
    }
    rows.push(`<dt>When</dt><dd>${esc(dateLabel(n.from, n.to, n.at, now, open))}${d.was != null && open ? `<br><span class="note">Best guess ${d.was} until November 2026${d.was > n.at ? ", moved earlier to allow for AI speeding up the work (What it takes)" : ", moved later as outside forecasts suggested"}.</span>` : ""}</dd>`)
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
      efforts + effort +
      (n.kind === "resource" ? supplyHTML(d) : "") +
      (d.forecast?.note ? `<h3>Forecast</h3><p>${esc(d.forecast.note)}</p>${sourcesHTML(d.forecast.sources, "Forecast sources")}` : "") +
      forecastsHTML(n, d) +
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
        const p = d[n.id]?.pool
        const flag = n.flag && p && !p.outsideOnly ? ` <span class="tag flag">outside forecasts: ${n.flag === "earlier" ? "later" : "sooner"}</span>` : ""
        return `<li>${link(n.id)} <span class="note">${esc(dateLabel(n.from, n.to, n.at, now, true))}${n.steps ? `; ${n.steps[0]} of ${n.steps[1]} steps done` : ""}</span>${flag}${efforts.length ? `<br><span class="note">${efforts.map((x) => esc(x.who)).slice(0, 5).join(" · ")}${efforts.length > 5 ? " …" : ""}</span>` : ""}</li>`
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

  // How many times faster each kind of work goes, by year (log scale).
  const PACE_COLORS: Record<string, string> = {
    "ai-research": "#3d6fb6", software: "#2f8fb0", design: "#7b5ea7", experiments: "#4f9a4a", trials: "#d0587e", building: "#c9772a", adoption: "#6b7280",
  }
  // The far future: power use in the growth model's runs, 10 to 90 percent
  // and the median, each regime's median, and the thresholds the tree uses.
  const REGIME_COLORS: Record<string, string> = { slow: "#5b8bd0", gradual: "#d08b3a", fast: "#c0504d" }
  const REGIME_WORD: Record<string, string> = { slow: "no explosion", gradual: "gradual explosion", fast: "fast explosion" }
  const growthChart = (g: Growth) => {
    const W = 330, H = 210, L = 40, B = 20, T = 8, R = 92
    const ys = g.path.years
    const lx = (y: number) => Math.log(1 + Math.max(0, y - g.t0))
    const px = (y: number) => L + (lx(y) / lx(ys.at(-1)!)) * (W - L - R)
    const v0 = 13, v1 = 27
    const py = (w: number) => T + (1 - (Math.log10(w) - v0) / (v1 - v0)) * (H - T - B)
    const grid = [13, 15, 17, 19, 21, 23, 25, 27].map((e) => `<line x1="${L}" x2="${W - R}" y1="${py(10 ** e)}" y2="${py(10 ** e)}" class="grid"/><text x="${L - 4}" y="${py(10 ** e)}" class="ylab">10^${e} W</text>`).join("")
    const xt = [2050, 2100, 2200, 3000].filter((y) => y <= ys.at(-1)!).map((y) => `<text x="${px(y)}" y="${H - 6}" class="xlab">${y}</text>`).join("")
    const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${px(ys[i]).toFixed(1)},${py(v).toFixed(1)}`).join("")
    const band = "M" + [...g.path.q.map((x, i) => [px(ys[i]), py(x[5])]), ...g.path.q.map((x, i) => [px(ys[i]), py(x[1])]).reverse()].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z"
    const refs: [number, string][] = [[1e16, "Type I (Sagan)"], [1.74e17, "sunlight on Earth"], [3.83e24, "1% of the Sun"], [3.83e26, "the Sun"]]
    const ref = refs.map(([w, t]) => `<line x1="${L}" x2="${W - R}" y1="${py(w)}" y2="${py(w)}" stroke="var(--muted)" stroke-dasharray="2 3" stroke-width="0.8"/><text x="${W - R + 4}" y="${py(w)}" font-size="8.5" dominant-baseline="central" fill="var(--muted)">${t}</text>`).join("")
    const lines = Object.entries(g.path.byRegime).map(([k, v]) => `<path d="${path(v)}" fill="none" stroke="${REGIME_COLORS[k] ?? "var(--muted)"}" stroke-width="1.3"/>`).join("")
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Power use in the growth model">${grid}${xt}${ref}<path d="${band}" fill="var(--ink)" opacity="0.12"/>${lines}<path d="${path(g.path.q.map((x) => x[3]))}" fill="none" stroke="var(--ink)" stroke-width="2"/></svg>`
  }
  const rangeText = (r: unknown, f: (v: number) => string) => {
    if (typeof r === "number") return f(r)
    const x = r as { q10: number; q50: number; q90: number }
    return `${f(x.q50)} <span class="note">(${f(x.q10)} to ${f(x.q90)})</span>`
  }
  const growthHTML = (g: Growth) => {
    const pct = (v: number) => `${+(v * 100).toFixed(1)}%`
    const yrs = (v: number) => (v < 1 ? `${+(v * 12).toFixed(1)} months` : v === 1 ? "1 year" : `${+v.toFixed(1)} years`)
    const tw = (v: number) => `${(v / 1e12).toLocaleString("en-US")} TW`
    const R = g.params.explosion.regimes
    const regimeRows = Object.entries(R).map(([k, r]) => `<tr><td><span class="sw" style="background:${REGIME_COLORS[k] ?? "var(--muted)"}"></span> ${esc(REGIME_WORD[k] ?? k)}</td><td>${Math.round(r.weight * 100)}%</td><td>${r.growth ? `grows ${rangeText(r.growth, pct)} a year` : `first doubling ${rangeText(r.first, yrs)}, halving every ${rangeText(r.halving, (v) => String(v))} doublings, down to ${rangeText(r.floor, yrs)}`}</td></tr>`).join("")
    const rows = Object.entries(g.nodes).map(([id, x]) => {
      const n = byId.get(id)
      if (!n) return ""
      const q = (v: number | null) => (v == null ? "after 5000" : yr(v))
      return `<tr><td>${link(id)}</td><td>${yr(sandbox.originalOf(id)?.[1] ?? n.at)}</td><td>${q(x.q[1])}<span class="note"><br>${q(x.q[0])} to ${q(x.q[2])}</span></td>${Object.keys(R).map((k) => `<td>${q(x.regimes[k]?.[1] ?? null)}</td>`).join("")}</tr>`
    }).join("")
    return `<h3>The far future: a growth model</h3>
      ${growthChart(g)}
      <p>Past superintelligence, nobody can say what will be invented, but physics says what any invention needs: energy. So the far end of the tree is dated by thresholds of power use, from a model of how fast it could grow (<code>prep/growth.yaml</code>). Humanity used ${tw(g.e0)} in ${g.t0}, growing ${rangeText(g.params.steady.growth, pct)} a year. In each of the ${models.forecasting.draws.toLocaleString("en-US")} runs, once robots build robots (that run's date for it), and ${rangeText(g.params.explosion.delay, yrs)} later, growth takes one of three courses:</p>
      <table class="t"><thead><tr><th>After robots build robots</th><th>Chance</th><th>Power use</th></tr></thead><tbody>${regimeRows}</tbody></table>
      <p>The doubling time itself changes: in an explosion, each doubling comes quicker than the last as the machines improve, down to a floor. On Earth's surface growth stops at ${rangeText(g.params.earth.cap, tw)}, where waste heat would warm the planet by about a degree; beyond that it continues only in space, from the first factory there that copies itself (some years after robots build robots and a lunar base: ${Object.entries(g.params.space.delay).map(([k, r]) => `${rangeText(r, yrs)} in a ${esc(REGIME_WORD[k] ?? k)}`).join(", ")}), up to the Sun's whole output. The chart shows power use (the band holds 10 to 90 percent of runs, the black line the median, the colored lines each course's median).</p>
      <p>Neither the optimists nor the skeptics are taken at their word. A superintelligence may see faster routes than anyone can now: the fast course lets doubling times fall to ${rangeText(R.fast?.floor ?? 0.1, yrs)}, near Hanson's projected next growth mode (doubling every few weeks) and Davidson and Hadshar's limit for self-copying robots. But arguments that it will be fast can be too optimistic over short spans: chips, permits, power plants and what can't be automated (Aghion, Jones and Jones; Acemoglu) can hold growth near today's for decades, and even a fast course needs years to ramp up. Forecasters and economists disagree here more than anywhere in the tree; Metaculus forecasters put the first year of 30 percent world growth at a median of 2059, while economists surveyed in 2026 expected 2.5 to 3.5 percent a year. The weights above put the model between them, at about ${Math.round((1 - (R.slow?.weight ?? 0)) * 100)}% for an explosion once robots build robots.</p>
      <table class="t est"><thead><tr><th>Threshold</th><th>Tree</th><th>Model</th>${Object.keys(R).map((k) => `<th>${esc(REGIME_WORD[k] ?? k)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
      <p class="note">Model: the median and 10 to 90 percent of runs; the last columns, the median in each course alone. The model is one source in each threshold's pool, standing in for base rates, which know nothing of scale; the tree's date stays a judgment. In Your own dates, moving robots building robots or a lunar base moves these thresholds as the model says, and you can pick one course under After robots build robots. ${g.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join("; ")}.</p>`
  }

  const paceChart = (p: Models["forecasting"]["pace"]) => {
    const W = 330, H = 190, L = 34, B = 20, T = 8, R = 96
    const y1 = Math.ceil(Math.log10(Math.max(...Object.values(p.kinds).flatMap((v) => v.map((x) => x[1]))) * 1.05))
    const px = (y: number) => L + ((y - p.years[0]) / (p.years.at(-1)! - p.years[0])) * (W - L - R)
    const py = (v: number) => T + (1 - Math.log10(v) / y1) * (H - T - B)
    const grid = Array.from({ length: y1 + 1 }, (_, i) => `<line x1="${L}" x2="${W - R}" y1="${py(10 ** i)}" y2="${py(10 ** i)}" class="grid"/><text x="${L - 4}" y="${py(10 ** i)}" class="ylab">${(10 ** i).toLocaleString("en-US")}×</text>`).join("")
    const xt = [2030, 2050, 2075, 2100].filter((y) => y >= p.years[0] && y <= p.years.at(-1)!).map((y) => `<text x="${px(y)}" y="${H - 6}" class="xlab">${y}</text>`).join("")
    const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${px(p.years[i]).toFixed(1)},${py(v).toFixed(1)}`).join("")
    const bandPath = "M" + [...p.all.map((x, i) => [px(p.years[i]), py(x[2])]), ...[...p.all].map((x, i) => [px(p.years[i]), py(x[0])]).reverse()].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z"
    const ends: { y: number; text: string; color: string }[] = []
    const lines = Object.entries(p.kinds).map(([w, v]) => {
      const c = PACE_COLORS[w] ?? "var(--muted)"
      ends.push({ y: py(v.at(-1)![1]), text: SHARE_WORD(w), color: c })
      return `<path d="${path(v.map((x) => x[1]))}" fill="none" stroke="${c}" stroke-width="1.4"/>`
    }).join("")
    ends.push({ y: py(p.all.at(-1)![1]), text: "the whole", color: "var(--ink)" })
    let last = -Infinity
    const tags = ends.sort((a, b) => a.y - b.y).map((e) => {
      const y = Math.max(e.y, last + 9)
      last = y
      return `<text x="${W - R + 4}" y="${y}" font-size="8.5" dominant-baseline="central" fill="${e.color}">${esc(e.text)}</text>`
    }).join("")
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="The pace of progress">${grid}${xt}<path d="${bandPath}" fill="var(--ink)" opacity="0.12"/>${lines}<path d="${path(p.all.map((x) => x[1]))}" fill="none" stroke="var(--ink)" stroke-width="2.2"/>${tags}</svg>`
  }

  // Your own dates: drag windows on the tree (or type them in a panel), and
  // everything that depends on them moves with them. Kept in the link and
  // in this browser.
  const sandbox = new Sandbox(tree)
  let editing = false
  let lastMoved = new Set<string>()
  const STORE = "tech-tree-mine"
  const bar = $<HTMLDivElement>("#sandbox-bar")
  const remember = () => {
    try { localStorage.setItem(STORE, sandbox.encode()) } catch { /* storage blocked */ }
  }
  const editTo = (n: Node | null, d: [number, number, number] | null, done: boolean) => {
    if (n && d) sandbox.set(n.id, d)
    lastMoved = sandbox.apply(editing)
    $("#sb-count").textContent = sandbox.edits.size ? `${sandbox.edits.size} moved by you, ${[...lastMoved].filter((id) => !sandbox.edits.has(id)).length} following` : ""
    view.refresh()
    if (done) {
      remember()
      saveSoon()
      if (view.selection && showing.startsWith("node:")) void view.onSelect(view.selection)
      else if (showing === "compare") showCompare()
    }
  }
  const setEditing = (on: boolean) => {
    editing = on
    bar.hidden = !on
    document.body.classList.toggle("editing", on)
    view.setEditing(on)
    editTo(null, null, true)
  }
  view.canEdit = (n) => editing && sandbox.editable(n.id)
  view.onEdit = (n, d, done) => editTo(n, d, done)
  $("#sandbox").addEventListener("click", () => setEditing(!editing))
  $("#sb-exit").addEventListener("click", () => setEditing(false))
  $("#sb-reset").addEventListener("click", () => {
    sandbox.clear()
    editTo(null, null, true)
  })
  $("#sb-copy").addEventListener("click", async () => {
    save()
    try {
      await navigator.clipboard.writeText(location.href)
      $("#sb-copy").textContent = "Copied"
    } catch {
      $("#sb-copy").textContent = "Copy the address bar"
    }
    setTimeout(() => ($("#sb-copy").textContent = "Copy link"), 1500)
  })

  // Your tree against the forecasts: where each best guess sits in the
  // pooled forecasts' middle half, the overall lean, and what each of your
  // edits drags with it. Only where the pool has more than base rates.
  const yrsAhead = (y: number) => Math.log(1 + Math.max(0, y - now))
  const sideOf = (at: number, p: number[]) => {
    const tol = Math.max(0.5, 0.1 * (at - now))
    return at < p[1] - tol ? "sooner" : at > p[3] + tol ? "later" : "inside"
  }
  const poolNote = (n: Node) => {
    const p = sandbox.poolOf(n.id)
    if (!p) return ""
    const side = sideOf(n.at, p)
    return ` Forecasts pooled: middle half ${yr(p[1])} to ${yr(p[3])}, median ${yr(p[2])}; yours is ${side === "inside" ? "inside it" : side === "sooner" ? "sooner" : "later"}.`
  }
  const lean = (pairs: { at: number; p: number[] }[]) => {
    const r = pairs.map(({ at, p }) => yrsAhead(at) - yrsAhead(p[2])).sort((a, b) => a - b)
    return r.length ? r[Math.floor(r.length / 2)] : 0
  }
  const leanText = (v: number) => {
    const f = Math.exp(Math.abs(v))
    return f < 1.05 ? "about the same time from now as the forecasts" : `${f.toFixed(1)} times ${v < 0 ? "sooner" : "later"} in time from now than the forecasts, at the median`
  }
  const compareHTML = () => {
    const rows = tree.nodes.flatMap((n) => {
      const p = sandbox.poolOf(n.id)
      return p ? [{ n, p, side: sideOf(n.at, p), r: yrsAhead(n.at) - yrsAhead(p[2]) }] : []
    })
    const theirs = rows.map(({ n, p }) => ({ at: sandbox.originalOf(n.id)![1], p }))
    const count = (side: string) => rows.filter((x) => x.side === side).length
    const list = (side: string) => {
      const xs = rows.filter((x) => x.side === side).sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 12)
      return xs.length ? `<table class="t est compare"><tr><th>${side === "sooner" ? "Sooner" : "Later"} than the forecasts</th><th>Yours</th><th>Pooled middle half</th></tr>${xs.map(({ n, p }) =>
        `<tr><td>${link(n.id)}${sandbox.edits.has(n.id) ? ' <span class="tag">moved by you</span>' : ""}</td><td>${yr(n.at)}</td><td>${yr(p[1])} to ${yr(p[3])}</td></tr>`).join("")}</table>` : ""
    }
    const effects = [...sandbox.edits.keys()].map((id) => {
      const e = sandbox.effectsOf(id)
      return `<li>${link(id)}: ${e.length ? e.slice(0, 6).map((x) => `${link(x.id)} ${x.by < 0 ? "−" : "+"}${Math.abs(x.by) < 9.5 ? Math.abs(x.by).toFixed(1) : Math.round(Math.abs(x.by))}`).join(", ") + (e.length > 6 ? `, and ${e.length - 6} more` : "") : "moves nothing else by more than half a year"}</li>`
    }).join("")
    return `<p class="kind">Your own dates</p><h2>Against the forecasts</h2>
      <p>Of ${rows.length} future technologies with outside forecasts, your best guess is inside the pooled forecasts' middle half for ${count("inside")}, sooner for ${count("sooner")} and later for ${count("later")}. Overall your dates are ${leanText(lean(rows.map(({ n, p }) => ({ at: n.at, p }))))}; the tree's own are ${leanText(lean(theirs))}.</p>
      <p class="note">Time from now is compared on a log scale, so 2 years against 4 counts as much as 20 against 40. ${sandbox.base === "pool" ? "You started from the pooled forecasts, so whatever your edits don’t reach sits at its pooled median." : "Pick “the forecasts” under Start from to begin at the pool instead of the tree's dates."}</p>
      ${sandbox.edits.size ? `<h3>What your edits move</h3><p class="note">Each on its own, in years (− sooner).</p><ul class="effects">${effects}</ul>` : ""}
      ${list("sooner")}${list("later")}`
  }
  const showCompare = () => show(compareHTML(), "compare")
  $("#sb-compare").addEventListener("click", () => { view.select(null); showCompare() })
  const regimeSel = $<HTMLSelectElement>("#sb-regime")
  regimeSel.addEventListener("change", () => {
    sandbox.setRegime(regimeSel.value)
    editTo(null, null, true)
  })
  const baseSel = $<HTMLSelectElement>("#sb-base")
  baseSel.addEventListener("change", () => {
    sandbox.setBase(baseSel.value === "pool" ? "pool" : "tree")
    editTo(null, null, true)
  })

  $("#models").addEventListener("click", async () => {
    view.select(null)
    const d = details ?? (await detailsReady)
    const m = models.effort, cost = models.cost, span = models.span, lag = models.lag
    const effortText = m
      ? `<p>The tree records what ${m.n} research efforts since ${m.from} took, in people and years. In a least-squares fit, the person-years behind a breakthrough grew about ${m.fold.toFixed(1)}-fold a century, and ${m.kinds.slice(1).map((k) => { const f = 10 ** k.shift; return `${k.name === "technique or device" ? "techniques and devices" : "infrastructure and institutions"} took ${f < 1.5 && f > 0.67 ? "about the same as discoveries" : `about ${f >= 1 ? Math.round(f) : (Math.round(f * 10) / 10)} times as much as discoveries`}` }).join(", while ")}. But the scatter dwarfs both: one standard deviation is a factor of ${Math.round(10 ** m.sd)}, and the fit explains only ${Math.round(m.r2 * 100)}% of the variation. Maxwell's equations took one person; the Manhattan Project took 130,000.${cost ? ` Costs (2025 dollars, ${cost.n} efforts since 1900) grew faster, about ${Math.round(cost.fold)}-fold a century, as each person came with more equipment.` : ""}${span ? ` Bigger efforts take longer, but not in proportion: years rose as person-years to the power ${span.exponent.toFixed(2)}, so a hundred times the effort took about ${(100 ** span.exponent).toFixed(1)} times as long. Mostly, more work means more people at once.` : ""}</p>
        <p class="note">This matches Bloom, Jones, Van Reenen and Webb (2020), who found that research effort per unit of progress keeps rising (Moore's law takes 18 times the researchers it did in 1971), though a list of famous successes can't say what failed. Whose effort counts is a judgment: the core team, not the trial volunteers or the users.</p>`
      : ""
    const lagRows = lag.eras.filter((e) => e.n).map((e) => `<tr><td>${e.from < 0 ? "Before 1500" : e.to >= now - 1 ? `Since ${e.from}` : `${e.from} to ${e.to}`}</td><td>${e.n}</td><td>${Math.round(e.q50!)}</td><td>${Math.round(e.q25!)} to ${Math.round(e.q75!)}</td></tr>`).join("")
    const fcm = models.forecasting
    const pooledOf = (n: Node) => d[n.id]?.pool
    const flagged = tree.nodes.filter((n) => n.flag && pooledOf(n)).map((n) => {
      const p = pooledOf(n)!
      const gap = Math.log(1 + Math.max(0, n.at - now)) - Math.log(1 + Math.max(0, Math.min(3000, p.pooled[3] ?? 3000) - now))
      return { n, p, gap }
    }).sort((a, b) => Number(a.p.outsideOnly) - Number(b.p.outsideOnly) || Math.abs(b.gap) - Math.abs(a.gap))
    const est = flagged.map(({ n, p }) => `<tr><td>${link(n.id)}${p.outsideOnly ? ' <span class="tag">base rates only</span>' : ""}</td><td>${yr(n.at)}</td><td>${when(p.pooled[3])}<span class="note"><br>${p.pooled[2] == null ? "" : yr(p.pooled[2])} to ${when(p.pooled[4])}</span></td></tr>`).join("")
    const bt = (rows: typeof fcm.backtest.raw) => rows.map((r) => `<tr><td>${r.from}</td><td>${r.n}</td><td>${r.early}</td><td>${r.inside}</td><td>${r.late}</td></tr>`).join("")
    const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
    const wt = Object.entries(fcm.weights).map(([k, v]) => `<tr><td>${esc(cap1(KIND_NAME[k as PoolInput["kind"]] ?? k))}</td><td>${v}</td></tr>`).join("")
    const mech = fcm.mechanisms.map((m) => `<tr><td>${esc(m.name)}<br><span class="note">from ${link(m.from)}</span></td><td>${Object.entries(m.speedup).map(([w, k]) => `${esc(SHARE_WORD(w))} ×${k}`).join(", ")}<br><span class="note">over ${m.ramp} year${m.ramp === 1 ? "" : "s"}${m.only ? `; only ${[...(m.only.tracks ?? []).map((t) => trackName(t)), ...(m.only.nodes ?? []).map((id) => byId.get(id)?.name ?? id)].map(esc).join(", ")}` : ""}</span></td></tr>`).join("")
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
      <h3>Forecasts and the pool</h3>
      <p>Each future technology's window is my judgment, and it stays the tree's date. Beside it, every other source becomes a range of years: forecasters, markets and surveys that asked about it, official projections, companies' own targets, the trend of its metric, and the tree simulated from base rates. The pool averages their quantiles, on a scale of log years from now, with these weights:</p>
      <table class="t"><thead><tr><th>Source</th><th>Weight</th></tr></thead><tbody>${wt}</tbody></table>
      <p class="note">Forecasters, markets, surveys and single experts count two thirds as much beyond 10 years and half beyond 25, since nobody has a track record that far out; half as much again if the figure is over two years old, or if their question is looser or stricter than the criterion. A trend counts in proportion to how well it fits (r²), and less when carried further than half its record. Announced targets slip: one set in year A for year T is read as a median of A + ${fcm.slip} × (T − A), with T itself at the 10th percentile, a judgment from the record (only 8.5 percent of 16,000 projects in Flyvbjerg's data met budget and schedule; air taxi and robotaxi launch dates have slipped two to three years and more). Simple fixed weights are deliberate: in studies of combining forecasts, they are hard to beat with fitted ones.</p>
      <p><strong>Trends</strong> are carried forward as a random walk around the trend from the latest point, so their range widens with the horizon, both from the year-to-year noise and from uncertainty in the trend itself (the method Farmer and Lafond tested on 53 technologies in 2016). A milestone whose data has fallen behind its own trend line, like fusion's triple product, doesn't use the trend at all.</p>
      <p><strong>The simulation</strong> runs the whole frontier ${fcm.draws.toLocaleString("en-US")} times. Each technology comes some time after the last thing it needs on its quickest route, so uncertainty flows downstream. From base rates, that time is drawn from the gaps seen since 1950, at least as long as it has already waited, and scaled by ${fcm.backtest.scale.toFixed(2)}, the factor that makes the base rate pass the test below. From the judgment, each window, with what it needs and the AI milestones at their likely dates, tells how much work it stands for; then everything varies together, which shows how a later AGI or a slow prerequisite would move it.</p>
      <p><strong>Testing the base rate.</strong> Pretend it's an earlier year: for everything whose prerequisites were in place but that wasn't done yet, predict from the gaps seen in the 50 years before, and see where it actually came (still undone counts as late once the prediction's upper quartile has passed). Raw, the base rate was much too slow:</p>
      <table class="t"><thead><tr><th>As of</th><th>n</th><th>Earlier</th><th>Middle half</th><th>Later</th></tr></thead><tbody>${bt(fcm.backtest.raw)}</tbody></table>
      <p>Scaled by ${fcm.backtest.scale.toFixed(2)}, early and late balance overall:</p>
      <table class="t"><thead><tr><th>As of</th><th>n</th><th>Earlier</th><th>Middle half</th><th>Later</th></tr></thead><tbody>${bt(fcm.backtest.scaled)}</tbody></table>
      <p class="note">The tree holds mostly what was achieved, not the many things tried and abandoned, which makes history look faster than it was; the scaling inherits that bias.</p>
      <h3>How AI would speed up the rest</h3>
      <p>Each technology's remaining work is split into kinds (AI research itself; software; design, theory and simulation on computers; lab, field and test-flight experiments; clinical trials, certification and regulatory review; building and scaling up; adoption, financing and changing institutions), by its track or on its own. Once an AI milestone arrives, and over its ramp, the kinds it helps go faster; by Amdahl's law the rest goes no faster, so a therapy that is mostly clinical trials gains little from faster design. Multipliers are my judgment, anchored on what has been measured so far, which is mostly coding; each technology's panel shows its split and how much it moves with the AI milestones.</p>
      <table class="t"><thead><tr><th>Mechanism</th><th>Speeds up</th></tr></thead><tbody>${mech}</tbody></table>
      <details class="forecasts"><summary>Why these multipliers</summary>${fcm.mechanisms.map((m) => `<p><strong>${esc(m.name)}.</strong> ${esc(m.note ?? "")}${m.sources?.length ? ` <span class="note">${m.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join("; ")}</span>` : ""}</p>`).join("")}</details>
      <h3>The pace of progress</h3>
      ${paceChart(fcm.pace)}
      <p>Across all ${fcm.draws.toLocaleString("en-US")} runs from the judgment, how many times faster each kind of work goes each year once the AI milestones arrive (medians), and the frontier as a whole (the band, 10 to 90 percent), for the average mix of remaining work: ${Object.entries(fcm.pace.mix).sort((a, b) => b[1] - a[1]).map(([w, v]) => `${esc(SHARE_WORD(w))} ${Math.round(v * 100)}%`).join(", ")}. Software and AI research can go hundreds of times faster, but the whole can't go faster than its slowest parts: with experiments, building, trials and adoption barely sped up, the frontier tops out at about ${fcm.pace.all.at(-1)![1].toFixed(1)} times its pace today. That ceiling, not the speed of thought, is what superintelligence would run into first, which is why the speedups that matter most for everything else are the ones for physical work: self-driving labs, human models in place of animals, robots building robots.</p>
      <p class="note">Only mechanisms that apply everywhere are counted here; those limited to some fields (cheap launch, abundant clean power, shorter aging trials, AI materials) speed those fields further. Each technology's own split of work, and so its own ceiling, is in its panel.</p>
      ${fcm.growth ? growthHTML(fcm.growth) : ""}
      <h3>Where the judgment and the pool disagree</h3>
      <p>Technologies whose best guess falls outside the pool's middle half, the biggest gaps first; those with outside forecasts come before those where only the base rate disagrees. Each is worth a second look, or a sentence in its forecast saying why it differs.</p>
      <table class="t est"><thead><tr><th></th><th>Tree</th><th>Pool</th></tr></thead><tbody>${est}</tbody></table>
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
  const OPT_KEYS: Record<Opt, string> = { grow: "g", frontier: "f", links: "lk", colorBy: "cb", labels: "lb", nodeSize: "ns", bars: "br", trackNames: "tn", eras: "er", trendLayout: "tl", trendHeight: "th" }
  view.onTrendHeight = (share) => {
    display.trendHeight = share
    saveSoon()
  }
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
    if (editing) {
      h.set("my", sandbox.encode())
    }
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
  // Your own dates from the link, or from this browser.
  const my = h.get("my")
  if (my != null) {
    sandbox.decode(my)
    setEditing(true)
  } else {
    try {
      const kept = localStorage.getItem(STORE)
      if (kept) sandbox.decode(kept)
    } catch { /* storage blocked */ }
  }
  baseSel.value = sandbox.base
  regimeSel.value = sandbox.regime
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
