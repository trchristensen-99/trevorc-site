import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import decorScript from "./scripts/decorToggle.inline"

const css = `
.bottom-decor {
  position: relative;
  width: 100%;
  max-width: 87ch;
  margin: 1rem auto 0.5rem;
  height: 5rem;
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
.bottom-decor[hidden] { display: none; }
.bottom-decor-close {
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
.bottom-decor-close:hover {
  color: var(--secondary);
  background: var(--light);
}
`

const BottomDecor: QuartzComponent = (_props: QuartzComponentProps) => (
  <div class="bottom-decor" data-decor="bottom">
    <span>bottom decoration placeholder · pixel art goes here</span>
    <button type="button" class="bottom-decor-close decor-close" aria-label="Hide bottom decoration">
      ×
    </button>
  </div>
)

BottomDecor.css = css
BottomDecor.afterDOMLoaded = decorScript

export default (() => BottomDecor) satisfies QuartzComponentConstructor
