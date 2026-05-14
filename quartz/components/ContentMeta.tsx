import { formatDate } from "./Date"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import readingTime from "reading-time"
import { classNames } from "../util/lang"
import { JSX } from "preact"
import style from "./styles/contentMeta.scss"
import { calibrate } from "../util/calibration"
import { resolveRelative, FullSlug } from "../util/path"
import audioScript from "./scripts/audioPlayer.inline"

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
const META_SLUG = "metadata" as FullSlug
const TAGS_SLUG = "tags" as FullSlug

function slugAnchor(slug: string): string {
  return slug.replace(/\//g, "--")
}

function parseAudio(raw: unknown): string | null {
  if (typeof raw === "string") return raw
  if (typeof raw === "object" && raw !== null && "src" in raw) {
    const obj = raw as { src: unknown }
    if (typeof obj.src === "string") return obj.src
  }
  return null
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, allFiles, displayClass }: QuartzComponentProps) {
    const text = fileData.text
    if (!text) return null

    const segments: (string | JSX.Element)[] = []
    const fm = fileData.frontmatter as Record<string, unknown> | undefined

    // Value link: jumps to /all sorted by the matching key, with the source
    // page anchored.
    const valueHref = (sortKey: string, dir: "asc" | "desc") => {
      if (!options.linkToAllPages) return null
      if (fileData.slug === ALL_SLUG) return null
      const base = resolveRelative(fileData.slug!, ALL_SLUG)
      const anchor = slugAnchor(fileData.slug!)
      return `${base}?sort=${sortKey}&dir=${dir}#${anchor}`
    }
    // Label link: jumps to /metadata with the corresponding heading anchored.
    const labelHref = (anchor: string) => {
      if (fileData.slug === META_SLUG) return null
      return `${resolveRelative(fileData.slug!, META_SLUG)}#${anchor}`
    }
    const tagsLabelHref = () => {
      if (fileData.slug === TAGS_SLUG) return null
      return resolveRelative(fileData.slug!, TAGS_SLUG)
    }

    const labelLink = (href: string | null, t: string) =>
      href ? (
        <a href={href} class="meta-label-link">
          {t}
        </a>
      ) : (
        <span>{t}</span>
      )
    const valueLink = (href: string | null, t: string | JSX.Element) =>
      href ? (
        <a href={href} class="meta-value-link">
          {t}
        </a>
      ) : (
        <span>{t}</span>
      )

    if (fileData.dates) {
      const created = fileData.dates.created
      const modified = fileData.dates.modified
      const sameDay =
        created && modified && Math.abs(created.getTime() - modified.getTime()) < ONE_DAY_MS

      if (!modified || sameDay) {
        segments.push(
          <span>
            {labelLink(labelHref("published"), "Published")}{" "}
            {valueLink(
              valueHref("created", "desc"),
              <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>,
            )}
          </span>,
        )
      } else {
        segments.push(
          <span>
            {labelLink(labelHref("published"), "Published")}{" "}
            {valueLink(
              valueHref("created", "desc"),
              <time datetime={created.toISOString()}>{formatDate(created, cfg.locale)}</time>,
            )}
          </span>,
        )
        segments.push(
          <span>
            {labelLink(labelHref("updated"), "Updated")}{" "}
            {valueLink(
              valueHref("modified", "desc"),
              <time datetime={modified.toISOString()}>{formatDate(modified, cfg.locale)}</time>,
            )}
          </span>,
        )
      }
    }

    if (options.showReadingTime) {
      const { minutes } = readingTime(text)
      const min = Math.ceil(minutes)
      segments.push(
        <span>
          {valueLink(valueHref("reading", "asc"), `${min} min`)}{" "}
          {labelLink(labelHref("reading-time"), "read")}
        </span>,
      )
    }

    if (options.showImportance && typeof fm?.importance === "number") {
      const cal = calibrate(allFiles, fileData)
      if (cal) {
        segments.push(
          <span class="meta-importance">
            {labelLink(labelHref("importance"), "importance")}{" "}
            {valueLink(valueHref("importance", "desc"), `${cal.bucket}/10`)}
            {` (rank ${cal.rank} of ${cal.total})`}
          </span>,
        )
      } else {
        segments.push(
          <span class="meta-importance">
            {labelLink(labelHref("importance"), "importance")}{" "}
            {valueLink(valueHref("importance", "desc"), `${fm.importance}/10`)}
          </span>,
        )
      }
    }

    // Audio launch icon as an inline segment (no text label; the icon itself
    // is the click target for opening the player).
    const audioSrc = parseAudio(fm?.audio)
    if (audioSrc) {
      segments.push(
        <span class="meta-audio">
          <button
            type="button"
            class="audio-player-launch"
            aria-label="Play audio narration"
            aria-expanded="false"
            aria-controls="audio-player-full"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1z" />
              <path d="M16 8a5 5 0 0 1 0 8" />
              <path d="M19 5a9 9 0 0 1 0 14" />
            </svg>
          </button>
        </span>,
      )
    }

    // Tags as an inline "Tags: x, y, z" segment. The label links to the
    // /tags index page; each tag links to its own page.
    const tags = fm?.tags as string[] | undefined
    if (tags && tags.length > 0) {
      segments.push(
        <span class="meta-tags">
          {labelLink(tagsLabelHref(), "Tags")}
          {": "}
          {tags.map((t, i) => (
            <>
              <a
                class="meta-tag-link"
                href={resolveRelative(fileData.slug!, `tags/${t}` as FullSlug)}
              >
                {t}
              </a>
              {i < tags.length - 1 ? ", " : null}
            </>
          ))}
        </span>,
      )
    }

    return (
      <div
        class={classNames(displayClass, "content-meta-block")}
        data-audio-key={fileData.slug}
        data-expanded="false"
      >
        <p show-comma={options.showComma} class="content-meta">
          {segments}
        </p>
        {audioSrc && (
          <div class="audio-player-full">
            <audio controls preload="metadata" src={audioSrc} />
            <div class="audio-player-toolbar">
              <button type="button" data-action="back15" aria-label="Back 15 seconds">
                {"⏪"} 15s
              </button>
              <button type="button" data-action="fwd15" aria-label="Forward 15 seconds">
                15s {"⏩"}
              </button>
              <select data-action="speed" aria-label="Playback speed">
                <option value="0.75">0.75x</option>
                <option value="1" selected>
                  1x
                </option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="1.75">1.75x</option>
                <option value="2">2x</option>
              </select>
              <span class="audio-player-status"></span>
              <button type="button" class="audio-player-close" aria-label="Close audio player">
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  ContentMetadata.css = style
  ContentMetadata.afterDOMLoaded = audioScript

  return ContentMetadata
}) satisfies QuartzComponentConstructor
