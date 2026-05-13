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
  /* Keep top bar within the same reading column as the article. At wider
     viewports the bar stays anchored to the article width with growing
     outer margins, instead of stretching edge-to-edge. */
  max-width: 75ch;
  margin: 0.75rem auto 0.5rem;
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
`

const TopBar: QuartzComponent = (props: QuartzComponentProps) => (
  <div class="top-bar">
    <div class="top-bar-left">
      <PageTitleInstance {...props} />
    </div>
    <div class="top-bar-right">
      <SearchInstance {...props} />
      <DarkmodeInstance {...props} />
      <SidebarMenuInstance {...props} />
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
