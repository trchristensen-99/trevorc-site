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
/* All four buttons in the top bar (search, darkmode, settings,
   hamburger) are pinned to the same absolute pixel size so they don't
   drift apart and don't scale with the user's text zoom. */
.top-bar {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  max-width: 87ch;
  margin: 0 auto;
  /* Vertical padding gives a sliver of whitespace above and below the
     button row. Horizontal padding keeps the title and buttons off the
     bar's hard edge. */
  padding: 0.45rem 0.5rem;
}
.top-bar-left {
  flex-shrink: 1;
  min-width: 0;
}
.top-bar-right {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
  padding: 0 0.25rem;
}
.top-bar-right > * {
  flex-shrink: 0;
}

/* Unified button size inside the top bar. The search button uses the
   same height; its width grows with its text/icon content. */
.top-bar .darkmode,
.top-bar .settings-button,
.top-bar .nav-menu-toggle,
.top-bar .search > .search-button {
  height: 38px;
  box-sizing: border-box;
}
.top-bar .darkmode,
.top-bar .settings-button,
.top-bar .nav-menu-toggle {
  width: 38px;
  padding: 7px;
}
.top-bar .darkmode svg,
.top-bar .settings-button svg,
.top-bar .nav-menu-toggle svg {
  width: 22px;
  height: 22px;
}
.top-bar .search > .search-button {
  font-size: 14px;
  padding: 0 12px 0 0;
}
.top-bar .search > .search-button svg {
  width: 22px;
  height: 22px;
  min-width: 22px;
  margin: 0 8px;
}

.page-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

@media (max-width: 700px) {
  .top-bar {
    gap: 0.4rem;
    padding: 0.45rem 0.4rem;
  }
  .top-bar-right {
    gap: 0.45rem;
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
