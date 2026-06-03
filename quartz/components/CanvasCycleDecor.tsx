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
  /* 640x480 source — fill the viewport (the center is hidden behind
     .page, so the visible parts are the sides + bottom). */
  object-fit: cover;
  image-rendering: pixelated;
}
html[data-decor="cycle"] .decor-canvas {
  display: block;
}
/* In cycle mode body provides no background of its own — the canvas
   does. Clear pattern, mask, and max-width so nothing covers it. */
html[data-decor="cycle"] body {
  background: transparent;
  background-image: none;
  max-width: none;
  -webkit-mask-image: none;
  mask-image: none;
}
`

// The actual <canvas> is created and appended directly to <body> by the
// inline script (canvasCycle.inline.ts). Doing it from JS lets us
// guarantee the canvas isn't trapped inside an ancestor stacking
// context — e.g. the sticky top-bar's transformed <header>, which
// would otherwise pin the fixed-positioned canvas to that element and
// drag it around as the header transforms on scroll.
const CanvasCycleDecor: QuartzComponent = (_props: QuartzComponentProps) => null

CanvasCycleDecor.css = css
CanvasCycleDecor.afterDOMLoaded = script

export default (() => CanvasCycleDecor) satisfies QuartzComponentConstructor
