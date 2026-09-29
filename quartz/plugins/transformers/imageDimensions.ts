import path from "path"
import fs from "fs"
import sharp from "sharp"
import { visit } from "unist-util-visit"
import { Root, Element } from "hast"
import { QuartzTransformerPlugin } from "../types"
import { QUARTZ } from "../../util/path"

// Stamp intrinsic width/height onto local <img> tags at build time.
//
// Without them the browser has no idea how tall an image will be until
// the bytes arrive, so it reserves zero height and then expands the
// box on load -- shoving everything below it down the page. With
// loading="lazy" that happens *while the reader is scrolling toward
// it*, which reads as the page lurching under your cursor. The
// image-heavy Greece/Rome essay measured a cumulative layout shift of
// 0.78 (anything over 0.25 is "poor").
//
// Setting width/height lets the browser compute the aspect ratio and
// reserve a correctly-sized box up front. The CSS still controls the
// rendered size (width: 100%; height: auto), so these attributes only
// supply the ratio.

const dimCache = new Map<string, { width: number; height: number } | null>()

async function dimensionsFor(src: string): Promise<{ width: number; height: number } | null> {
  if (dimCache.has(src)) return dimCache.get(src)!
  let result: { width: number; height: number } | null = null
  // Content references static assets as .../static/foo.png; they live
  // in quartz/static regardless of how deep the page is.
  const idx = src.indexOf("static/")
  if (idx !== -1) {
    const rel = src.slice(idx + "static/".length).split("?")[0].split("#")[0]
    const file = path.join(QUARTZ, "static", decodeURIComponent(rel))
    if (fs.existsSync(file)) {
      try {
        const meta = await sharp(file).metadata()
        if (meta.width && meta.height) result = { width: meta.width, height: meta.height }
      } catch {
        /* unreadable or unsupported format: leave it alone */
      }
    }
  }
  dimCache.set(src, result)
  return result
}

export const ImageDimensions: QuartzTransformerPlugin = () => ({
  name: "ImageDimensions",
  htmlPlugins() {
    return [
      () => async (tree: Root, _file) => {
        const targets: Element[] = []
        visit(tree, "element", (node: Element) => {
          if (node.tagName !== "img") return
          const props = node.properties ?? {}
          const src = typeof props.src === "string" ? props.src : ""
          if (!src || /^(https?:)?\/\//.test(src) || src.startsWith("data:")) return
          if (props.width != null && props.height != null) return
          targets.push(node)
        })
        for (const node of targets) {
          const src = node.properties!.src as string
          const dim = await dimensionsFor(src)
          if (!dim) continue
          node.properties!.width = dim.width
          node.properties!.height = dim.height
        }
      },
    ]
  },
})
