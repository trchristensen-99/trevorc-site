import "./style.css"
import type { Topology } from "topojson-specification"
import {
  BASES,
  COUNTRY_STYLES,
  GL_PROJECTIONS,
  GlMap,
  MAP_FEATURES,
  createGlMap,
  type BaseId,
  type CountryStyle,
  type GlOptions,
  type MapFeature,
} from "./gl"
import { DARK, LIGHT, PROJECTIONS, WorldMap, type Hit, type LayerId, type MapData, type MapTopology, type ProjectionId, type Renderer } from "./map"
import type { BaseAbroad, Details, Entity, Kind, Meta, Source, Station } from "./types"

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
// `atlas` marks layers only the flat-color atlas projections draw.
const LAYERS: { id: LayerId; label: string; on: boolean; atlas?: boolean }[] = [
  { id: "labels", label: "Country names", on: true },
  { id: "regions", label: "Region names", on: true },
  { id: "shading", label: "Occupied and contested shading", on: true },
  { id: "presence", label: "Insurgent presence", on: true },
  { id: "claims", label: "Claims", on: true },
  { id: "bases", label: "Military bases abroad", on: false },
  { id: "stations", label: "Antarctic stations", on: true },
  { id: "graticule", label: "Graticule", on: false, atlas: true },
]
const DEFAULT_FEATURES: MapFeature[] = ["cities"]
// The country style each base starts with: imagery reads best with
// borders alone.
const BASE_COUNTRIES: Record<BaseId, CountryStyle> = { plain: "fill", satellite: "lines", streets: "fill" }

const isGl = (p: ProjectionId) => GL_PROJECTIONS.includes(p)

async function load(): Promise<{ data: MapData; meta: Meta }> {
  const get = (f: string) => fetch(`./data/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${r.status} loading ${f}`)
    return r.json()
  })
  const [topo, entities, details, stations, abroad, meta] = await Promise.all([
    get("map.topo.json") as Promise<Topology>,
    get("entities.json") as Promise<Record<string, Entity>>,
    get("details.json") as Promise<Details>,
    get("bases.json") as Promise<Station[]>,
    get("abroad.json").catch(() => []) as Promise<BaseAbroad[]>,
    get("meta.json") as Promise<Meta>,
  ])
  return { data: { topo: topo as MapData["topo"], entities, details, stations, abroad }, meta }
}

// ------------------------------------------------------------ URL state

interface State {
  projection: ProjectionId
  gl: GlOptions
  layers: Set<string>
  focus: [number, number, number] | null
}

