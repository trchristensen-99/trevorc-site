import { resolveRelative } from "../util/path"
import { QuartzPluginData } from "../plugins/vfile"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import relatedToggleScript from "./scripts/relatedToggle.inline"

const VISIBLE_RELATED_BY_DEFAULT = 3

const css = `
.prev-next {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 0.75rem 0;
  font-size: 0.95em;
}
.prev-next .pn-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.prev-next .pn-cell.pn-next {
  text-align: right;
  align-items: flex-end;
}
.prev-next .pn-label {
  color: var(--gray);
  font-size: 0.85em;
}
.prev-next .pn-title {
  color: var(--secondary);
  text-decoration: none;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.prev-next .pn-title:hover {
  text-decoration: underline;
}

/* Inline Related list: label + entries flow as a single wrapping line. */
.similar-pages {
  margin: 0.5rem 0 0.75rem;
  font-size: 0.95em;
  line-height: 1.55;
}
.similar-pages .similar-label {
  color: var(--darkgray);
  font-weight: 600;
  margin-right: 0.35rem;
}
.similar-pages .similar-entry a.internal {
  color: var(--secondary);
  text-decoration: none;
}
.similar-pages .similar-entry a.internal:hover {
  text-decoration: underline;
}
.similar-pages .shared-tags {
  color: var(--gray);
  font-size: 0.85em;
  margin-left: 0.15rem;
}
.similar-pages[data-expanded="false"] .similar-extra {
  display: none;
}
.similar-toggle {
  background: transparent;
  border: none;
  color: var(--secondary);
  cursor: pointer;
  font: inherit;
  font-size: 0.9em;
  padding: 0 0.25rem;
  margin-left: 0.25rem;
  border-bottom: 1px dotted var(--gray);
}
.similar-toggle:hover {
  border-bottom-color: var(--secondary);
}
`

const TOP_LEVEL_SLUGS = new Set([
  "about",
  "all",
  "contact",
  "metadata",
  "tags",
  "writing/index",
])

function isIndex(slug: string | undefined): boolean {
  return !slug || slug === "index"
}

function isWritingEssay(slug: string): boolean {
  return slug.startsWith("writing/") && slug !== "writing/index"
}

function getSiblings(self: QuartzPluginData, all: QuartzPluginData[]): QuartzPluginData[] {
  const slug = self.slug
  if (!slug) return []
  if (isIndex(slug)) return []
  if (isWritingEssay(slug)) {
    return all
      .filter((f) => f.slug && isWritingEssay(f.slug))
      .slice()
      .sort((a, b) => {
        const ad = a.dates?.created?.getTime() ?? 0
        const bd = b.dates?.created?.getTime() ?? 0
        return ad - bd
      })
  }
  if (TOP_LEVEL_SLUGS.has(slug)) {
    const fixedOrder = ["about", "all", "writing/index", "metadata", "contact", "tags"]
    const inOrder: QuartzPluginData[] = []
    for (const wantSlug of fixedOrder) {
      const f = all.find((x) => x.slug === wantSlug)
      if (f) inOrder.push(f)
      else if (wantSlug === "tags") {
        inOrder.push({
          slug: "tags",
          frontmatter: { title: "Tags", tags: [] },
        } as QuartzPluginData)
      }
    }
    return inOrder
  }
  return []
}

function findPrevNext(
  self: QuartzPluginData,
  siblings: QuartzPluginData[],
): { prev: QuartzPluginData | null; next: QuartzPluginData | null } {
  const idx = siblings.findIndex((f) => f.slug === self.slug)
  if (idx < 0) return { prev: null, next: null }
  return {
    prev: idx > 0 ? siblings[idx - 1] : null,
    next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
  }
}

interface ScoredPage {
  page: QuartzPluginData
  shared: string[]
}

function getSimilarPages(self: QuartzPluginData, all: QuartzPluginData[]): ScoredPage[] {
  const tags = (self.frontmatter?.tags as string[] | undefined) ?? []
  if (tags.length === 0) return []
  const tagSet = new Set(tags)

  const scored: ScoredPage[] = []
  for (const f of all) {
    if (!f.slug) continue
    if (f.slug === self.slug) continue
    if (f.slug.startsWith("tags/")) continue
    if (f.slug === "404") continue
    const ft = (f.frontmatter?.tags as string[] | undefined) ?? []
    const shared = ft.filter((t) => tagSet.has(t))
    if (shared.length > 0) scored.push({ page: f, shared })
  }

  scored.sort((a, b) => b.shared.length - a.shared.length)
  return scored
}

const PrevNext: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  if (isIndex(fileData.slug)) return null
  const siblings = getSiblings(fileData, allFiles)
  const { prev, next } = findPrevNext(fileData, siblings)
  const similar = getSimilarPages(fileData, allFiles)
  const overflow = similar.length > VISIBLE_RELATED_BY_DEFAULT

  const linkTo = (target: QuartzPluginData) => resolveRelative(fileData.slug!, target.slug!)

  if (!prev && !next && similar.length === 0) return null

  return (
    <>
      {(prev || next) && (
        <nav class="prev-next" aria-label="Previous and next">
          <div class="pn-cell pn-prev">
            {prev && (
              <>
                <span class="pn-label">← Previous</span>
                <a class="pn-title" href={linkTo(prev)}>
                  {(prev.frontmatter?.title as string) ?? prev.slug}
                </a>
              </>
            )}
          </div>
          <div class="pn-cell pn-next">
            {next && (
              <>
                <span class="pn-label">Next →</span>
                <a class="pn-title" href={linkTo(next)}>
                  {(next.frontmatter?.title as string) ?? next.slug}
                </a>
              </>
            )}
          </div>
        </nav>
      )}
      {similar.length > 0 && (
        <div class="similar-pages" data-expanded="false">
          <span class="similar-label">Related:</span>
          {similar.map((s, i) => {
            const isExtra = i >= VISIBLE_RELATED_BY_DEFAULT
            const title = (s.page.frontmatter?.title as string) ?? s.page.slug
            return (
              <span class={`similar-entry${isExtra ? " similar-extra" : ""}`}>
                <a class="internal" href={linkTo(s.page)}>
                  {title}
                </a>
                <span class="shared-tags"> ({s.shared.join(", ")})</span>
                {i < similar.length - 1 ? ", " : null}
              </span>
            )
          })}
          {overflow && (
            <button type="button" class="similar-toggle" aria-label="Show more related">
              more
            </button>
          )}
        </div>
      )}
    </>
  )
}

PrevNext.css = css
PrevNext.afterDOMLoaded = relatedToggleScript

export default (() => PrevNext) satisfies QuartzComponentConstructor
