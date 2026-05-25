import PageTitleBuilder from "./PageTitle"
import SearchBuilder from "./Search"
import DarkmodeBuilder from "./Darkmode"
import SidebarMenuBuilder from "./SidebarMenu"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"
import stickyScript from "./scripts/stickyTopBar.inline"

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

/* Narrow widths: collapse to a single line. Smaller title on the left;
   search/dark/menu as three icon buttons on the right, all the same size.
   The whole page-header becomes sticky and hides on scroll-down /
   re-reveals on scroll-up. */
@media (max-width: 700px) {
  .top-bar {
    gap: 0.5rem;
  }
  .top-bar-actions {
    gap: 0.5rem;
  }
}
.page-header {
  transition: transform 180ms ease;
}
@media (max-width: 700px) {
  .page-header {
    position: sticky;
    top: 0;
    z-index: 80;
    background: var(--light);
    /* Subtle bottom border so it doesn't blend into the content when sticky */
    box-shadow: 0 1px 0 var(--lightgray);
  }
  .page-header.top-bar-hidden {
    transform: translateY(-100%);
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
  stickyScript,
)
TopBar.beforeDOMLoaded = concatenateResources(
  PageTitleInstance.beforeDOMLoaded,
  SearchInstance.beforeDOMLoaded,
  DarkmodeInstance.beforeDOMLoaded,
  SidebarMenuInstance.beforeDOMLoaded,
)

export default (() => TopBar) satisfies QuartzComponentConstructor
