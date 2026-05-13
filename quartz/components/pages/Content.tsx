import { ComponentChildren } from "preact"
import { htmlToJsx } from "../../util/jsx"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import SortableListBuilder from "../SortableList"
import { QuartzPluginData } from "../../plugins/vfile"
import { FullSlug, resolveRelative } from "../../util/path"
import { formatDate } from "../Date"
import { calibrate } from "../../util/calibration"

const SortableListInstance = SortableListBuilder(undefined)

const homeListsCss = `
.home-section {
  margin: 1rem 0 1.25rem;
  border-left: 3px solid var(--lightgray);
  padding: 0.5rem 0.9rem;
}
.home-section > summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--dark);
  font-size: 1.05em;
  list-style: none;
  outline: none;
}
.home-section > summary::-webkit-details-marker { display: none; }
.home-section > summary::after {
  content: " ▸";
  color: var(--gray);
  font-size: 0.85em;
}
.home-section[open] > summary::after { content: " ▾"; }
.home-section ul {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
}
.home-section li {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
  margin: 0.4rem 0;
}
.home-section li .title {
  flex: 1;
  min-width: 0;
}
.home-section li .meta {
  color: var(--darkgray);
  font-size: 0.85em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
`

type MetaField = "created" | "modified" | "importance"

function renderHomeSection(
  title: string,
  pages: QuartzPluginData[],
  metaField: MetaField,
  props: QuartzComponentProps,
): ComponentChildren {
  if (pages.length === 0) return null
  return (
    <details class="home-section" open>
      <summary>{title}</summary>
      <ul>
        {pages.map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>
          const pageTitle = (fm.title as string) ?? p.slug ?? "untitled"
          let meta = ""
          if (metaField === "created" && p.dates?.created) {
            meta = formatDate(p.dates.created, props.cfg.locale)
          } else if (metaField === "modified" && p.dates?.modified) {
            meta = formatDate(p.dates.modified, props.cfg.locale)
          } else if (metaField === "importance") {
            const cal = calibrate(props.allFiles, p)
            meta = cal ? `${cal.bucket}/10` : ""
          }
          return (
            <li>
              <a class="internal title" href={resolveRelative(props.fileData.slug!, p.slug!)}>
                {pageTitle}
              </a>
              <span class="meta">{meta}</span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function isWriting(f: QuartzPluginData, selfSlug: string | undefined): boolean {
  if (!f.slug) return false
  if (f.slug === selfSlug) return false
  if (f.slug === "all" || f.slug === "about" || f.slug === "audio-test") return false
  if (f.slug === "publications" || f.slug === "index" || f.slug === "404") return false
  if (f.slug.startsWith("tags/")) return false
  // Exclude folder index pages (writing/index, notes/index, etc.)
  if (f.slug.endsWith("/index")) return false
  // Exclude pages without text content
  if (!f.text) return false
  return true
}

const Content: QuartzComponent = (props: QuartzComponentProps) => {
  const { fileData, tree, allFiles } = props
  const content = htmlToJsx(fileData.filePath!, tree) as ComponentChildren
  const classes: string[] = fileData.frontmatter?.cssclasses ?? []
  const classString = ["popover-hint", ...classes].join(" ")
  const fm = fileData.frontmatter as Record<string, unknown> | undefined

  let appended: ComponentChildren = null

  if (fm?.all_pages === true) {
    // Include every parsed file (including this page) and inject a synthetic
    // entry for the auto-generated /tags index, which doesn't live in
    // content/ but is emitted by Quartz. Skip individual /tags/<name> pages
    // and the 404 page.
    const pages: QuartzPluginData[] = allFiles.filter((f) => {
      if (!f.slug) return false
      if (f.slug.startsWith("tags/")) return false
      if (f.slug === "404") return false
      return true
    })
    const hasTagsIndex = pages.some((p) => p.slug === "tags")
    if (!hasTagsIndex) {
      pages.push({
        slug: "tags" as FullSlug,
        frontmatter: { title: "Tags", tags: [] },
      } as QuartzPluginData)
    }
    appended = <SortableListInstance {...props} pages={pages} />
  } else if (fm?.home_lists === true) {
    const HOME_LIMIT = 10
    const writings = allFiles.filter((f) => isWriting(f, fileData.slug))

    const byPublished = [...writings].sort(
      (a, b) => (b.dates?.created?.getTime() ?? 0) - (a.dates?.created?.getTime() ?? 0),
    )
    const byUpdated = [...writings].sort(
      (a, b) => (b.dates?.modified?.getTime() ?? 0) - (a.dates?.modified?.getTime() ?? 0),
    )
    const byImportance = [...writings].sort((a, b) => {
      const ai = typeof (a.frontmatter as Record<string, unknown>)?.importance === "number"
        ? ((a.frontmatter as Record<string, unknown>).importance as number)
        : -Infinity
      const bi = typeof (b.frontmatter as Record<string, unknown>)?.importance === "number"
        ? ((b.frontmatter as Record<string, unknown>).importance as number)
        : -Infinity
      return bi - ai
    })

    appended = (
      <>
        {renderHomeSection("Recently published", byPublished.slice(0, HOME_LIMIT), "created", props)}
        {renderHomeSection("Recently updated", byUpdated.slice(0, HOME_LIMIT), "modified", props)}
        {renderHomeSection("Most important", byImportance.slice(0, HOME_LIMIT), "importance", props)}
      </>
    )
  }

  return (
    <article class={classString}>
      {content}
      {appended}
    </article>
  )
}

Content.css = (SortableListInstance.css ?? "") + homeListsCss
Content.afterDOMLoaded = SortableListInstance.afterDOMLoaded

export default (() => Content) satisfies QuartzComponentConstructor
