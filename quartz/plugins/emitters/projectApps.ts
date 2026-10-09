// Builds the self-contained interactive apps under projects/<name>/ and
// emits each one to /apps/<name>/ (a separate tree, so an app's
// directory can't collide with its project page at /projects/<name>). The app's TypeScript entry
// (src/main.ts) is bundled with esbuild, which Quartz already depends on,
// so apps ship with the ordinary site build: no extra Cloudflare build
// step and no committed build output.
//
// Apps are embedded in their project page with an iframe rather than
// mounted as Quartz components. Quartz concatenates every inline script
// into one expression (a single throw stops all later scripts), swaps
// the page body on SPA navigation (which would strand a running map and
// its listeners), and its global CSS leaks into anything on the page.
// An iframe isolates the app from all three.
//
// Layout of a project directory:
//   src/main.ts      entry point; CSS it imports is emitted as main.css
//   index.html       app shell, copied as-is
//   data/**          prebuilt data files, copied as-is

import fs from "fs"
import path from "path"
import { build } from "esbuild"
import { FilePath, joinSegments } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"

const PROJECTS_DIR = "projects"

async function* copyTree(src: string, dest: string): AsyncGenerator<FilePath> {
  for (const entry of await fs.promises.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      yield* copyTree(from, to)
    } else {
      await fs.promises.mkdir(path.dirname(to), { recursive: true })
      await fs.promises.copyFile(from, to)
      yield to as FilePath
    }
  }
}

export const ProjectApps: QuartzEmitterPlugin = () => ({
  name: "ProjectApps",
  async *emit({ argv }) {
    if (!fs.existsSync(PROJECTS_DIR)) return
    for (const name of await fs.promises.readdir(PROJECTS_DIR)) {
      const dir = path.join(PROJECTS_DIR, name)
      const entry = path.join(dir, "src", "main.ts")
      if (!fs.existsSync(entry)) continue

      const out = joinSegments(argv.output, "apps", name)
      await fs.promises.mkdir(out, { recursive: true })

      const result = await build({
        entryPoints: [entry],
        outfile: path.join(out, "main.js"),
        bundle: true,
        minify: true,
        format: "esm",
        target: "es2020",
        metafile: true,
        logLevel: "error",
      })
      for (const file of Object.keys(result.metafile.outputs)) yield file as FilePath

      const shell = path.join(dir, "index.html")
      if (fs.existsSync(shell)) {
        const dest = path.join(out, "index.html")
        await fs.promises.copyFile(shell, dest)
        yield dest as FilePath
      }
      const data = path.join(dir, "data")
      if (fs.existsSync(data)) yield* copyTree(data, path.join(out, "data"))
    }
  },
  async *partialEmit() {},
})
