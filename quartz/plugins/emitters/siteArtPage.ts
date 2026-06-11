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

    // Time-band tables (matches the constants in siteArt.inline.ts: a
    // ±1.5 h cosine-interpolated solar offset with the 11:30 noon
    // junction anchored). Three columns: equinox baseline, summer
    // solstice (north), winter solstice (north).
    const timeBandsRow = (
      band: string,
      eq: string,
      summer: string,
      winter: string,
    ) =>
      `<tr><td>${band}</td><td>${eq}</td><td>${summer}</td><td>${winter}</td></tr>`
    const timeBandsTable = `
      <table class="art-table">
        <thead>
          <tr>
            <th>Band</th>
            <th>Equinox (Mar / Sep)</th>
            <th>Summer solstice (N — Jun 21)</th>
            <th>Winter solstice (N — Dec 21)</th>
          </tr>
        </thead>
        <tbody>
          ${timeBandsRow("early_morning", "05:30 – 07:30", "04:00 – 06:00", "07:00 – 09:00")}
          ${timeBandsRow("late_morning", "07:30 – 11:30", "06:00 – 11:30", "09:00 – 11:30")}
          ${timeBandsRow("afternoon", "11:30 – 16:30", "11:30 – 18:00", "11:30 – 15:00")}
          ${timeBandsRow("before_sunset", "16:30 – 18:00", "18:00 – 19:30", "15:00 – 16:30")}
          ${timeBandsRow("after_sunset", "18:00 – 20:30", "19:30 – 22:00", "16:30 – 19:00")}
          ${timeBandsRow("night", "20:30 – 05:30", "22:00 – 04:00", "19:00 – 07:00")}
        </tbody>
      </table>`

    const themeRow = (
      band: string,
      ocean: string,
      forest: string,
      mountain: string,
      winter: string,
    ) =>
      `<tr><td>${band}</td><td>${ocean}</td><td>${forest}</td><td>${mountain}</td><td>${winter}</td></tr>`
    const themesTable = `
      <table class="art-table">
        <thead>
          <tr>
            <th>Band</th>
            <th>Ocean</th>
            <th>Forest</th>
            <th>Mountain</th>
            <th>Winter</th>
          </tr>
        </thead>
        <tbody>
          ${themeRow(
            "early_morning",
            "FGA / ocean / sunrise",
            "QQS / forest / morning",
            "QQS / mountain / sunrise_1 → sunrise_2 → early_morning",
            "FGA / winter / sunrise_and_sunset",
          )}
          ${themeRow(
            "late_morning",
            "FGA / ocean / late_morning",
            "QQS / forest / morning <em>(reused)</em>",
            "P1992 / mountain / late_morning",
            "FGA / winter / morning",
          )}
          ${themeRow(
            "afternoon",
            "FGA / ocean / afternoon",
            "QQS / forest / afternoon",
            "P1992 / mountain / early_afternoon",
            "P1992 / winter / afternoon",
          )}
          ${themeRow(
            "before_sunset",
            "FGA / ocean / before_sunset",
            "QQS / forest / evening",
            "P1992 / mountain / late_afternoon_and_evening",
            "FGA / winter / evening",
          )}
          ${themeRow(
            "after_sunset",
            "FGA / ocean / after_sunset",
            "P1992 / forest / sunset",
            "P1992 / mountain / sunset",
            "FGA / winter / sunrise_and_sunset <em>(reused)</em>",
          )}
          ${themeRow(
            "night",
            "FGA / ocean / night",
            "P1992 / forest / night",
            "P1992 / mountain / night",
            "FGA / winter / night",
          )}
        </tbody>
      </table>`

    const timeTablesHtml = `
      <section class="art-times">
        <h2>How the day cycle works</h2>
        <p>The renderer picks a band from the local clock with a cosine-interpolated solar shift of ±1.5 h applied to the morning- and evening-side edges. The 11:30 noon junction is anchored, so the late-morning / afternoon hand-off stays put across the year. Southern Hemisphere flips the phase (winter solstice in June).</p>

        <h3>Time bands by season</h3>
        ${timeBandsTable}

        <h3>What each band shows, per theme</h3>
        ${themesTable}
        <p class="art-note">Artist short names: <strong>FGA</strong> = Free Game Assets, <strong>P1992</strong> = PIXEL_1992, <strong>QQS</strong> = Quantum Quasar Studio.</p>

        <h3>Weather variants</h3>
        <p>Trigger when Weather = Always (whenever an eligible variant exists for the current band) or Sometimes (single per-page-load coin flip; ~17.5 % chance).</p>
        <ul>
          <li><strong>Ocean — rain</strong> covers late_morning, afternoon, and before_sunset → FGA / ocean / rain_daytime</li>
          <li><strong>Winter — snow</strong> covers early_morning, late_morning, afternoon, and before_sunset → QQS / winter / snow</li>
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
