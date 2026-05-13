import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [Component.Backlinks()],
  footer: Component.Footer({
    links: {},
  }),
}

// Single top bar: title, search (grows), dark mode toggle, hamburger menu.
const topBar = Component.Flex({
  components: [
    { Component: Component.PageTitle(), align: "center" },
    { Component: Component.Search(), grow: true, align: "center" },
    { Component: Component.Darkmode(), align: "center" },
    { Component: Component.SidebarMenu(), align: "center" },
  ],
  gap: "0.75rem",
})

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ContentMeta(),
    Component.AudioPlayer(),
    Component.TagList(),
    Component.InlineToc(),
  ],
  left: [topBar],
  right: [],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [topBar],
  right: [],
}
