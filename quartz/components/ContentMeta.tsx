import { formatDate } from "./Date"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import readingTime from "reading-time"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { JSX } from "preact"
import style from "./styles/contentMeta.scss"
import { calibrate } from "../util/calibration"
import { resolveRelative, FullSlug } from "../util/path"

interface ContentMetaOptions {
  showReadingTime: boolean
  showComma: boolean
  showImportance: boolean
  showStatus: boolean
  showConfidence: boolean
  linkToAllPages: boolean
}

const defaultOptions: ContentMetaOptions = {
  showReadingTime: true,
  showComma: true,
  showImportance: true,
  showStatus: true,
  showConfidence: true,
  linkToAllPages: true,
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ALL_SLUG = "all" as FullSlug

export default ((opts?: Partial<ContentMetaOptions>) => {
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, allFiles, displayClass }: QuartzComponentProps) {
    const text = fileData.text
    if (!text) return null

    const segments: (string | JSX.Element)[] = []
    const fm = fileData.frontmatter as Record<string, unknown> | undefined

    const allHref = (sortKey: string, dir: "asc" | "desc" = "desc") => {
      if (!options.linkToAllPages) return null
      if (fileData.slug === ALL_SLUG) return null
      const base = resolveRelative(fileData.slug!, ALL_SLUG)
      return `${base}?sort=${sortKey}&dir=${dir}`
    }

    const wrap = (href: string | null, children: JSX.Element | string) =>
      href ? <a href={href} class="meta-sort-link">{children}</a> : children

    if (fileData.dates) {
      const created = fileData.dates.created
      const modified = fileData.dates.modified
      const sameDay =
        created && modified && Math.abs(created.getTime() - modified.getTime()) < ONE_DAY_MS

      if (!modified || sameDay) {
        segments.push(
          <span>
            {wrap(
              allHref("created"),
              <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>,
            )}
          </span>,
        )
      } else {
        segments.push(
          <span>
            Published{" "}
            {wrap(
              allHref("created"),
              <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>,
            )}
          </span>,
        )
        segments.push(
          <span>
            Updated{" "}
            {wrap(
              allHref("modified"),
              <time datetime={modified.toISOString()}>{formatDate(modified, cfg.locale)}</time>,
            )}
          </span>,
        )
      }
    }

    if (options.showReadingTime) {
      const { minutes } = readingTime(text)
      const displayedTime = i18n(cfg.locale).components.contentMeta.readingTime({
        minutes: Math.ceil(minutes),
      })
      segments.push(<span>{wrap(allHref("reading"), displayedTime)}</span>)
    }

    if (options.showImportance && typeof fm?.importance === "number") {
      const cal = calibrate(allFiles, fileData)
      if (cal && cal.total >= 10 && cal.bucket !== cal.raw) {
        segments.push(
          <span class="meta-importance">
            {wrap(allHref("importance"), `importance ${cal.raw}`)}
            {" ("}
            {wrap(allHref("calibrated"), `calibrated ${cal.bucket}/10`)}
            {", "}
            {`rank ${cal.rank} of ${cal.total}`}
            {")"}
          </span>,
        )
      } else if (cal) {
        segments.push(
          <span class="meta-importance">
            {wrap(allHref("importance"), `importance ${cal.raw}/10`)}
            {` (rank ${cal.rank} of ${cal.total})`}
          </span>,
        )
      } else {
        segments.push(
          <span class="meta-importance">
            {wrap(allHref("importance"), `importance ${fm.importance}/10`)}
          </span>,
        )
      }
    }

    if (options.showStatus && typeof fm?.status === "string") {
      segments.push(<span class="meta-status">{fm.status}</span>)
    }

    if (options.showConfidence && typeof fm?.confidence === "string") {
      segments.push(<span class="meta-confidence">confidence: {fm.confidence}</span>)
    }

    return (
      <p show-comma={options.showComma} class={classNames(displayClass, "content-meta")}>
        {segments}
      </p>
    )
  }

  ContentMetadata.css = style

  return ContentMetadata
}) satisfies QuartzComponentConstructor
