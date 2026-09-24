import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/spoiler.inline"

const css = `
.spoiler {
  background-color: var(--darkgray);
  color: transparent;
  border-radius: 3px;
  cursor: pointer;
  padding: 0 0.15em;
  transition: color 160ms ease, background-color 160ms ease;
  /* Keep the blurred text unselectable so a drag-select doesn't
     leak the spoiler into the clipboard before it's revealed. */
  user-select: none;
  -webkit-user-select: none;
}
.spoiler:hover,
.spoiler:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}
.spoiler[data-revealed="true"] {
  background-color: transparent;
  color: inherit;
  cursor: auto;
  user-select: text;
  -webkit-user-select: text;
  outline: none;
}
/* Links nested inside an unrevealed spoiler shouldn't show through. */
.spoiler:not([data-revealed="true"]) a {
  color: transparent;
}
`

const Spoiler: QuartzComponent = (_props: QuartzComponentProps) => null

Spoiler.css = css
Spoiler.afterDOMLoaded = script

export default (() => Spoiler) satisfies QuartzComponentConstructor