function readHash(): State {
  const h = new URLSearchParams(location.hash.slice(1))
  const p = h.get("p")
  let b = h.get("b")
  const z = h.get("z")?.split(",").map(Number)
  // Links from before the layer options had a separate terrain base.
  const oldTerrain = b === "terrain"
  if (oldTerrain) b = "plain"
  const base = (b && b in BASES ? b : "plain") as BaseId
  const c = h.get("c")
  const layers = h.get("l")
  const features = h.get("f")
  return {
    projection: (p && p in PROJECTIONS ? p : "winkel") as ProjectionId,
    gl: {
      base,
      terrain: oldTerrain || h.get("t") === "1",
      relief3d: h.get("d") === "1",
      countries: (c && c in COUNTRY_STYLES ? c : BASE_COUNTRIES[base]) as CountryStyle,
      features: new Set((features === null ? DEFAULT_FEATURES : features.split(",")).filter((f) => f in MAP_FEATURES) as MapFeature[]),
    },
    layers: new Set(layers === null ? LAYERS.filter((l) => l.on).map((l) => l.id) : layers.split(",").filter(Boolean)),
    // #z=lon,lat,zoom centres the map, so posts can link to a region.
    focus: z && z.length === 3 && z.every(Number.isFinite) ? (z as [number, number, number]) : null,
  }
}
function writeHash(s: State, view?: [number, number, number] | null) {
  const h = new URLSearchParams({ p: s.projection })
  if (isGl(s.projection)) {
    if (s.gl.base !== "plain") h.set("b", s.gl.base)
    if (s.gl.countries !== BASE_COUNTRIES[s.gl.base]) h.set("c", s.gl.countries)
    if (s.gl.terrain) h.set("t", "1")
    if (s.gl.relief3d) h.set("d", "1")
    h.set("f", [...s.gl.features].join(","))
  }
  h.set("l", [...s.layers].join(","))
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

function checkbox(box: HTMLElement, label: string, checked: boolean, onChange: (on: boolean) => void) {
  const row = document.createElement("label")
  const input = document.createElement("input")
  input.type = "checkbox"
  input.checked = checked
  input.addEventListener("change", () => onChange(input.checked))
  row.append(input, ` ${label}`)
  box.append(row)
  return row
}

function main(data: MapData, meta: Meta) {
  const { details } = data
  const app = $<HTMLElement>("#app")
  const svg = document.querySelector<SVGSVGElement>("#map")!
  const glBox = $<HTMLDivElement>("#gl")
  const status = $<HTMLParagraphElement>("#status")
  let map: Renderer
  // A renderer being replaced still exists until the new one is ready;
  // `generation` lets a slow switch notice it has been overtaken.
  let generation = 0

  // The full-detail file is several times larger, so it loads only once
  // someone zooms in (or opens the globe or Mercator view).
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

  // ---------------------------------------------------------- controls
  const state = readHash()
  const saveView = () => writeHash(state, map?.view())
  let pending = 0
  const saveSoon = () => {
    clearTimeout(pending)
    pending = window.setTimeout(saveView, 300)
  }
  const pushGl = () => {
    if (map instanceof GlMap) map.setOptions(state.gl)
    saveView()
  }

  const projSel = $<HTMLSelectElement>("#projection")
  for (const id of [...GL_PROJECTIONS, ...(Object.keys(PROJECTIONS) as ProjectionId[]).filter((p) => !isGl(p))])
    projSel.add(new Option(PROJECTIONS[id].label, id))
  projSel.value = state.projection

  const baseSel = $<HTMLSelectElement>("#base")
  for (const [id, label] of Object.entries(BASES)) baseSel.add(new Option(label, id))
  baseSel.value = state.gl.base
  const countriesSel = $<HTMLSelectElement>("#countries")
  for (const [id, label] of Object.entries(COUNTRY_STYLES)) countriesSel.add(new Option(label, id))
  countriesSel.value = state.gl.countries
  baseSel.addEventListener("change", () => {
    const prev = state.gl.base
    state.gl.base = baseSel.value as BaseId
    // Follow the new base's usual country style unless it was changed.
    if (state.gl.countries === BASE_COUNTRIES[prev]) {
      state.gl.countries = BASE_COUNTRIES[state.gl.base]
      countriesSel.value = state.gl.countries
    }
    pushGl()
  })
  countriesSel.addEventListener("change", () => {
    state.gl.countries = countriesSel.value as CountryStyle
    pushGl()
  })
  const glChecks = $<HTMLElement>("#gl-checks")
  checkbox(glChecks, "Terrain", state.gl.terrain, (on) => {
    state.gl.terrain = on
    pushGl()
  })
  checkbox(glChecks, "3D", state.gl.relief3d, (on) => {
    state.gl.relief3d = on
    pushGl()
  })

  const layerBox = $<HTMLElement>("#layers")
  const layerRows = new Map<LayerId, HTMLLabelElement>()
  for (const l of LAYERS)
    layerRows.set(l.id, checkbox(layerBox, l.label, state.layers.has(l.id), (on) => {
      if (on) state.layers.add(l.id)
      else state.layers.delete(l.id)
      map.setLayer(l.id, on)
      saveView()
    }))
  const featureBox = $<HTMLElement>("#features")
  for (const [id, label] of Object.entries(MAP_FEATURES) as [MapFeature, string][])
    checkbox(featureBox, label, state.gl.features.has(id), (on) => {
      if (on) state.gl.features.add(id)
      else state.gl.features.delete(id)
      pushGl()
    })

  // The globe and Mercator views take base maps and map features; the
  // other projections are the flat-color atlas.
  const showControls = () => {
    const gl = map instanceof GlMap
    $("#gl-options").hidden = !gl
    $("#features-box").hidden = !gl
    for (const l of LAYERS) layerRows.get(l.id)!.hidden = (!!l.atlas && gl) || (l.id === "bases" && !data.abroad.length)
    $("#hint").textContent = gl
      ? "Drag to rotate, scroll to zoom, right-drag to tilt."
      : `Drag to pan, scroll to zoom.${isGl(state.projection) ? "" : " Satellite, terrain and map features are on the Globe and Mercator projections."}`
    $<HTMLButtonElement>("#export").textContent = gl ? "Download PNG" : "Download SVG"
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

  // ------------------------------------------------------------- hover
  const tip = $<HTMLDivElement>("#tooltip")
  const onHover = (hit: Hit | null, at: [number, number]) => {
    if (!hit || matchMedia("(hover: none)").matches) {
      tip.hidden = true
      return
    }
    const { c, k } = hit.area.properties
    const presence = [...new Set(hit.presence.map((f) => nameOf(f.properties.c)))]
    tip.textContent =
      nameOf(c) + (k && k !== "control" && k !== "dependency" ? ` · ${KIND_LABEL[k].toLowerCase()}` : "") +
      (presence.length ? ` · ${presence.join(", ")} active` : "")
    tip.hidden = false
    const r = app.getBoundingClientRect()
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 8, at[0] + 14)}px`
    tip.style.top = `${at[1] + 14}px`
  }

  // ------------------------------------------------------------- click
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
  const where = (lon: number, lat: number) =>
    `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? "W" : "E"}`
  const onStation = (s: Station) => {
    show(
      `<h2>${esc(s.name)}</h2><dl><dt>Operated by</dt><dd>${esc(nameOf(s.op))}</dd>` +
        (s.year ? `<dt>Established</dt><dd>${s.year}</dd>` : "") +
        `<dt>Location</dt><dd>${where(s.lon, s.lat)}</dd></dl>` +
        sourcesHTML([{ title: "COMNAP Antarctic Facilities", url: "https://github.com/PolarGeospatialCenter/comnap-antarctic-facilities" }]),
    )
  }
  const onBase = (b: BaseAbroad) => {
    show(
      `<h2>${esc(b.name)}</h2><dl><dt>Operated by</dt><dd>${esc(nameOf(b.op))}</dd>` +
        `<dt>Host</dt><dd>${esc(nameOf(b.host))}</dd>` +
        (b.type ? `<dt>Type</dt><dd>${esc(b.type[0].toUpperCase() + b.type.slice(1))}</dd>` : "") +
        (b.status && b.status !== "active" ? `<dt>Status</dt><dd>${esc(b.status)}</dd>` : "") +
        `<dt>Location</dt><dd>${where(b.lon, b.lat)}</dd></dl>` +
        (b.note ? `<p>${esc(b.note)}</p>` : "") +
        sourcesHTML(b.source ? [{ title: b.source.includes("wikipedia.org") ? "Wikipedia" : b.source, url: b.source }] : []),
    )
  }

  // ------------------------------------------------------------ mount
  // Build the renderer for the current projection, carrying the view over.
  const mount = async (view: [number, number, number] | null) => {
    const gen = ++generation
    let next: Renderer
    if (!isGl(state.projection)) {
      svg.style.display = ""
      glBox.hidden = true
      next = new WorldMap(svg, data)
    } else {
      status.textContent = "Loading the map…"
      try {
        glBox.hidden = false
        next = await createGlMap(glBox, data, state.gl, theme())
      } catch (err) {
        // Without WebGL, the atlas draws its own globe and Mercator.
        console.error(err)
        glBox.hidden = true
        svg.style.display = ""
        next = new WorldMap(svg, data)
      }
      if (gen !== generation) return next.destroy()
      status.textContent = ""
      if (next instanceof GlMap) svg.style.display = "none"
    }
    map?.destroy()
    map = next
    map.onHover = onHover
    map.onSelect = onSelect
    map.onStation = onStation
    map.onBase = onBase
    map.onNeedDetail = needDetail
    map.onViewChange = saveSoon
    for (const l of LAYERS) map.setLayer(l.id, state.layers.has(l.id))
    map.setTheme(theme())
    map.setProjection(state.projection)
    if (hiTopo) map.setDetail(hiTopo)
    if (view) map.focus([view[0], view[1]], view[2])
    else if (map instanceof GlMap) map.focus([15, 20], 1)
    showControls()
    saveView()
  }

  projSel.addEventListener("change", () => {
    const view = map.view()
    const next = projSel.value as ProjectionId
    const sameRenderer = isGl(next) === map instanceof GlMap
    state.projection = next
    if (sameRenderer) {
      map.setProjection(next)
      showControls()
      saveView()
      return
    }
    info.hidden = true
    tip.hidden = true
    void mount(view && view[2] > 1.05 ? view : null)
  })

  // Export what's on screen.
  $("#export").addEventListener("click", async () => {
    const { blob, ext } = await map.exportImage(`De facto world map, ${meta.asOf}`)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `de-facto-world-map-${meta.asOf}-${state.projection}${map instanceof GlMap ? `-${state.gl.base}` : ""}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })

  // Narrow maps start with the legend folded so it doesn't cover the map.
  if (matchMedia("(max-width: 1000px)").matches) $<HTMLDetailsElement>(".legend").open = false

  // Collapsible controls on small screens.
  $("#toggle-controls").addEventListener("click", () => document.body.classList.toggle("controls-open"))

  new ResizeObserver(() => map?.resize()).observe(app)
  return mount(state.focus).then(() => applyTheme())
}

load()
  .then(async ({ data, meta }) => {
    $("#status").textContent = ""
    await main(data, meta)
  })
  .catch((err) => {
    $("#status").textContent = `Couldn't load the map data (${err.message}).`
  })
  .finally(() => document.body.classList.add("ready"))
