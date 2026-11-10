import fs from "node:fs"
import path from "node:path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/backlinks.scss"
import { classNames } from "../util/lang"

// Links from a post to its technologies on the tech tree, from the ids
// listed under `tech:` in its front matter. The tree links back
// (projects/tech-tree/prep/build.mjs).
let names: Map<string, string> | null = null
const nameOf = (id: string) => {
  if (!names) {
    names = new Map()
    try {
      const tree = JSON.parse(fs.readFileSync(path.join("projects", "tech-tree", "data", "tree.json"), "utf8"))
      for (const n of tree.nodes ?? []) names.set(n.id, n.name)
    } catch {
      /* no tree built */
    }
  }
  return names.get(id)
}

export default (() => {
  const TechTreeLinks: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const ids = ([] as unknown[]).concat(fileData.frontmatter?.tech ?? []).map(String)
    const items = ids.map((id) => [id, nameOf(id)] as const).filter(([, n]) => n)
    if (!items.length) return null
    return (
      <div class={classNames(displayClass, "backlinks", "tech-tree-links")}>
        <h3>On the tech tree</h3>
        <ul class="backlinks-list">
          {items.map(([id, name]) => (
            <li>
              <a href={`/apps/tech-tree/#n=${id}`}>{name}</a>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  TechTreeLinks.css = style
  return TechTreeLinks
}) satisfies QuartzComponentConstructor
