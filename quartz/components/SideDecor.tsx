import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import decorScript from "./scripts/decorToggle.inline"

const ARTICLE_WIDTH_CH = 87

const css = `
.side-decor {
  position: fixed;
  top: 0;
  bottom: 0;
  width: max(0px, calc((100vw - ${ARTICLE_WIDTH_CH}ch - 3rem) / 2));
  pointer-events: none;
  z-index: 1;
  background-color: var(--lightgray);
  background-image:
    linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px),
    linear-gradient(0deg, rgba(0,0,0,0.06) 1px, transparent 1px);
  background-size: 16px 16px;
}
.side-decor.left { left: 0; }
.side-decor.right { right: 0; }
.side-decor.fade.left {
  -webkit-mask-image: linear-gradient(90deg, var(--lightgray) 0%, transparent 100%);
  mask-image: linear-gradient(90deg, var(--lightgray) 0%, transparent 100%);
}
.side-decor.fade.right {
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, var(--lightgray) 100%);
  mask-image: linear-gradient(90deg, transparent 0%, var(--lightgray) 100%);
}
.side-decor[hidden] { display: none; }

/* Hide entirely on narrow viewports where there's no side margin to fill. */
@media (max-width: 1100px) {
  .side-decor { display: none; }
}
`

const SideDecor: QuartzComponent = (_props: QuartzComponentProps) => (
  <>
    <div class="side-decor left" data-decor="side-left"></div>
    <div class="side-decor right" data-decor="side-right"></div>
  </>
)

SideDecor.css = css
SideDecor.afterDOMLoaded = decorScript

export default (() => SideDecor) satisfies QuartzComponentConstructor
