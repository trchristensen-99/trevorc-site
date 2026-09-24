import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/emailObfuscate.inline"

const css = `
/* Before hydration the span holds readable fallback text ("contact at
   trevorc dot com"); afterwards it holds a real mailto anchor. Styling
   the anchor like a normal link keeps the two states visually close so
   there's no layout jump. */
.email-obf a {
  color: var(--secondary);
  text-decoration: none;
}
.email-obf a:hover {
  text-decoration: underline;
}
`

const EmailObfuscate: QuartzComponent = (_props: QuartzComponentProps) => null

EmailObfuscate.css = css
EmailObfuscate.afterDOMLoaded = script

export default (() => EmailObfuscate) satisfies QuartzComponentConstructor
