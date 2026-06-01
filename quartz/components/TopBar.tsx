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
/* All four top-bar buttons use rem-based sizing so they scale together
   with the user's text zoom, while preserving their square (1:1)
   aspect ratio at any zoom level. The article body and the buttons
   grow together; the search button uses the same height as the icon
   buttons and the same square footprint on mobile (icon-only). */
.top-bar {
  display: flex;
  /* Allow the title and the button group to wrap when there isn't
     enough horizontal room (e.g. at high text-zoom on narrow phones).
     row-gap gives wrapped rows breathing space. */
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  row-gap: 0.5rem;
  width: 100%;
  max-width: 87ch;
  margin: 0 auto;
  padding: 0.45rem 0.5rem;
}
.top-bar-left {
  flex-shrink: 1;
  min-width: 0;
}
.top-bar-right {
  display: flex;
  /* And within the button group itself: if even four icons don't fit
     on one row at high zoom, allow them to wrap onto a second row. */
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  row-gap: 0.5rem;
  flex-shrink: 0;
  padding: 0 0.25rem;
}
.top-bar-right > * {
  flex-shrink: 0;
}

.top-bar .darkmode,
.top-bar .settings-button,
.top-bar .nav-menu-toggle,
.top-bar .search > .search-button {
  height: 2.1rem;
  box-sizing: border-box;
}
.top-bar .darkmode,
.top-bar .settings-button,
.top-bar .nav-menu-toggle {
  width: 2.1rem;
  padding: 0.4rem;
}
.top-bar .darkmode svg,
.top-bar .settings-button svg,
.top-bar .nav-menu-toggle svg {
  width: 1.2rem;
  height: 1.2rem;
}
.top-bar .search > .search-button {
  font-size: 0.85rem;
  padding: 0 0.65rem 0 0;
}
.top-bar .search > .search-button svg {
  width: 1.2rem;
  height: 1.2rem;
  min-width: 1.2rem;
  margin: 0 0.45rem;
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
  /* On mobile, search collapses to icon-only. Force square (width =
     height) so its aspect ratio stays 1:1 at every zoom level. */
  .top-bar .search > .search-button {
    width: 2.1rem;
    padding: 0;
    justify-content: center;
  }
  .top-bar .search > .search-button svg {
    margin: 0;
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
