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
  linkToAllPages: boolean
}

const defaultOptions: ContentMetaOptions = {
  showReadingTime: true,
  showComma: true,
  showImportance: true,
  linkToAllPages: true,
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ALL_SLUG = "all" as FullSlug

function slugAnchor(slug: string): string {
  return slug.replace(/\//g, "--")
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, allFiles, displayClass }: QuartzComponentProps) {
    const text = fileData.text
    if (!text) return null

    const segments: (string | JSX.Element)[] = []
    const fm = fileData.frontmatter as Record<string, unknown> | undefined

    const allHref = (sortKey: string, dir: "asc" | "desc") => {
      if (!options.linkToAllPages) return null
      if (fileData.slug === ALL_SLUG) return null
      const base = resolveRelative(fileData.slug!, ALL_SLUG)
      const anchor = slugAnchor(fileData.slug!)
      return `${base}?sort=${sortKey}&dir=${dir}#${anchor}`
    }

    const link = (href: string | null, text: string) =>
      href ? (
        <a href={href} class="meta-sort-link">
          {text}
        </a>
      ) : (
        <>{text}</>
      )

    if (fileData.dates) {
      const created = fileData.dates.created
      const modified = fileData.dates.modified
      const sameDay =
        created && modified && Math.abs(created.getTime() - modified.getTime()) < ONE_DAY_MS

      if (!modified || sameDay) {
        segments.push(
          <span>
            {link(allHref("created", "desc"), "Published")}{" "}
            <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>
          </span>,
        )
      } else {
        segments.push(
          <span>
            {link(allHref("created", "desc"), "Published")}{" "}
            <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>
          </span>,
        )
        segments.push(
          <span>
            {link(allHref("modified", "desc"), "Updated")}{" "}
            <time datetime={modified.toISOString()}>{formatDate(modified, cfg.locale)}</time>
          </span>,
        )
      }
    }

    if (options.showReadingTime) {
      const { minutes } = readingTime(text)
      const displayedTime = i18n(cfg.locale).components.contentMeta.readingTime({
        minutes: Math.ceil(minutes),
      })
      segments.push(<span>{link(allHref("reading", "asc"), displayedTime)}</span>)
    }

    if (options.showImportance && typeof fm?.importance === "number") {
      const cal = calibrate(allFiles, fileData)
      if (cal && cal.total >= 10 && cal.bucket !== cal.raw) {
        segments.push(
          <span class="meta-importance">
            {link(allHref("importance", "desc"), `importance ${cal.raw}`)}
            {" ("}
            {link(allHref("calibrated", "desc"), `calibrated ${cal.bucket}/10`)}
            {`, rank ${cal.rank} of ${cal.total})`}
          </span>,
        )
      } else if (cal) {
        segments.push(
          <span class="meta-importance">
            {link(allHref("importance", "desc"), `importance ${cal.raw}/10`)}
            {` (rank ${cal.rank} of ${cal.total})`}
          </span>,
        )
      } else {
        segments.push(
          <span class="meta-importance">
            {link(allHref("importance", "desc"), `importance ${fm.importance}/10`)}
          </span>,
        )
      }
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
