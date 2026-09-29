import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/lightbox.inline"

const css = `
.lightbox[hidden] { display: none; }
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: rgba(0, 0, 0, 0.93);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.lightbox-figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  max-width: min(1100px, 100%);
  max-height: 100%;
}
.lightbox-img {
  /* contain, not cover: the whole point is showing the uncropped image */
  max-width: 100%;
  max-height: calc(100vh - 12rem);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 4px;
  margin: 0;
  image-rendering: pixelated;
  background: #1a1a1a;
}
.lightbox-caption {
  color: #e8e8e8;
  font-size: 0.9rem;
  line-height: 1.45;
  text-align: center;
  max-width: 70ch;
  margin: 0;
}
.lightbox-caption[hidden] { display: none; }
.lightbox-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.lightbox-action {
  appearance: none;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 4px;
  color: #f2f2f2;
  font: inherit;
  font-size: 0.88rem;
  padding: 0.3rem 0.7rem;
  cursor: pointer;
  text-decoration: none;
}
.lightbox-action:hover,
.lightbox-action:focus-visible {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.lightbox-close {
  position: absolute;
  top: 0.6rem;
  right: 0.9rem;
  background: transparent;
  border: none;
  color: #f2f2f2;
  font-size: 2rem;
  line-height: 1;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
}
.lightbox-close:hover,
.lightbox-close:focus-visible {
  background: rgba(255, 255, 255, 0.15);
}
@media all and (max-width: 700px) {
  .lightbox { padding: 1rem 0.5rem; }
  /* Long captions (the map alt-text runs several lines) would otherwise
     push the actions off-screen on a phone, so cap the image height and
     let a very long caption scroll inside its own box. */
  .lightbox-img { max-height: calc(100vh - 15rem); }
  .lightbox-caption {
    font-size: 0.82rem;
    max-height: 6.5em;
    overflow-y: auto;
  }
}
`

const Lightbox: QuartzComponent = (_props: QuartzComponentProps) => null

Lightbox.css = css
Lightbox.afterDOMLoaded = script

export default (() => Lightbox) satisfies QuartzComponentConstructor
