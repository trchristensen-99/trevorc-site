// Emits a standalone HTML page at /background/ that renders only the
// canvas-cycle scene (no top bar, no article content, no chrome).
// Useful as a showcase / debug surface for the pixel art.
//
// The page reuses the site's bundled index.css and postscript.js. A
// small inline script sets data-decor="cycle" and data-decor-scale=
// "fill" on <html> before the bundle runs, and settings.inline.ts is
// patched to skip overriding those two attributes when the URL is on
// the /background/ path.
import { FullSlug } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"

export const BackgroundShowcase: QuartzEmitterPlugin = () => ({
  name: "BackgroundShowcase",
  async *emit(ctx) {
    const cfg = ctx.cfg.configuration
    const title = `Background art — ${cfg.pageTitle}`
    const html = `<!doctype html>
<html lang="${cfg.locale ?? "en-US"}" data-decor="cycle" data-decor-scale="fill" data-color-theme="blue">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Standalone showcase of the site's cycling pixel-art background.">
  <link rel="icon" href="../static/icon.png">
  <link rel="stylesheet" href="../index.css">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #0a0a0a;
    }
    body > *:not(.decor-canvas) { display: none !important; }
    .decor-canvas { display: block !important; }
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
