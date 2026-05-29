import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import breadcrumbsStyle from "./styles/breadcrumbs.scss"
import breadcrumbsScript from "./scripts/breadcrumbsToggle.inline"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../util/path"
import { classNames } from "../util/lang"
import { trieFromAllFiles } from "../util/ctx"

type CrumbData = {
  displayName: string
  path: string
}

interface BreadcrumbOptions {
  /**
   * Symbol between crumbs
   */
  spacerSymbol: string
  /**
   * Name of first crumb
   */
  rootName: string
  /**
   * Whether to look up frontmatter title for folders (could cause performance problems with big vaults)
   */
  resolveFrontmatterTitle: boolean
  /**
   * Whether to display the current page in the breadcrumbs.
   */
  showCurrentPage: boolean
}

const defaultOptions: BreadcrumbOptions = {
  spacerSymbol: "❯",
  rootName: "Home",
  resolveFrontmatterTitle: true,
  showCurrentPage: true,
}

function formatCrumb(displayName: string, baseSlug: FullSlug, currentSlug: SimpleSlug): CrumbData {
  return {
    displayName: displayName.replaceAll("-", " "),
    path: resolveRelative(baseSlug, currentSlug),
  }
}

export default ((opts?: Partial<BreadcrumbOptions>) => {
  const options: BreadcrumbOptions = { ...defaultOptions, ...opts }
  const Breadcrumbs: QuartzComponent = ({
    fileData,
    allFiles,
    displayClass,
    ctx,
  }: QuartzComponentProps) => {
    const trie = (ctx.trie ??= trieFromAllFiles(allFiles))
    const slugParts = fileData.slug!.split("/")
    const pathNodes = trie.ancestryChain(slugParts)

    let crumbs: CrumbData[]
    if (pathNodes) {
      crumbs = pathNodes.map((node, idx) => {
        const crumb = formatCrumb(node.displayName, fileData.slug!, simplifySlug(node.slug))
        if (idx === 0) crumb.displayName = options.rootName
        if (idx === pathNodes.length - 1) crumb.path = ""
        return crumb
      })
    } else {
      // Fallback for pages not in the parsed-file trie (e.g., auto-generated
      // tag pages). Build the breadcrumb chain from the slug parts directly.
      // Drop a trailing "index" segment so /tags/index renders as
      // "Home ❯ tags" rather than "Home ❯ tags ❯ index".
      const cleanedParts = slugParts.slice()
      if (cleanedParts[cleanedParts.length - 1] === "index") cleanedParts.pop()
      crumbs = [
        {
          displayName: options.rootName,
          path: resolveRelative(fileData.slug!, "" as SimpleSlug),
        },
      ]
      for (let i = 0; i < cleanedParts.length; i++) {
        const part = cleanedParts[i]
        const isLast = i === cleanedParts.length - 1
        const partSlug = cleanedParts.slice(0, i + 1).join("/") as SimpleSlug
        crumbs.push({
          displayName: part.replaceAll("-", " "),
          path: isLast ? "" : resolveRelative(fileData.slug!, partSlug),
        })
      }
    }

    if (!options.showCurrentPage) {
      crumbs.pop()
    }

    return (
      <nav
        class={classNames(displayClass, "breadcrumb-container")}
        aria-label="breadcrumbs"
        data-minimized="false"
      >
        <button
          type="button"
          class="breadcrumb-toggle breadcrumb-show"
          aria-label="Show breadcrumbs"
          title="Show breadcrumbs"
        >
          ❯
        </button>
        {crumbs.map((crumb, index) => (
          <div class="breadcrumb-element">
            <a href={crumb.path}>{crumb.displayName}</a>
            {index !== crumbs.length - 1 && <p>{` ${options.spacerSymbol} `}</p>}
          </div>
        ))}
        <button
          type="button"
          class="breadcrumb-toggle breadcrumb-hide"
          aria-label="Hide breadcrumbs"
          title="Hide breadcrumbs"
        >
          −
        </button>
      </nav>
    )
  }
  Breadcrumbs.css = breadcrumbsStyle
  Breadcrumbs.afterDOMLoaded = breadcrumbsScript

  return Breadcrumbs
}) satisfies QuartzComponentConstructor
