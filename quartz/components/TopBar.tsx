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
.top-bar {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  /* Keep the top bar in the same reading column as the article. At wider
     viewports the bar stays anchored and outer margins grow instead of the
     line stretching edge to edge. */
  max-width: 87ch;
  margin: 0 auto;
}
.top-bar-left {
  flex-shrink: 1;
  min-width: 0;
}
.top-bar-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}
.top-bar-right > * {
  flex-shrink: 0;
}

@media (max-width: 700px) {
  .top-bar {
    gap: 0.4rem;
  }
  .top-bar-right {
    gap: 0.55rem;
  }
  .page-title {
    line-height: 0.95;
  }
}

/* Sticky top bar on every viewport. The <header> element only becomes
   sticky; the breadcrumbs / title / meta below it scroll away normally.
   Reveal is binary with a small CSS transition — the JS just flips
   whether the bar is shown or hidden based on scroll direction, so any
   tiny upward scroll slides it back in. top: -2px + padding-top: 2px
   tucks the bar a hair past the viewport edge so no sliver of content
   ever shows above the background. */
.page-header > header {
  position: sticky;
  top: -2px;
  z-index: 80;
  background: var(--light);
  box-shadow: 0 1px 0 var(--lightgray);
  padding-top: 2px;
  transition: transform 180ms ease;
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
