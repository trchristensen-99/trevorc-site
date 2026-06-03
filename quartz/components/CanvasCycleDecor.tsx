import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/canvasCycle.inline"

const css = `
.decor-canvas {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1;
  pointer-events: none;
  display: none;
  /* The scene is 640x480 — fill the viewport with object-fit cover so
     the sides and bottom of the picture become the visible margins. */
  object-fit: cover;
  /* Hard-edged scaling preserves the pixel-art look at upscaled sizes. */
  image-rendering: pixelated;
}
html[data-decor="cycle"] .decor-canvas {
  display: block;
}
/* When the canvas decor is on, body's pattern background goes away — the
   canvas is the background. */
html[data-decor="cycle"] body {
  background: transparent;
  background-image: none;
  max-width: none;
  -webkit-mask-image: none;
  mask-image: none;
}
`

const CanvasCycleDecor: QuartzComponent = (_props: QuartzComponentProps) => (
  <canvas class="decor-canvas" aria-hidden="true"></canvas>
)

CanvasCycleDecor.css = css
CanvasCycleDecor.afterDOMLoaded = script

export default (() => CanvasCycleDecor) satisfies QuartzComponentConstructor
