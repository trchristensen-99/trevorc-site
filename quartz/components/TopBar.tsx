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
  gap: 0.5rem;
  flex-shrink: 0;
}

/* Narrow widths: single line. Smaller title on the left, three same-sized
   icon buttons (search, dark, menu) on the right with even gaps. The
   <header> element only becomes sticky; the breadcrumbs/title/meta scroll
   away normally with the page. */
@media (max-width: 700px) {
  .top-bar {
    gap: 0.5rem;
  }
  .top-bar-right {
    gap: 0.9rem;
  }
}
@media (max-width: 700px) {
  .page-header > header {
    position: sticky;
    /* Top set slightly above viewport so the bar's padding extends past the
       very top edge — eliminates the thin gap where text could peek through
       above the bar during the show/hide transition. */
    top: -2px;
    z-index: 80;
    background: var(--light);
    box-shadow: 0 1px 0 var(--lightgray);
    padding-top: 2px;
    /* No transition: the JS sets transform every scroll frame to match the
       page's own scroll-up rate. With sticky top: -2px and padding-top: 2px
       the bar tucks slightly above the viewport edge so no sliver of text
       shows above it during a partial state. */
    transition: transform 0ms;
    will-change: transform;
  }
  .page-title {
    line-height: 0.95;
  }
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
