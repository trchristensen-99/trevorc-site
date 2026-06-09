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
        const e = entry as ManifestImage
        push(e.artist, { src: e.src, artist: e.artist, band })
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
  </style>
</head>
<body data-slug="site-art">
  <div class="site-art-page">
    <h1>Site art credits</h1>
    <p>The background scenes on this site are pixel-art landscapes licensed for commercial use from the artists below. Each artist's name links to their itch.io page; thumbnails show the specific images and the time-band / variant they cover on the site.</p>
    ${sectionHtml}
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
