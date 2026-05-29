import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import decorScript from "./scripts/decorToggle.inline"

const css = `
.top-decor {
  position: relative;
  width: 100%;
  max-width: 87ch;
  margin: 0 auto;
  height: 5rem;
  /* Placeholder visual: pixel-grid pattern at low contrast so swapping in
     a real PNG later is obvious. */
  background-color: var(--lightgray);
  background-image:
    linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px),
    linear-gradient(0deg, rgba(0,0,0,0.06) 1px, transparent 1px);
  background-size: 16px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--darkgray);
  font-size: 0.85em;
  border-radius: 4px;
}
.top-decor[hidden] { display: none; }
.top-decor-close {
  position: absolute;
  top: 4px;
  right: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--darkgray);
  padding: 2px 6px;
  font: inherit;
  font-size: 1.05em;
  line-height: 1;
  border-radius: 3px;
}
.top-decor-close:hover {
  color: var(--secondary);
  background: var(--light);
}
`

const TopDecor: QuartzComponent = (_props: QuartzComponentProps) => (
  <div class="top-decor" data-decor="top">
    <span>top decoration placeholder · pixel art goes here</span>
    <button type="button" class="top-decor-close decor-close" aria-label="Hide top decoration">
      ×
    </button>
  </div>
)

TopDecor.css = css
TopDecor.afterDOMLoaded = decorScript

export default (() => TopDecor) satisfies QuartzComponentConstructor
