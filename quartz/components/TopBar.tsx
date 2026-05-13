import PageTitleBuilder from "./PageTitle"
import SearchBuilder from "./Search"
import DarkmodeBuilder from "./Darkmode"
import SidebarMenuBuilder from "./SidebarMenu"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"

const PageTitleInstance = PageTitleBuilder(undefined)
const SearchInstance = SearchBuilder(undefined)
const DarkmodeInstance = DarkmodeBuilder(undefined)
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
  gap: 0.75rem;
  flex-shrink: 0;
}
.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Narrow widths: stack into two rows. Title centered on row 1. On row 2,
   the search bar sits at the left edge and the dark+menu actions group
   sits at the right edge, with the same outer gutter on both sides. */
@media (max-width: 700px) {
  .top-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }
  .top-bar-left {
    text-align: center;
  }
  .top-bar-right {
    justify-content: space-between;
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
      <div class="top-bar-actions">
        <DarkmodeInstance {...props} />
        <SidebarMenuInstance {...props} />
      </div>
    </div>
  </div>
)

TopBar.css = concatenateResources(
  css,
  PageTitleInstance.css,
  SearchInstance.css,
  DarkmodeInstance.css,
  SidebarMenuInstance.css,
)
TopBar.afterDOMLoaded = concatenateResources(
  PageTitleInstance.afterDOMLoaded,
  SearchInstance.afterDOMLoaded,
  DarkmodeInstance.afterDOMLoaded,
  SidebarMenuInstance.afterDOMLoaded,
)
TopBar.beforeDOMLoaded = concatenateResources(
  PageTitleInstance.beforeDOMLoaded,
  SearchInstance.beforeDOMLoaded,
  DarkmodeInstance.beforeDOMLoaded,
  SidebarMenuInstance.beforeDOMLoaded,
)

export default (() => TopBar) satisfies QuartzComponentConstructor
