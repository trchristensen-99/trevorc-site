import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/siteArt.inline"

const css = `
.site-art-frame {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  object-fit: cover;
  object-position: center bottom;
  z-index: -1;
  pointer-events: none;
  user-select: none;
  opacity: 0;
  transition: opacity 12s ease-in-out;
  image-rendering: pixelated;
}
`

// The two <img> elements are created and appended directly to <body>
// by siteArt.inline.ts, so they aren't trapped inside the sticky
// header's transformed containing block (same fix the canvas needed).
const SiteArtDecor: QuartzComponent = (_props: QuartzComponentProps) => null

SiteArtDecor.css = css
SiteArtDecor.afterDOMLoaded = script

export default (() => SiteArtDecor) satisfies QuartzComponentConstructor
