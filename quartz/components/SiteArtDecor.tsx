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
  image-rendering: pixelated;
}
/* The "fade" overlay sits above the base layer (later in DOM order, so
   no z-index gymnastics needed). The base stays at opacity 1 during a
   transition; the overlay fades from 0 to 1 over CROSSFADE_MS so the
   compositing alpha is always saturated and there's no darker middle
   frame. */
.site-art-base { opacity: 0; }
.site-art-fade { opacity: 0; }
`

const SiteArtDecor: QuartzComponent = (_props: QuartzComponentProps) => null

SiteArtDecor.css = css
SiteArtDecor.afterDOMLoaded = script

export default (() => SiteArtDecor) satisfies QuartzComponentConstructor
