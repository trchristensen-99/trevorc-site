// Emits /site-art/index.html: a credits page generated from the same
// manifest.json the renderer consumes, so the listed artists and the
// images actually shown can never drift out of sync.
//
// Renders through Quartz's renderPage so the page inherits the
// standard chrome (sticky top bar, sidebar menu, search, settings,
// dark-mode toggle) without bespoke markup.

import fs from "node:fs/promises"
import { Root } from "hast"
import {
  FullSlug,
  joinSegments,
  QUARTZ,
  pathToRoot,
  RelativeURL,
} from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "../../components/types"
import { write } from "./helpers"
import { pageResources, renderPage } from "../../components/renderPage"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { defaultContentPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { FullPageLayout } from "../../cfg"
import { ArticleTitle } from "../../components"
import { QuartzPluginData } from "../vfile"

interface ManifestArtist {
  name: string
  url: string
}
interface ManifestImage {
  src: string
  artist: string
}
interface ManifestBand {
  name: string
  fromHour: number
  toHour: number
  isDaytime: boolean
}
interface Manifest {
  basePath: string
  bands: ManifestBand[]
  themes: Record<string, any>
  specials: Record<string, any>
  artists: Record<string, ManifestArtist>
}

interface ThumbItem {
  src: string
  artistId: string
  caption: string
  // The directArt spec the thumbnail click writes into settings.
  // "src:<relativePath>" pins this exact image regardless of band/theme.
  directArt: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function titleCase(s: string): string {
  const cleaned = s.replace(/_/g, " ")
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

// For each theme, collapse duplicate images: an image used in multiple
// bands shows up once with a "band1+band2" caption. Multi-frame walks
// (one band → array of images) keep each frame as its own entry with a
// "(1/2)" suffix so the same band label can recur for the two distinct
// images.
function collectThumbItems(themeName: string, theme: any, manifest: Manifest): ThumbItem[] {
  const items: ThumbItem[] = []

  if (theme.type === "diurnal") {
    // band → array of frames in source order
    const bandFrames = new Map<string, ManifestImage[]>()
    for (const [band, entry] of Object.entries(theme.timeline || {})) {
      const arr = Array.isArray(entry) ? entry : [entry]
      bandFrames.set(band, arr as ManifestImage[])
    }

    // (artist|src) → list of (band, frameIdx, frameTotal)
    interface BandInfo {
      band: string
      frameIdx: number
      frameTotal: number
    }
    const srcToInfo = new Map<string, { artist: string; src: string; bands: BandInfo[] }>()
    for (const [band, frames] of bandFrames) {
      const total = frames.length
      frames.forEach((frame, i) => {
        const key = `${frame.artist}|${frame.src}`
        if (!srcToInfo.has(key)) {
          srcToInfo.set(key, { artist: frame.artist, src: frame.src, bands: [] })
        }
        srcToInfo.get(key)!.bands.push({ band, frameIdx: i, frameTotal: total })
      })
    }

    // Walk bands in manifest order so the page reflects the daily cycle.
    const bandOrder = manifest.bands.map((b) => b.name)
    const seen = new Set<string>()
    for (const band of bandOrder) {
      const frames = bandFrames.get(band) || []
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]
        const key = `${frame.artist}|${frame.src}`
        if (seen.has(key)) continue
        seen.add(key)
        const info = srcToInfo.get(key)!
        const captionParts = info.bands.map((b) =>
          b.frameTotal > 1 ? `${b.band} (${b.frameIdx + 1}/${b.frameTotal})` : b.band,
        )
        items.push({
          src: frame.src,
          artistId: frame.artist,
          caption: captionParts.join("+"),
          directArt: `src:${frame.src}`,
        })
      }
    }

    // Weather variants follow the timeline thumbnails for the theme.
    for (const [wname, entry] of Object.entries(theme.weather || {})) {
      const e = entry as ManifestImage
      items.push({
        src: e.src,
        artistId: e.artist,
        caption: `${wname} (weather)`,
        directArt: `src:${e.src}`,
      })
    }
  } else if (theme.type === "seasonal_static") {
    for (const [vname, entry] of Object.entries(theme.variants || {})) {
      const e = entry as ManifestImage
      items.push({
        src: e.src,
        artistId: e.artist,
        caption: vname.replace(/_/g, " "),
        directArt: `src:${e.src}`,
      })
    }
  }

  return items
}

function renderThumbnail(item: ThumbItem, manifest: Manifest, basePath: string): string {
  const src = `${basePath}/${item.src}`
  const artist = manifest.artists[item.artistId]
  const artistName = artist?.name ?? item.artistId
  const artistMarkup = artist?.url
    ? `<a class="artist" href="${escapeHtml(artist.url)}" target="_blank" rel="noopener">${escapeHtml(artistName)}</a>`
    : `<span class="artist">${escapeHtml(artistName)}</span>`
  return `<figure>
    <img src="${escapeHtml(src)}" alt="${escapeHtml(item.caption)}" loading="lazy" data-direct-art="${escapeHtml(item.directArt)}" />
    <figcaption>
      <span class="band">${escapeHtml(item.caption)}</span>
      ${artistMarkup}
    </figcaption>
  </figure>`
}

function renderThemeSection(
  displayName: string,
  items: ThumbItem[],
  manifest: Manifest,
  basePath: string,
): string {
  if (items.length === 0) return ""
  const thumbs = items.map((it) => renderThumbnail(it, manifest, basePath)).join("")
  return `<section class="art-theme"><h2>${escapeHtml(displayName)}</h2><div class="art-grid">${thumbs}</div></section>`
}

function buildThemeSections(manifest: Manifest, basePath: string): string {
  let html = ""
  for (const [themeName, theme] of Object.entries(manifest.themes)) {
    const items = collectThumbItems(themeName, theme, manifest)
    html += renderThemeSection(titleCase(themeName), items, manifest, basePath)
  }
  // Specials, if any, go in their own section so they stay visible
  // even when the active theme doesn't surface them.
  const specials: ThumbItem[] = []
  for (const [name, entry] of Object.entries(manifest.specials || {})) {
    const e = entry as ManifestImage
    specials.push({
      src: e.src,
      artistId: e.artist,
      caption: name,
      directArt: `src:${e.src}`,
    })
  }
  html += renderThemeSection("Specials", specials, manifest, basePath)
  return html
}

function buildArtistsList(manifest: Manifest): string {
  const artists = Object.entries(manifest.artists).sort((a, b) =>
    a[1].name.localeCompare(b[1].name),
  )
  if (artists.length === 0) return ""
  const items = artists
    .map(
      ([_, info]) =>
        `<li><a href="${escapeHtml(info.url)}" target="_blank" rel="noopener">${escapeHtml(info.name)}</a></li>`,
    )
    .join("")
  return `<section class="art-artists"><h2>Artists</h2><ul>${items}</ul></section>`
}

// Combined table: for every band, the clock window AND the default
// image used in each of the four Seasonal-picked themes.
function buildCombinedTable(): string {
  const combinedRow = (
    band: string,
    times: { eq: string; summer: string; winter: string },
    imgs: { spring: string; summerImg: string; fall: string; winterImg: string },
  ) =>
    `<tr><td><strong>${band}</strong></td>` +
    `<td>${times.eq}<br/><span class="art-times-small">summer ${times.summer}<br/>winter ${times.winter}</span></td>` +
    `<td>${imgs.spring}</td>` +
    `<td>${imgs.summerImg}</td>` +
    `<td>${imgs.fall}</td>` +
    `<td>${imgs.winterImg}</td></tr>`

  return `
    <table class="art-table art-combined">
      <thead>
        <tr>
          <th>Band</th>
          <th>Clock window (equinox / summer / winter solstice)</th>
          <th>Spring (forest)</th>
          <th>Summer (ocean)</th>
          <th>Fall (mountain)</th>
          <th>Winter (winter)</th>
        </tr>
      </thead>
      <tbody>
        ${combinedRow(
          "before_sunrise",
          { eq: "05:00 – 06:00", summer: "03:30 – 04:30", winter: "06:30 – 07:30" },
          {
            spring: "P1992 / forest / night <em>(reused from night)</em>",
            summerImg: "FGA / ocean / sunrise <em>(reused from sunrise)</em>",
            fall: "QQS / mountain / sunrise_1",
            winterImg: "FGA / winter / night <em>(reused from night)</em>",
          },
        )}
        ${combinedRow(
          "sunrise",
          { eq: "06:00 – 07:30", summer: "04:30 – 06:00", winter: "07:30 – 09:00" },
          {
            spring: "QQS / forest / morning",
            summerImg: "FGA / ocean / sunrise",
            fall: "QQS / mountain / sunrise_2",
            winterImg: "FGA / winter / sunrise_and_sunset",
          },
        )}
        ${combinedRow(
          "morning",
          { eq: "07:30 – 12:00", summer: "06:00 – 12:00", winter: "09:00 – 12:00" },
          {
            spring: "QQS / forest / morning <em>(reused)</em>",
            summerImg: "FGA / ocean / late_morning",
            fall: "QQS / mountain / early_morning → P1992 / mountain / late_morning",
            winterImg: "FGA / winter / morning",
          },
        )}
        ${combinedRow(
          "afternoon",
          { eq: "12:00 – 16:00", summer: "12:00 – 17:30", winter: "12:00 – 14:30" },
          {
            spring: "QQS / forest / afternoon",
            summerImg: "FGA / ocean / afternoon → P1992 / ocean / late_afternoon",
            fall: "P1992 / mountain / afternoon",
            winterImg: "P1992 / winter / afternoon",
          },
        )}
        ${combinedRow(
          "evening",
          { eq: "16:00 – 18:00", summer: "17:30 – 19:30", winter: "14:30 – 16:30" },
          {
            spring: "QQS / forest / evening",
            summerImg: "FGA / ocean / evening",
            fall: "P1992 / mountain / evening",
            winterImg: "FGA / winter / evening",
          },
        )}
        ${combinedRow(
          "sunset",
          { eq: "18:00 – 19:30", summer: "19:30 – 21:00", winter: "16:30 – 18:00" },
          {
            spring: "P1992 / forest / sunset",
            summerImg: "P1992 / ocean / sunset",
            fall: "P1992 / mountain / sunset",
            winterImg: "FGA / winter / sunrise_and_sunset <em>(reused)</em>",
          },
        )}
        ${combinedRow(
          "after_sunset",
          { eq: "19:30 – 20:30", summer: "21:00 – 22:00", winter: "18:00 – 19:00" },
          {
            spring: "P1992 / forest / sunset <em>(reused)</em>",
            summerImg: "FGA / ocean / after_sunset",
            fall: "P1992 / mountain / sunset <em>(reused)</em>",
            winterImg: "FGA / winter / sunrise_and_sunset <em>(reused)</em>",
          },
        )}
        ${combinedRow(
          "night",
          { eq: "20:30 – 05:00", summer: "22:00 – 03:30", winter: "19:00 – 06:30" },
          {
            spring: "P1992 / forest / night",
            summerImg: "FGA / ocean / night",
            fall: "P1992 / mountain / night",
            winterImg: "FGA / winter / night",
          },
        )}
      </tbody>
    </table>`
}

function buildTimeTablesHtml(): string {
  return `
    <section class="art-times">
      <h2>How the day cycle works</h2>
      <p>The renderer picks a band from the local clock with a cosine-interpolated solar shift of ±1.5 h applied to the morning- and evening-side edges. The 12:00 noon junction is anchored, so the morning / afternoon hand-off stays put across the year. Southern Hemisphere flips the phase (winter solstice in June).</p>

      <h3>Seasonal cycle — times and default images</h3>
      <p>This table shows, for every band, when it runs (clock window at the equinoxes, then the summer and winter solstice windows for Northern Hemisphere) and which image displays in the theme that "Seasonal" picks for that season.</p>
      ${buildCombinedTable()}
      <p class="art-note">Artist short names: <strong>FGA</strong> = Free Game Assets, <strong>P1992</strong> = PIXEL_1992, <strong>QQS</strong> = Quantum Quasar Studio. Arrows ("→") in a cell mean a multi-frame band that walks through several images in order.</p>

      <h3>Weather variants</h3>
      <p>Trigger when Weather = Always (whenever an eligible variant exists for the current band) or Sometimes (single per-page-load coin flip; ~17.5 % chance).</p>
      <ul>
        <li><strong>Ocean — rain</strong> covers morning, afternoon, and evening → FGA / ocean / rain_daytime</li>
        <li><strong>Winter — snow</strong> covers before_sunrise, sunrise, morning, afternoon, and evening → QQS / winter / snow</li>
      </ul>

      <h3>Medieval city — seasonal-static</h3>
      <p>No diurnal cycle. The current month chooses the variant:</p>
      <ul>
        <li>Dec / Jan / Feb → winter</li>
        <li>Jun / Jul / Aug → summer</li>
        <li>Mar–May / Sep–Nov → spring_and_fall</li>
      </ul>

      <h3>Specials</h3>
      <ul>
        <li><strong>Halloween (Oct 15 – Oct 31)</strong> overrides the night band on whichever theme is active → PIXEL_1992 / specials / halloween</li>
      </ul>

      <h3>Seasonal theme picks</h3>
      <p>When Art Theme = Seasonal, the date and hemisphere choose which theme renders.</p>
      <ul>
        <li><strong>Northern</strong>: Dec–Feb winter · Mar–May forest · Jun–Aug ocean · Sep–Nov mountain</li>
        <li><strong>Southern</strong>: Jun–Aug winter · Sep–Nov forest · Dec–Feb ocean · Mar–May mountain</li>
      </ul>
    </section>`
}

const bodyCss = `
.site-art-credits { margin-bottom: 3rem; }
.site-art-credits .art-theme { margin: 1.5rem 0 2.5rem; }
.site-art-credits .art-theme > h2 { margin-bottom: 0.75rem; }
.site-art-credits .art-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.site-art-credits .art-grid figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.site-art-credits .art-grid img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 4px;
  image-rendering: pixelated;
  background: var(--lightgray);
  cursor: pointer;
  transition: outline-color 0.15s ease;
  outline: 2px solid transparent;
}
.site-art-credits .art-grid img:hover {
  outline-color: var(--secondary);
}
.site-art-credits .art-grid figcaption {
  font-size: 0.85em;
  color: var(--darkgray);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.site-art-credits .art-grid figcaption .band {
  font-variant-numeric: tabular-nums;
}
.site-art-credits .art-grid figcaption .artist {
  font-size: 0.92em;
  opacity: 0.85;
}
.site-art-credits .art-artists ul {
  list-style: none;
  padding-left: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}
.site-art-credits .art-times { margin: 2rem 0; }
.site-art-credits .art-times h3 { margin-top: 1.5rem; }
.site-art-credits .art-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  margin: 0.5rem 0 1rem;
}
.site-art-credits .art-table th,
.site-art-credits .art-table td {
  text-align: left;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--lightgray);
  vertical-align: top;
}
.site-art-credits .art-table th { font-weight: 600; }
.site-art-credits .art-note { font-size: 0.85em; color: var(--darkgray); margin-top: 0; }
.site-art-credits .art-times-small { font-size: 0.85em; color: var(--darkgray); }
.site-art-credits .art-combined td { font-size: 0.88em; }
`

// Module-level so the rendered HTML can flow from emit() into the
// SiteArtBody component without going through props.
let bodyHtml = ""

const SiteArtBody: QuartzComponent = (_props: QuartzComponentProps) => (
  <article class="site-art-credits" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
)
SiteArtBody.css = bodyCss

export const SiteArtPage: QuartzEmitterPlugin = () => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultContentPageLayout,
    beforeBody: [ArticleTitle()],
    pageBody: SiteArtBody,
    afterBody: [],
    left: [],
    right: [],
  }

  const { head: Head, header, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "SiteArtPage",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...opts.beforeBody,
        SiteArtBody,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      const cfg = ctx.cfg.configuration
      const manifestPath = joinSegments(QUARTZ, "static", "site-art", "manifest.json")
      let manifest: Manifest
      try {
        const text = await fs.readFile(manifestPath, "utf-8")
        manifest = JSON.parse(text)
      } catch (e) {
        console.warn("SiteArtPage: failed to load manifest", e)
        return
      }

      const slug = "site-art/index" as FullSlug
      const root = pathToRoot(slug)
      const basePath = `${root}/static/site-art` as RelativeURL
      const aboutLink = `${root}/about` as RelativeURL
      const backgroundLink = `${root}/background/` as RelativeURL

      bodyHtml =
        `<p>The background scenes on this site are pixel-art landscapes licensed for commercial use from the artists listed below. Thumbnails are grouped by the theme/cycle they belong to; click any thumbnail to pin it as the active background.</p>` +
        `<p>For a full-bleed view with no chrome, see the <a href="${escapeHtml(
          backgroundLink,
        )}">background showcase</a>.</p>` +
        buildThemeSections(manifest, basePath) +
        buildArtistsList(manifest) +
        buildTimeTablesHtml() +
        `<p><a href="${escapeHtml(aboutLink)}">← Back to About</a></p>`

      const externalResources = pageResources(root, resources)
      const allFiles = content.map((c) => c[1].data)
      const fileData: QuartzPluginData = {
        slug,
        filePath: "site-art" as any,
        relativePath: "site-art" as any,
        frontmatter: {
          title: "Site art credits",
          tags: [],
        },
      } as QuartzPluginData

      const tree: Root = { type: "root", children: [] }
      const componentData: QuartzComponentProps = {
        ctx,
        fileData,
        externalResources,
        cfg,
        children: [],
        tree,
        allFiles,
      }

      const html = renderPage(cfg, slug, componentData, opts, externalResources)
      yield write({
        ctx,
        slug,
        ext: ".html",
        content: html,
      })
    },
    async *partialEmit() {},
  }
}
