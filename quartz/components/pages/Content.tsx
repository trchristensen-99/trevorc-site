import { ComponentChildren } from "preact"
import { htmlToJsx } from "../../util/jsx"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import SortableListBuilder from "../SortableList"

const SortableListInstance = SortableListBuilder(undefined)

const Content: QuartzComponent = (props: QuartzComponentProps) => {
  const { fileData, tree, allFiles } = props
  const content = htmlToJsx(fileData.filePath!, tree) as ComponentChildren
  const classes: string[] = fileData.frontmatter?.cssclasses ?? []
  const classString = ["popover-hint", ...classes].join(" ")

  const showAllPages = (fileData.frontmatter as Record<string, unknown> | undefined)?.all_pages === true
  let allPagesList: ComponentChildren = null
  if (showAllPages) {
    const pages = allFiles.filter((f) => {
      if (!f.slug) return false
      if (f.slug === fileData.slug) return false
      // Exclude tag pages, 404, and folder/synthetic pages without text
      if (f.slug.startsWith("tags/")) return false
      if (f.slug === "404") return false
      return true
    })
    allPagesList = <SortableListInstance {...props} pages={pages} />
  }

  return (
    <article class={classString}>
      {content}
      {allPagesList}
    </article>
  )
}

Content.css = SortableListInstance.css
Content.afterDOMLoaded = SortableListInstance.afterDOMLoaded

export default (() => Content) satisfies QuartzComponentConstructor
