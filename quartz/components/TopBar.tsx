import PageTitleBuilder from "./PageTitle"
import SearchBuilder from "./Search"
import DarkmodeBuilder from "./Darkmode"
import SettingsButtonBuilder from "./SettingsButton"
import SidebarMenuBuilder from "./SidebarMenu"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"
import stickyScript from "./scripts/stickyTopBar.inline"

const PageTitleInstance = PageTitleBuilder(undefined)
const SearchInstance = SearchBuilder(undefined)
const DarkmodeInstance = DarkmodeBuilder(undefined)
const SettingsButtonInstance = SettingsButtonBuilder(undefined)
const SidebarMenuInstance = SidebarMenuBuilder(undefined)

const css = `
/* Top-bar size is locked to a fixed font-size so the gear/search/
   darkmode/menu icons stay the same physical size regardless of the
   user's text-zoom setting. Internal sizes below use em (relative to
   this font-size) so changes here cascade. The article body still
   zooms — only the navigation chrome stays put. */
.top-bar {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75em;
  width: 100%;
  max-width: 87ch;
  margin: 0 auto;
  font-size: 1rem;
}
.top-bar-left {
  flex-shrink: 1;
  min-width: 0;
}
.top-bar-right {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex-shrink: 0;
}
.top-bar-right > * {
  flex-shrink: 0;
}

/* Cap the top-bar's font-size so the controls don't grow at high text
   zoom. At default 1x = 18px the top-bar is 18px. At 2x text zoom the
   surrounding html is 36px but the top-bar stays capped at 22px, so
   the icons stay legible without blowing up the layout. */
.top-bar {
  font-size: min(1rem, 22px);
}

/* Lock the icon controls inside the top-bar to em units so they scale
   with the top-bar's capped font-size (above), not the document font.
   These overrides apply only inside .top-bar; outside the top bar each
   component keeps its rem-based sizing. */
.top-bar .darkmode,
.top-bar .settings-button,
.top-bar .nav-menu-toggle {
  width: 2em;
  height: 2em;
  padding: 0.35em;
}
.top-bar .darkmode svg,
.top-bar .settings-button svg,
.top-bar .nav-menu-toggle svg {
  width: 1.1em;
  height: 1.1em;
}
.top-bar .search > .search-button {
  height: 2em;
  font-size: 1em;
}

.page-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

@media (max-width: 700px) {
  .top-bar {
    gap: 0.4em;
  }
  .top-bar-right {
    gap: 0.55em;
  }
  .page-title {
    line-height: 0.95;
  }
}

/* Sticky top bar on every viewport. The <header> element only becomes
   sticky; the breadcrumbs / title / meta below it scroll away normally.
   transition: transform 0ms — the JS updates transform every scroll
   frame to track the page's own scroll rate 1:1, so any easing here
   would visibly lag the reveal behind the scroll. top: -2px +
   padding-top: 2px tucks the bar a hair past the viewport edge so no
   sliver of content shows above the background during partial states. */
.page-header > header {
  position: sticky;
  top: -2px;
  z-index: 80;
  background: var(--light);
  box-shadow: 0 1px 0 var(--lightgray);
  padding-top: 2px;
  transition: transform 0ms;
  will-change: transform;
}
`

const TopBar: QuartzComponent = (props: QuartzComponentProps) => (
  <div class="top-bar">
    <div class="top-bar-left">
      <PageTitleInstance {...props} />
    </div>
    <div class="top-bar-right">
      <SearchInstance {...props} />
      <DarkmodeInstance {...props} />
      <SettingsButtonInstance {...props} />
      <SidebarMenuInstance {...props} />
    </div>
  </div>
)

TopBar.css = concatenateResources(
  css,
  PageTitleInstance.css,
  SearchInstance.css,
  DarkmodeInstance.css,
  SettingsButtonInstance.css,
  SidebarMenuInstance.css,
)
TopBar.afterDOMLoaded = concatenateResources(
  PageTitleInstance.afterDOMLoaded,
  SearchInstance.afterDOMLoaded,
  DarkmodeInstance.afterDOMLoaded,
  SettingsButtonInstance.afterDOMLoaded,
  SidebarMenuInstance.afterDOMLoaded,
  stickyScript,
)
TopBar.beforeDOMLoaded = concatenateResources(
  PageTitleInstance.beforeDOMLoaded,
  SearchInstance.beforeDOMLoaded,
  DarkmodeInstance.beforeDOMLoaded,
  SettingsButtonInstance.beforeDOMLoaded,
  SidebarMenuInstance.beforeDOMLoaded,
)

export default (() => TopBar) satisfies QuartzComponentConstructor
