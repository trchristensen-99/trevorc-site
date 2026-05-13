import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/listPage.scss"
import { PageList, SortFn } from "../PageList"
import SortableListBuilder from "../SortableList"
import { FullSlug, getAllSegmentPrefixes, resolveRelative, simplifySlug } from "../../util/path"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { i18n } from "../../i18n"
import { ComponentChildren } from "preact"
import { concatenateResources } from "../../util/resources"
import tagFilterScript from "../scripts/tagFilter.inline"

const SortableListInstance = SortableListBuilder(undefined)

// Tag names treated as "meta" rather than content. Edit this set to
// re-categorize.
const META_TAGS = new Set(["home", "index", "meta"])

interface TagContentOptions {
  sort?: SortFn
  numPages: number
}

const defaultOptions: TagContentOptions = {
  numPages: 10,
}

export default ((opts?: Partial<TagContentOptions>) => {
  const options: TagContentOptions = { ...defaultOptions, ...opts }

  const TagContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { tree, fileData, allFiles, cfg } = props
    const slug = fileData.slug

    if (!(slug?.startsWith("tags/") || slug === "tags")) {
      throw new Error(`Component "TagContent" tried to render a non-tag page: ${slug}`)
    }

    const tag = simplifySlug(slug.slice("tags/".length) as FullSlug)
    const allPagesWithTag = (tag: string) =>
      allFiles.filter((file) =>
        (file.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes).includes(tag),
      )

    const content = (
      (tree as Root).children.length === 0
        ? fileData.description
        : htmlToJsx(fileData.filePath!, tree)
    ) as ComponentChildren
    const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
    const classes = cssClasses.join(" ")
    if (tag === "/") {
      const tags = [
        ...new Set(
          allFiles.flatMap((data) => data.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes),
        ),
      ].sort((a, b) => a.localeCompare(b))
      const tagCount: Map<string, number> = new Map()
      for (const t of tags) tagCount.set(t, allPagesWithTag(t).length)
      return (
        <div class="popover-hint tag-filter-root">
          <article class={classes}>{content}</article>
          <p>{i18n(cfg.locale).pages.tagContent.totalTags({ count: tags.length })}</p>
          <div class="tag-filter-controls">
            <span>Show:</span>
            <label>
              <input type="checkbox" value="content" checked /> Content
            </label>
            <label>
              <input type="checkbox" value="meta" /> Meta
            </label>
          </div>
          <ul class="tag-index-list">
            {tags.map((t) => {
              const isMeta = META_TAGS.has(t)
              const count = tagCount.get(t) ?? 0
              const tagListingPage = `/tags/${t}` as FullSlug
              const href = resolveRelative(fileData.slug!, tagListingPage)
              return (
                <li data-category={isMeta ? "meta" : "content"}>
                  <a class="internal tag-link" href={href}>
                    {t}
                  </a>
                  <span class="tag-count"> ({count})</span>
                </li>
              )
            })}
          </ul>
        </div>
      )
    } else {
      const pages = allPagesWithTag(tag)

      return (
        <div class="popover-hint">
          <article class={classes}>{content}</article>
          <div class="page-listing">
            <p>{i18n(cfg.locale).pages.tagContent.itemsUnderTag({ count: pages.length })}</p>
            <div>
              <SortableListInstance {...props} pages={pages} />
            </div>
          </div>
        </div>
      )
    }
  }

  TagContent.css = concatenateResources(
    style,
    PageList.css,
    SortableListInstance.css ?? "",
    `.tag-filter-controls {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin: 0.25rem 0 0.5rem;
      font-size: 0.95em;
      color: var(--darkgray);
    }
    .tag-filter-controls label {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
    }
    .tag-index-list {
      list-style: none;
      padding: 0;
      margin: 0.5rem 0 0 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .tag-index-list li {
      padding: 0.25rem 0;
    }
    .tag-index-list .tag-count {
      color: var(--gray);
      font-size: 0.9em;
    }`,
  )
  TagContent.afterDOMLoaded = concatenateResources(
    SortableListInstance.afterDOMLoaded,
    tagFilterScript,
  )
  return TagContent
}) satisfies QuartzComponentConstructor
