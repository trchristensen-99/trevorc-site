import "./style.css"
import type { Topology } from "topojson-specification"
import { BASES, GL_PROJECTIONS, createGlMap, type BaseId } from "./gl"
import { DARK, LIGHT, PROJECTIONS, WorldMap, type Hit, type LayerId, type MapData, type MapTopology, type ProjectionId, type Renderer } from "./map"
import type { Details, Entity, Kind, Meta, Source, Station } from "./types"

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T

const KIND_LABEL: Record<Kind, string> = {
  control: "Governed",
  dependency: "Dependency",
  lease: "Leased territory",
  occupation: "Military occupation",
  contested: "Contested or undemarcated",
  uncontrolled: "No controlling state",
  international: "International administration",
}
const ENTITY_KIND_LABEL: Record<string, string> = {
  state: "UN member state",
  "de facto state": "De facto state",
  dependency: "Dependency",
  "armed group": "Armed group administration",
  international: "International body",
}
// "atlas" is the flat-color SVG map; the others are MapLibre base maps.
type Base = "atlas" | BaseId
const BASE_LABEL: Record<Base, string> = { atlas: "Atlas", ...Object.fromEntries(Object.entries(BASES).map(([k, v]) => [k, v.label])) } as Record<Base, string>
// `only` limits a layer to the atlas or to the textured base maps.
const LAYERS: { id: LayerId; label: string; on: boolean; only?: "atlas" | "gl" }[] = [
  { id: "labels", label: "Names", on: true },
  { id: "claims", label: "Claims", on: true },
  { id: "presence", label: "Insurgent presence", on: true },
  { id: "stations", label: "Antarctic stations", on: true },
  { id: "graticule", label: "Graticule", on: false, only: "atlas" },
  { id: "relief", label: "3D terrain", on: false, only: "gl" },
]

async function load(): Promise<{ data: MapData; details: Details; meta: Meta }> {
  const get = (f: string) => fetch(`./data/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${r.status} loading ${f}`)
    return r.json()
  })
  const [topo, entities, details, stations, meta] = await Promise.all([
    get("map.topo.json") as Promise<Topology>,
    get("entities.json") as Promise<Record<string, Entity>>,
    get("details.json") as Promise<Details>,
    get("bases.json") as Promise<Station[]>,
    get("meta.json") as Promise<Meta>,
  ])
  return { data: { topo: topo as MapData["topo"], entities, stations }, details, meta }
}

