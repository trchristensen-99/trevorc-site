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
.home-section li.has-blurb {
  display: block;
  margin: 0.85rem 0;
}
.home-section li .row {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
}
.home-section li .blurb {
  margin: 0.15rem 0 0;
  font-size: 0.9em;
  line-height: 1.45;
  color: var(--darkgray);
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

// Opening sentence of a page, used as an auto-generated blurb on the
// writing highlights page. Taken verbatim from the prose rather than
// summarised, so it can never misrepresent a piece and never needs
// maintaining as the essays change.
//
// Reads the parsed tree rather than the flattened text so it can skip
// a leading epigraph (several essays open with a block quote) and drop
// footnote reference markers, both of which otherwise land in the
// middle of the blurb.
function firstParagraphText(p: QuartzPluginData): string {
  const ast = (p as unknown as { htmlAst?: { children?: any[] } }).htmlAst
  const kids = ast?.children
  if (!Array.isArray(kids)) return ""
  const para = kids.find((n: any) => n?.type === "element" && n.tagName === "p")
  if (!para) return ""
  const collect = (node: any): string => {
    if (!node) return ""
    if (node.type === "text") return node.value ?? ""
    if (node.type !== "element") return ""
    // footnote markers and back-refs are not prose
    if (node.tagName === "sup") return ""
    if (node.properties?.dataFootnoteRef !== undefined) return ""
    return (node.children ?? []).map(collect).join("")
  }
  return collect(para)
}

function firstSentence(p: QuartzPluginData, maxLen = 190): string {
  const clean = firstParagraphText(p).replace(/\s+/g, " ").trim()
  if (!clean) return ""
  // Require the period to be followed by a capital or quote so that
  // "U.S.A." and "9.4/10" don't end the sentence early.
  const m = clean.match(/^.*?[.!?](?=\s+["'“(]?[A-Z0-9])/)
  let out = m ? m[0] : clean
  if (out.length > maxLen) {
    const cut = out.slice(0, maxLen)
    out = cut.slice(0, cut.lastIndexOf(" ")) + "\u2026"
  }
  return out
}

function renderHomeSection(
  title: string,
  pages: QuartzPluginData[],
  metaField: MetaField,
  props: QuartzComponentProps,
  opts: { excerpts?: number; open?: boolean } = {},
): ComponentChildren {
  if (pages.length === 0) return null
  const excerpts = opts.excerpts ?? 0
  return (
    <details class="home-section" open={opts.open ?? false}>
      <summary>{title}</summary>
      <ul>
        {pages.map((p, i) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>
          const pageTitle = (fm.title as string) ?? p.slug ?? "untitled"
          let meta = ""
          if (metaField === "created" && p.dates?.created) {
            meta = formatDate(p.dates.created, props.cfg.locale)
          } else if (metaField === "modified" && p.dates?.modified) {
            meta = formatDate(p.dates.modified, props.cfg.locale)
          } else if (metaField === "importance") {
            const cal = calibrate(props.allFiles, p)
            meta = cal ? `${cal.raw}/10` : ""
          }
          const blurb = i < excerpts ? firstSentence(p) : ""
          return (
            <li class={blurb ? "has-blurb" : undefined}>
              <div class="row">
                <a class="internal title" href={resolveRelative(props.fileData.slug!, p.slug!)}>
                  {pageTitle}
                </a>
                <span class="meta">{meta}</span>
              </div>
              {blurb ? <p class="blurb">{blurb}</p> : null}
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
  // Standalone non-essay pages: these are site furniture, not writing,
  // so they shouldn't appear in the recent/important essay feeds.
  if (f.slug === "research" || f.slug === "contact" || f.slug === "metadata") return false
  if (f.slug === "site-art" || f.slug === "background") return false
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
      // Synthesize the Tags page row with aggregated dates (earliest
      // 'created' and latest 'modified' across every tagged page), matching
      // what the TagPage emitter does for the rendered /tags page itself.
      const tagged = allFiles.filter(
        (f) => ((f.frontmatter?.tags as string[] | undefined) ?? []).length > 0,
      )
      let earliest: Date | undefined
      let latest: Date | undefined
      for (const f of tagged) {
        const c = f.dates?.created
        const m = f.dates?.modified
        if (c && (!earliest || c.getTime() < earliest.getTime())) earliest = c
        if (m && (!latest || m.getTime() > latest.getTime())) latest = m
      }
      const created = earliest ?? latest
      const modified = latest ?? earliest
      pages.push({
        slug: "tags" as FullSlug,
        frontmatter: { title: "Tags", tags: ["meta"] },
        dates: created && modified ? { created, modified, published: created } : undefined,
        text: " ",
      } as QuartzPluginData)
    }
    appended = <SortableListInstance {...props} pages={pages} />
  } else if (fm?.home_lists === true || fm?.home_lists === "highlights") {
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

    // On the highlights page the lists are the content: open them and
    // give every row the essay's opening line, which reads as a hook
    // plus enough context to decide whether to click.
    const o =
      fm?.home_lists === "highlights" ? { excerpts: HOME_LIMIT, open: true } : {}
    appended = (
      <>
        {renderHomeSection("Recently created", byPublished.slice(0, HOME_LIMIT), "created", props, o)}
        {renderHomeSection("Most important", byImportance.slice(0, HOME_LIMIT), "importance", props, o)}
        {renderHomeSection("Recently updated", byUpdated.slice(0, HOME_LIMIT), "modified", props, o)}
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
