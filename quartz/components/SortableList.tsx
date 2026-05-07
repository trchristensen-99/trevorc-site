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
    <div class="sortable-list">
      <table>
        <thead>
          <tr>
            <th data-sort="title">Title</th>
            <th data-sort="created">Published</th>
            <th data-sort="modified">Updated</th>
            <th data-sort="importance">Imp.</th>
            <th data-sort="calibrated">Calib.</th>
            <th data-sort="reading">Read</th>
            <th data-sort="backlinks">Links in</th>
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

            return (
              <tr
                data-title={title.toLowerCase()}
                data-created={created?.getTime() ?? 0}
                data-modified={modified?.getTime() ?? 0}
                data-importance={importance ?? -1}
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
                <td class="num">{importance !== null ? importance : "-"}</td>
                <td class="num">{calibrated !== null ? calibrated : "-"}</td>
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
