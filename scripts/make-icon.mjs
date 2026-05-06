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
    <rect x="32" y="50" width="192" height="36"/>
    <rect x="108" y="50" width="40" height="160"/>
    <rect x="80" y="194" width="96" height="20"/>
  </g>
</svg>`

await sharp(Buffer.from(svg))
  .resize(256, 256)
  .png()
  .toFile(resolve(staticDir, "icon.png"))

writeFileSync(resolve(staticDir, "icon.svg"), svg)

console.log("Wrote icon.png and icon.svg to", staticDir)
