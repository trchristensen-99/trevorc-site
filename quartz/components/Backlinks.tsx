import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/backlinks.scss"
import { resolveRelative, simplifySlug } from "../util/path"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"
import backlinksScript from "./scripts/backlinksToggle.inline"

interface BacklinksOptions {
  hideWhenEmpty: boolean
  visibleByDefault: number
}

const defaultOptions: BacklinksOptions = {
  hideWhenEmpty: true,
  visibleByDefault: 3,
}

export default ((opts?: Partial<BacklinksOptions>) => {
  const options: BacklinksOptions = { ...defaultOptions, ...opts }

  const Backlinks: QuartzComponent = ({
    fileData,
    allFiles,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    const slug = simplifySlug(fileData.slug!)
    const backlinkFiles = allFiles
      .filter((file) => file.links?.includes(slug))
      .slice()
      .sort((a, b) => {
        const ad = a.dates?.modified?.getTime() ?? 0
        const bd = b.dates?.modified?.getTime() ?? 0
        return bd - ad
      })
    if (options.hideWhenEmpty && backlinkFiles.length === 0) {
      return null
    }
    const overflow = backlinkFiles.length > options.visibleByDefault
    return (
      <div class={classNames(displayClass, "backlinks")} data-expanded="false">
        <h3>{i18n(cfg.locale).components.backlinks.title}</h3>
        <ul class="backlinks-list">
          {backlinkFiles.length > 0 ? (
            backlinkFiles.map((f, i) => (
              <li class={i >= options.visibleByDefault ? "backlink-extra" : ""}>
                <a href={resolveRelative(fileData.slug!, f.slug!)} class="internal">
                  {f.frontmatter?.title}
                </a>
              </li>
            ))
          ) : (
            <li>{i18n(cfg.locale).components.backlinks.noBacklinksFound}</li>
          )}
        </ul>
        {overflow && (
          <button type="button" class="backlinks-toggle" aria-label="Show more backlinks">
            more
          </button>
        )}
      </div>
    )
  }

  Backlinks.css = style
  Backlinks.afterDOMLoaded = backlinksScript

  return Backlinks
}) satisfies QuartzComponentConstructor
