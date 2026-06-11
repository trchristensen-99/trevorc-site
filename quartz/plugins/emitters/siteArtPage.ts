// Emits /site-art/index.html: a credits page generated from the same
// manifest.json the renderer consumes, so the listed artists and the
// images actually shown can never drift out of sync.

import fs from "node:fs/promises"
import { FullSlug, joinSegments, QUARTZ } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"

interface ManifestArtist {
  name: string
  url: string
}
interface ManifestImage {
  src: string
  artist: string
  band?: string
  variant?: string
  weather?: string
  special?: string
}
interface Manifest {
  basePath: string
  themes: Record<string, any>
  specials: Record<string, any>
  artists: Record<string, ManifestArtist>
}

function collectImages(manifest: Manifest): Map<string, ManifestImage[]> {
  // artistId → array of attributable images
  const out = new Map<string, ManifestImage[]>()
  const push = (artist: string, img: ManifestImage) => {
    if (!out.has(artist)) out.set(artist, [])
    out.get(artist)!.push(img)
  }

  for (const [themeName, theme] of Object.entries(manifest.themes)) {
    if ((theme as any).type === "diurnal") {
      const tl = (theme as any).timeline || {}
      for (const [band, entry] of Object.entries(tl)) {
        const entries = Array.isArray(entry) ? entry : [entry]
        for (const e of entries as ManifestImage[]) {
          push(e.artist, { src: e.src, artist: e.artist, band: `${themeName} / ${band}` })
        }
      }
      const weather = (theme as any).weather || {}
      for (const [wname, entry] of Object.entries(weather)) {
        const e = entry as ManifestImage
        push(e.artist, { src: e.src, artist: e.artist, weather: `${themeName} / ${wname}` })
      }
    } else if ((theme as any).type === "seasonal_static") {
      const variants = (theme as any).variants || {}
      for (const [vname, entry] of Object.entries(variants)) {
        const e = entry as ManifestImage
        push(e.artist, { src: e.src, artist: e.artist, variant: `${themeName} / ${vname}` })
      }
    }
  }
  for (const [name, entry] of Object.entries(manifest.specials || {})) {
    const e = entry as ManifestImage
    push(e.artist, { src: e.src, artist: e.artist, special: name })
  }
  return out
}

