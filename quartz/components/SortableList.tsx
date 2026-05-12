import { resolveRelative } from "../util/path"
import { QuartzPluginData } from "../plugins/vfile"
import { formatDate } from "./Date"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import readingTime from "reading-time"
import sortableScript from "./scripts/sortable.inline"
import style from "./styles/sortable.scss"
import { calibrate } from "../util/calibration"

interface Props extends QuartzComponentProps {
  pages?: QuartzPluginData[]
}

function slugAnchor(slug: string): string {
  return slug.replace(/\//g, "--")
}

const SortableList: QuartzComponent = ({ cfg, fileData, allFiles, pages }: Props) => {
  const list = pages ?? allFiles

  const backlinkCounts = new Map<string, number>()
  for (const f of allFiles) {
    if (!f.links) continue
    for (const link of f.links) {
      backlinkCounts.set(link as string, (backlinkCounts.get(link as string) ?? 0) + 1)
    }
  }

  if (list.length === 0) return null

  return (
    <div class="sortable-list" data-importance-mode="calibrated">
      <table>
        <thead>
          <tr>
            <th data-sort="title">Title</th>
            <th data-sort="created" data-default-dir="desc">Published</th>
            <th data-sort="modified" data-default-dir="desc">Updated</th>
            <th data-sort="importance" data-default-dir="desc" class="th-importance">
              Importance
              <span class="importance-toggle" role="group" aria-label="Importance view">
                <button type="button" data-mode="raw" aria-pressed="false">
                  raw
                </button>
                <button type="button" data-mode="calibrated" aria-pressed="true">
                  calibrated
                </button>
              </span>
            </th>
            <th data-sort="reading" data-default-dir="asc">Read time</th>
            <th data-sort="backlinks" data-default-dir="desc">Links in</th>
          </tr>
        </thead>
        <tbody>
          {list.map((page) => {
            const fm = (page.frontmatter ?? {}) as Record<string, unknown>
            const title = (fm.title as string) ?? page.slug ?? "untitled"
            const created = page.dates?.created
            const modified = page.dates?.modified
            const importance = typeof fm.importance === "number" ? fm.importance : null
            const cal = calibrate(allFiles, page)
            const calibrated = cal ? cal.bucket : null
            const minutes = page.text ? Math.ceil(readingTime(page.text).minutes) : 0
            const linksIn = backlinkCounts.get(page.slug as string) ?? 0
            const anchor = slugAnchor(page.slug ?? "")

            return (
              <tr
                id={anchor}
                data-slug={page.slug}
                data-title={title.toLowerCase()}
                data-created={created?.getTime() ?? 0}
                data-modified={modified?.getTime() ?? 0}
                data-raw={importance ?? -1}
                data-calibrated={calibrated ?? -1}
                data-reading={minutes}
                data-backlinks={linksIn}
              >
                <td class="title">
                  <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal">
                    {title}
                  </a>
                </td>
                <td>{created ? formatDate(created, cfg.locale) : "-"}</td>
                <td>{modified ? formatDate(modified, cfg.locale) : "-"}</td>
                <td class="num imp-cell" data-raw-text={importance ?? "-"} data-calibrated-text={calibrated ?? "-"}>
                  {calibrated !== null ? calibrated : "-"}
                </td>
                <td class="num">{minutes ? `${minutes}m` : "-"}</td>
                <td class="num">{linksIn || "-"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

SortableList.css = style
SortableList.afterDOMLoaded = sortableScript

export default (() => SortableList) satisfies QuartzComponentConstructor