// ------------------------------------------------------------ URL state

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1))
  const b = h.get("b")
  const p = h.get("p")
  const layers = h.get("l")
  const z = h.get("z")?.split(",").map(Number)
  return {
    base: (b && b in BASES ? b : "atlas") as Base,
    projection: (p && p in PROJECTIONS ? p : "winkel") as ProjectionId,
    layers: layers === null ? null : new Set(layers.split(",").filter(Boolean)),
    // #z=lon,lat,zoom centres the map, so posts can link to a region.
    focus: z && z.length === 3 && z.every(Number.isFinite) ? z : null,
  }
}
function writeHash(base: Base, projection: ProjectionId, layers: Set<string>, view?: [number, number, number] | null) {
  const h = new URLSearchParams(base === "atlas" ? {} : { b: base })
  h.set("p", projection)
  h.set("l", [...layers].join(","))
  if (view && view[2] > 1.05) h.set("z", view.map((x, i) => x.toFixed(i < 2 ? 2 : 1)).join(","))
  history.replaceState(null, "", `#${h}`)
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

// ------------------------------------------------------------- rendering

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

function sourcesHTML(sources: Source[] | undefined) {
  if (!sources?.length) return ""
  const items = sources.map((s) =>
    `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.archived ? ` (<a href="${esc(s.archived)}" target="_blank" rel="noopener">archived</a>)` : ""}</li>`)
  return `<h3>Sources</h3><ul class="sources">${items.join("")}</ul>`
}

function main(data: MapData, details: Details, meta: Meta) {
  const app = $<HTMLElement>("#app")
  const svg = document.querySelector<SVGSVGElement>("#map")!
  const glBox = $<HTMLDivElement>("#gl")
  const status = $<HTMLParagraphElement>("#status")
  let map: Renderer
  // A renderer being replaced still exists until the new one is ready;
  // `generation` lets a slow switch notice it has been overtaken.
  let generation = 0

  // The full-detail file is several times larger, so it loads only once
  // someone zooms in (or picks a textured base map).
  let hiTopo: MapTopology | null = null
  let hiRequested = false
  const needDetail = () => {
    if (hiTopo) return map.setDetail(hiTopo)
    if (hiRequested) return
    hiRequested = true
    fetch("./data/map-hi.topo.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} loading map-hi.topo.json`))))
      .then((topo: MapTopology) => {
        hiTopo = topo
        map.setDetail(topo)
      })
      .catch((e) => {
        console.error(e)
        hiRequested = false
      })
  }
  const ent = (c: string): Entity | undefined => data.entities[c]
  const nameOf = (c: string) => (c === "none" ? "No controlling state" : ent(c)?.name ?? c)

  // Controls
  const state = readHash()
  let base: Base = state.base
  const baseSel = $<HTMLSelectElement>("#base")
  for (const b of Object.keys(BASE_LABEL) as Base[]) baseSel.add(new Option(BASE_LABEL[b], b))
  baseSel.value = base
  const projSel = $<HTMLSelectElement>("#projection")
  const fillProjections = () => {
    const allowed = base === "atlas" ? (Object.keys(PROJECTIONS) as ProjectionId[]) : GL_PROJECTIONS
    const current = projSel.value as ProjectionId
    projSel.replaceChildren(...allowed.map((id) => new Option(id === "mercator" && base !== "atlas" ? "Flat (Mercator)" : PROJECTIONS[id].label, id)))
    projSel.value = allowed.includes(current) ? current : allowed[0]
  }
  projSel.add(new Option("", state.projection))
  projSel.value = state.projection
  fillProjections()

  const active = new Set<string>(state.layers ?? LAYERS.filter((l) => l.on).map((l) => l.id))
  const layerBox = $<HTMLElement>("#layers")
  const layerRows = new Map<LayerId, HTMLLabelElement>()
  for (const l of LAYERS) {
    const label = document.createElement("label")
    const box = document.createElement("input")
    box.type = "checkbox"
    box.checked = active.has(l.id)
    box.addEventListener("change", () => {
      if (box.checked) active.add(l.id)
      else active.delete(l.id)
      map.setLayer(l.id, box.checked)
      saveView()
    })
    label.append(box, ` ${l.label}`)
    layerBox.append(label)
    layerRows.set(l.id, label)
  }
  const showLayerRows = () => {
    for (const l of LAYERS) layerRows.get(l.id)!.hidden = !!l.only && l.only !== (base === "atlas" ? "atlas" : "gl")
  }

  const saveView = () => writeHash(base, projSel.value as ProjectionId, active, map?.view())
  let pending = 0
  const saveSoon = () => {
    clearTimeout(pending)
    pending = window.setTimeout(saveView, 300)
  }

  $("#asof").textContent = `Control as of ${new Date(meta.asOf + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}`

  // Embedded in the project page vs. opened on its own.
  const embedded = window.parent !== window
  const out = $<HTMLAnchorElement>("#elsewhere")
  out.href = embedded ? location.href : "/projects/de-facto-world-map"
  out.textContent = embedded ? "Open full screen ↗" : "About this map"
  if (embedded) out.target = "_top"

  // Theme follows the site.
  const theme = () => (siteTheme() === "dark" ? DARK : LIGHT)
  const applyTheme = () => {
    const t = theme()
    document.documentElement.dataset.theme = t.dark ? "dark" : "light"
    map?.setTheme(t)
  }
  try {
    window.parent.document.addEventListener("themechange", applyTheme)
  } catch {
    /* not same-origin */
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme)

  // Hover: a small name tag that follows the pointer.
  const tip = $<HTMLDivElement>("#tooltip")
  const onHover = (hit: Hit | null, at: [number, number]) => {
    if (!hit || matchMedia("(hover: none)").matches) {
      tip.hidden = true
      return
    }
    const { c, k } = hit.area.properties
    tip.textContent = nameOf(c) + (k && k !== "control" && k !== "dependency" ? ` · ${KIND_LABEL[k].toLowerCase()}` : "")
    tip.hidden = false
    const r = app.getBoundingClientRect()
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 8, at[0] + 14)}px`
    tip.style.top = `${at[1] + 14}px`
  }

  // Click: full details.
  const info = $<HTMLElement>("#info")
  const show = (html: string) => {
    info.innerHTML = `<button class="close" aria-label="Close">×</button>${html}`
    info.hidden = false
    info.querySelector(".close")!.addEventListener("click", () => (info.hidden = true))
  }
  const onSelect = (hit: Hit | null) => {
    if (!hit) {
      info.hidden = true
      return
    }
    const { a, c, k } = hit.area.properties
    const e = ent(c)
    const d = details.areas[a]
    const rows: string[] = []
    const status = [e?.kind ? ENTITY_KIND_LABEL[e.kind] ?? e.kind : null, k && k !== "control" ? KIND_LABEL[k] : null].filter(Boolean)
    if (status.length) rows.push(`<dt>Status</dt><dd>${esc(status.join(" · "))}</dd>`)
    if (e?.parent) rows.push(`<dt>Part of</dt><dd>${esc(nameOf(e.parent))}</dd>`)
    if (e?.recognition) rows.push(`<dt>Recognition</dt><dd>${esc(e.recognition)}</dd>`)
    if (d && d.name !== e?.name) rows.push(`<dt>Area</dt><dd>${esc(d.name)}</dd>`)
    if (d?.asOf) rows.push(`<dt>As of</dt><dd>${esc(d.asOf)}${d.confidence ? ` · ${esc(d.confidence)} confidence` : ""}</dd>`)
    const note = d?.note ?? e?.note
    const claims = hit.claims.map((f) => details.claims[f.properties.a]).filter(Boolean)
    const presence = hit.presence.map((f) => details.presence[f.properties.a]).filter(Boolean)
    show(
      `<h2>${esc(nameOf(c))}</h2>` +
        (e?.formal && e.formal !== e.name ? `<p class="formal">${esc(e.formal)}</p>` : "") +
        (rows.length ? `<dl>${rows.join("")}</dl>` : "") +
        (note ? `<p>${esc(note)}</p>` : "") +
        (claims.length
          ? `<h3>Claimed by</h3><ul class="claims">${claims.map((cl) =>
              `<li><span class="swatch dashed" style="--c:${ent(cl.claimant)?.color}"></span><span><strong>${esc(nameOf(cl.claimant))}</strong>${cl.note ? `: ${esc(cl.note)}` : ""}</span></li>`).join("")}</ul>`
          : "") +
        (presence.length
          ? `<h3>Insurgent presence</h3><ul class="claims">${presence.map((p) =>
              `<li><span class="swatch hatch" style="--c:${ent(p.group)?.color}"></span><span><strong>${esc(nameOf(p.group))}</strong>${p.note ? `: ${esc(p.note)}` : ""}</span></li>`).join("")}</ul>`
          : "") +
        sourcesHTML(d?.sources ?? [{ title: "Natural Earth 1:10m Admin 0 countries (v5.1.1)", url: "https://www.naturalearthdata.com/" }]),
    )
  }
  const onStation = (s: Station) => {
    show(
      `<h2>${esc(s.name)}</h2><dl><dt>Operated by</dt><dd>${esc(nameOf(s.op))}</dd>` +
        (s.year ? `<dt>Established</dt><dd>${s.year}</dd>` : "") +
        `<dt>Location</dt><dd>${Math.abs(s.lat).toFixed(2)}° ${s.lat < 0 ? "S" : "N"}, ${Math.abs(s.lon).toFixed(2)}° ${s.lon < 0 ? "W" : "E"}</dd></dl>` +
        sourcesHTML([{ title: "COMNAP Antarctic Facilities", url: "https://github.com/PolarGeospatialCenter/comnap-antarctic-facilities" }]),
    )
  }

  const hint = () => {
    $("#hint").textContent = map.isGlobe
      ? base === "atlas" ? "Drag to rotate, scroll to zoom." : "Drag to rotate, scroll to zoom, right-drag to tilt."
      : "Drag to pan, scroll to zoom."
    $<HTMLButtonElement>("#export").textContent = base === "atlas" ? "Download SVG" : "Download PNG"
  }

  // Build the renderer for the current base map, carrying the view over.
  const mount = async (view: [number, number, number] | null) => {
    const gen = ++generation
    let next: Renderer
    if (base === "atlas") {
      svg.style.display = ""
      glBox.hidden = true
      next = new WorldMap(svg, data)
    } else {
      status.textContent = `Loading ${BASE_LABEL[base].toLowerCase()} map…`
      try {
        glBox.hidden = false
        next = await createGlMap(glBox, data, base, theme())
      } catch (err) {
        console.error(err)
        if (gen !== generation) return
        status.textContent = ""
        glBox.hidden = true
        alert(`The ${BASE_LABEL[base].toLowerCase()} map couldn't load (${(err as Error).message}). Showing the atlas instead.`)
        base = "atlas"
        baseSel.value = base
        fillProjections()
        return mount(view)
      }
      if (gen !== generation) return next.destroy()
      status.textContent = ""
      svg.style.display = "none"
    }
    map?.destroy()
    map = next
    map.onHover = onHover
    map.onSelect = onSelect
    map.onStation = onStation
    map.onNeedDetail = needDetail
    map.onViewChange = saveSoon
    for (const l of LAYERS) map.setLayer(l.id, active.has(l.id))
    map.setTheme(theme())
    map.setProjection(projSel.value as ProjectionId)
    if (hiTopo) map.setDetail(hiTopo)
    if (view) map.focus([view[0], view[1]], view[2])
    else if (base !== "atlas") map.focus([15, 20], 1)
    showLayerRows()
    hint()
    saveView()
  }

  baseSel.addEventListener("change", () => {
    const view = map.view()
    const fromAtlas = base === "atlas"
    base = baseSel.value as Base
    // Textured maps open on the globe unless the flat map was already Mercator.
    if (fromAtlas && base !== "atlas" && projSel.value !== "mercator") projSel.value = "globe"
    fillProjections()
    info.hidden = true
    tip.hidden = true
    void mount(view && view[2] > 1.05 ? view : null)
  })
  projSel.addEventListener("change", () => {
    map.setProjection(projSel.value as ProjectionId)
    hint()
    saveView()
  })

  // Export what's on screen.
  $("#export").addEventListener("click", async () => {
    const { blob, ext } = await map.exportImage(`De facto world map, ${meta.asOf}`)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `de-facto-world-map-${meta.asOf}-${base === "atlas" ? projSel.value : base}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })

  // Narrow maps start with the legend folded so it doesn't cover the map.
  if (matchMedia("(max-width: 1000px)").matches) $<HTMLDetailsElement>(".legend").open = false

  // Collapsible controls on small screens.
  $("#toggle-controls").addEventListener("click", () => document.body.classList.toggle("controls-open"))

  new ResizeObserver(() => map?.resize()).observe(app)
  return mount(state.focus ? [state.focus[0], state.focus[1], state.focus[2]] : null).then(() => applyTheme())
}

load()
  .then(async ({ data, details, meta }) => {
    $("#status").textContent = ""
    await main(data, details, meta)
  })
  .catch((err) => {
    $("#status").textContent = `Couldn't load the map data (${err.message}).`
  })
  .finally(() => document.body.classList.add("ready"))
