// /background — full-bleed view of the site-art renderer with no
// chrome. Reuses the bundled index.css and postscript.js, then hides
// every body child except the renderer's .site-art-frame <img>
// elements. siteArt.inline.ts detects the /background path and forces
// the active theme to "seasonal" so the page always shows something,
// even if the visitor has Art Theme: None saved in localStorage.

import { FullSlug } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"

export const BackgroundShowcase: QuartzEmitterPlugin = () => ({
  name: "BackgroundShowcase",
  async *emit(ctx) {
    const cfg = ctx.cfg.configuration
    const title = `Background art — ${cfg.pageTitle}`
    const html = `<!doctype html>
<html lang="${cfg.locale ?? "en-US"}" data-art-theme="seasonal" data-color-theme="blue">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Full-bleed display of the site's pixel-art background.">
  <link rel="icon" href="../static/icon.png">
  <link rel="stylesheet" href="../index.css">
  <style>
    /* The renderer paints two site-art <img>s at position: fixed. On
       the main site they sit at z-index: -1, which puts them behind
       html's bg color and any opaque body. On /background there's no
       .page to stack on top, so we lift them above body explicitly
       (z-index: 1 !important) so they cover whatever color shows
       before the manifest finishes loading. Body and html keep a
       neutral dark fallback so the pre-load state isn't a glaring
       white flash. */
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #14161e !important;
    }
    body > *:not(.site-art-frame) { display: none !important; }
    .site-art-frame {
      display: block !important;
      z-index: 1 !important;
    }
  </style>
  <script src="../prescript.js" type="application/javascript"></script>
</head>
<body data-slug="background">
  <script src="../postscript.js" type="application/javascript"></script>
</body>
</html>`
    yield write({
      ctx,
      slug: "background/index" as FullSlug,
      ext: ".html",
      content: html,
    })
  },
  async *partialEmit() {},
})
