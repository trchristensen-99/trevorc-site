// Generates the site favicon. Edit the SVG below and rerun:
//   node scripts/make-icon.mjs
// Output: quartz/static/icon.png + quartz/static/icon.svg
import sharp from "sharp"
import { writeFileSync } from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const here = dirname(fileURLToPath(import.meta.url))
const staticDir = resolve(here, "..", "quartz", "static")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <g fill="#2b2b2b">
    <rect x="44" y="48" width="168" height="32"/>
    <rect x="112" y="48" width="32" height="160"/>
  </g>
</svg>`

await sharp(Buffer.from(svg))
  .resize(256, 256)
  .png()
  .toFile(resolve(staticDir, "icon.png"))

writeFileSync(resolve(staticDir, "icon.svg"), svg)

console.log("Wrote icon.png and icon.svg to", staticDir)
