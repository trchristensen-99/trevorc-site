import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/footnoteHover.inline"

const css = `
.footnote-tooltip {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 200;
  display: none;
  max-width: min(24rem, calc(100vw - 2rem));
  padding: 0.5rem 0.75rem;
  background: var(--light);
  color: var(--dark);
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  font-size: 0.9em;
  line-height: 1.45;
  pointer-events: none;
  white-space: normal;
}
`

const FootnoteHover: QuartzComponent = (_props: QuartzComponentProps) => null

FootnoteHover.css = css
FootnoteHover.afterDOMLoaded = script

export default (() => FootnoteHover) satisfies QuartzComponentConstructor