function describe(img: ManifestImage): string {
  if (img.band) return img.band.replace(/_/g, " ")
  if (img.variant) return img.variant.replace(/_/g, " ")
  if (img.weather) return `${img.weather.replace(/_/g, " ")} weather`
  if (img.special) return `${img.special} special`
  return ""
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export const SiteArtPage: QuartzEmitterPlugin = () => ({
  name: "SiteArtPage",
  async *emit(ctx) {
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

    const byArtist = collectImages(manifest)
    const artistOrder = Array.from(byArtist.keys()).sort()

    const sectionHtml = artistOrder
      .map((id) => {
        const info = manifest.artists[id]
        if (!info) return ""
        const imgs = byArtist.get(id) || []
        const thumbs = imgs
          .map((img) => {
            const src = `../static/site-art/${img.src}`
            const caption = describe(img)
            return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(
              caption,
            )}" loading="lazy" /><figcaption>${escapeHtml(caption)}</figcaption></figure>`
          })
          .join("")
        return `<section class="art-artist"><h2><a href="${escapeHtml(
          info.url,
        )}" target="_blank" rel="noopener">${escapeHtml(
          info.name,
        )}</a></h2><div class="art-grid">${thumbs}</div></section>`
      })
      .join("")

    // Combined table: for every band, show the seasonal time window
    // AND the default image you'd see in each of the four
    // Seasonal-picked themes (Spring → forest, Summer → ocean,
    // Fall → mountain, Winter → winter).
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

    const combinedTable = `
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
            "early_morning",
            { eq: "05:00 – 06:00", summer: "03:30 – 04:30", winter: "06:30 – 07:30" },
            {
              spring: "P1992 / forest / night",
              summerImg: "FGA / ocean / night <em>(reused from night)</em>",
              fall: "QQS / mountain / sunrise_1",
              winterImg: "FGA / winter / night <em>(reused from night)</em>",
            },
          )}
          ${combinedRow(
            "sunrise",
            { eq: "06:00 – 07:00", summer: "04:30 – 05:30", winter: "07:30 – 08:30" },
            {
              spring: "QQS / forest / morning",
              summerImg: "FGA / ocean / sunrise",
              fall: "QQS / mountain / sunrise_2",
              winterImg: "FGA / winter / sunrise_and_sunset",
            },
          )}
          ${combinedRow(
            "late_morning",
            { eq: "07:00 – 11:30", summer: "05:30 – 11:30", winter: "08:30 – 11:30" },
            {
              spring: "QQS / forest / morning <em>(reused)</em>",
              summerImg: "FGA / ocean / late_morning",
              fall: "QQS / mountain / early_morning → P1992 / mountain / late_morning",
              winterImg: "FGA / winter / morning",
            },
          )}
          ${combinedRow(
            "afternoon",
            { eq: "11:30 – 16:00", summer: "11:30 – 17:30", winter: "11:30 – 14:30" },
            {
              spring: "QQS / forest / afternoon",
              summerImg: "FGA / ocean / afternoon → P1992 / ocean / late_afternoon",
              fall: "P1992 / mountain / early_afternoon",
              winterImg: "P1992 / winter / afternoon",
            },
          )}
          ${combinedRow(
            "before_sunset",
            { eq: "16:00 – 17:30", summer: "17:30 – 19:00", winter: "14:30 – 16:00" },
            {
              spring: "QQS / forest / evening",
              summerImg: "FGA / ocean / before_sunset",
              fall: "P1992 / mountain / late_afternoon_and_evening",
              winterImg: "FGA / winter / evening",
            },
          )}
          ${combinedRow(
            "sunset",
            { eq: "17:30 – 18:30", summer: "19:00 – 20:00", winter: "16:00 – 17:00" },
            {
              spring: "P1992 / forest / sunset",
              summerImg: "P1992 / ocean / sunset",
              fall: "P1992 / mountain / sunset",
              winterImg: "FGA / winter / sunrise_and_sunset <em>(reused)</em>",
            },
          )}
          ${combinedRow(
            "after_sunset",
            { eq: "18:30 – 20:30", summer: "20:00 – 22:00", winter: "17:00 – 19:00" },
            {
              spring: "P1992 / forest / sunset <em>(reused)</em>",
              summerImg: "FGA / ocean / after_sunset",
              fall: "P1992 / mountain / sunset <em>(reused)</em>",
              winterImg: "FGA / winter / evening <em>(reused)</em>",
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

    const timeTablesHtml = `
      <section class="art-times">
        <h2>How the day cycle works</h2>
        <p>The renderer picks a band from the local clock with a cosine-interpolated solar shift of ±1.5 h applied to the morning- and evening-side edges. The 11:30 noon junction is anchored, so the late-morning / afternoon hand-off stays put across the year. Southern Hemisphere flips the phase (winter solstice in June).</p>

        <h3>Seasonal cycle — times and default images</h3>
        <p>This table shows, for every band, when it runs (clock window at the equinoxes, then the summer and winter solstice windows for Northern Hemisphere) and which image displays in the theme that "Seasonal" picks for that season.</p>
        ${combinedTable}
        <p class="art-note">Artist short names: <strong>FGA</strong> = Free Game Assets, <strong>P1992</strong> = PIXEL_1992, <strong>QQS</strong> = Quantum Quasar Studio. Arrows ("→") in a cell mean a multi-frame band that walks through several images in order.</p>

        <h3>Weather variants</h3>
        <p>Trigger when Weather = Always (whenever an eligible variant exists for the current band) or Sometimes (single per-page-load coin flip; ~17.5 % chance).</p>
        <ul>
          <li><strong>Ocean — rain</strong> covers late_morning, afternoon, and before_sunset → FGA / ocean / rain_daytime</li>
          <li><strong>Winter — snow</strong> covers early_morning, sunrise, late_morning, afternoon, and before_sunset → QQS / winter / snow</li>
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

        <h3>Image usage notes</h3>
        <p>The 33-image set isn't quite covered evenly across the seasonal cycle. Notes on what's pulling more than its share and what's sitting idle:</p>
        <ul>
          <li><strong>Unused</strong>: <code>quantum_quasar_studio / ocean / early_morning</code> — the QQS ocean only includes an early_morning piece, and Ocean's pre-dawn slot uses FGA / ocean / night for stylistic consistency with the rest of the FGA-driven Ocean cycle. Could be swapped in if you'd prefer the QQS look.</li>
          <li><strong>Used twice</strong> (typical for short bands the artist didn't draw separately for): QQS / forest / morning (sunrise + late_morning), P1992 / forest / sunset (sunset + after_sunset), P1992 / forest / night (early_morning + night), P1992 / mountain / sunset (sunset + after_sunset), FGA / winter / sunrise_and_sunset (sunrise + sunset), FGA / winter / evening (before_sunset + after_sunset), FGA / winter / night (early_morning + night), FGA / ocean / night (early_morning + night).</li>
          <li><strong>Multi-frame walks</strong>: Mountain late_morning steps through <code>QQS / early_morning → P1992 / late_morning</code> as the band progresses; Ocean afternoon steps through <code>FGA / afternoon → P1992 / late_afternoon</code>. These walk the imager linearly across the band's clock duration.</li>
          <li><strong>Underrepresented relative to artist contribution</strong>: PIXEL_1992 / ocean / late_afternoon only appears as the second frame of Ocean's afternoon multi-frame walk; pulling it into a dedicated slot would require nudging the band layout.</li>
        </ul>

        <h3>Seasonal theme picks</h3>
        <p>When Art Theme = Seasonal, the date and hemisphere choose which theme renders.</p>
        <ul>
          <li><strong>Northern</strong>: Dec–Feb winter · Mar–May forest · Jun–Aug ocean · Sep–Nov mountain</li>
          <li><strong>Southern</strong>: Jun–Aug winter · Sep–Nov forest · Dec–Feb ocean · Mar–May mountain</li>
        </ul>
      </section>`

    const html = `<!doctype html>
<html lang="${cfg.locale ?? "en-US"}">
<head>
  <meta charset="utf-8" />
  <title>Site art credits — ${escapeHtml(cfg.pageTitle)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Credits for the pixel-art background scenes used on this site." />
  <link rel="icon" href="../static/icon.png" />
  <link rel="stylesheet" href="../index.css" />
  <script src="../prescript.js" type="application/javascript"></script>
  <style>
    .site-art-page {
      max-width: 87ch;
      margin: 2rem auto 4rem;
      padding: 0 1rem;
    }
    .art-artist { margin: 2rem 0 3rem; }
    .art-artist h2 { margin-bottom: 1rem; }
    .art-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
    }
    .art-grid figure {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .art-grid img {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: 4px;
      image-rendering: pixelated;
      background: var(--lightgray);
    }
    .art-grid figcaption {
      font-size: 0.85em;
      color: var(--darkgray);
    }
    .art-times { margin: 3rem 0; }
    .art-times h3 { margin-top: 1.5rem; }
    .art-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
      margin: 0.5rem 0 1rem;
    }
    .art-table th, .art-table td {
      text-align: left;
      padding: 0.35rem 0.5rem;
      border-bottom: 1px solid var(--lightgray);
      vertical-align: top;
    }
    .art-table th { font-weight: 600; }
    .art-note { font-size: 0.85em; color: var(--darkgray); margin-top: 0; }
    .art-times-small { font-size: 0.85em; color: var(--darkgray); }
    .art-combined td { font-size: 0.88em; }
  </style>
</head>
<body data-slug="site-art">
  <div class="site-art-page">
    <h1>Site art credits</h1>
    <p>The background scenes on this site are pixel-art landscapes licensed for commercial use from the artists below. Each artist's name links to their itch.io page; thumbnails show the specific images and the time-band / variant they cover on the site.</p>
    <p>For a full-bleed view with no chrome, see the <a href="../background/">background showcase</a>.</p>
    ${sectionHtml}
    ${timeTablesHtml}
    <p><a href="./about">← Back to About</a></p>
  </div>
  <script src="../postscript.js" type="application/javascript"></script>
</body>
</html>`

    yield write({
      ctx,
      slug: "site-art/index" as FullSlug,
      ext: ".html",
      content: html,
    })
  },
  async *partialEmit() {},
})
