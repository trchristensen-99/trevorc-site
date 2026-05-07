import { formatDate } from "./Date"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import readingTime from "reading-time"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { JSX } from "preact"
import style from "./styles/contentMeta.scss"

interface ContentMetaOptions {
  showReadingTime: boolean
  showComma: boolean
  showImportance: boolean
  showStatus: boolean
  showConfidence: boolean
}

const defaultOptions: ContentMetaOptions = {
  showReadingTime: true,
  showComma: true,
  showImportance: true,
  showStatus: true,
  showConfidence: true,
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export default ((opts?: Partial<ContentMetaOptions>) => {
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, displayClass }: QuartzComponentProps) {
    const text = fileData.text
    if (!text) return null

    const segments: (string | JSX.Element)[] = []
    const fm = fileData.frontmatter as Record<string, unknown> | undefined

    if (fileData.dates) {
      const created = fileData.dates.created
      const modified = fileData.dates.modified
      const sameDay =
        created && modified && Math.abs(created.getTime() - modified.getTime()) < ONE_DAY_MS

      if (!modified || sameDay) {
        segments.push(
          <span>
            <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>
          </span>,
        )
      } else {
        segments.push(
          <span>
            Published{" "}
            <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>
          </span>,
        )
        segments.push(
          <span>
            Updated{" "}
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
      segments.push(<span>{displayedTime}</span>)
    }

    if (options.showImportance && typeof fm?.importance === "number") {
      segments.push(<span class="meta-importance">importance {fm.importance}/10</span>)
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
