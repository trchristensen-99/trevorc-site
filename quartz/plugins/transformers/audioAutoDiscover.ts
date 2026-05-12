// Auto-discovers per-essay audio narrations by convention.
//
// For each Markdown file, if its frontmatter does not set `audio`, the plugin
// checks for an MP3 at:
//
//   quartz/static/audio-narrations/<slug-with-slashes-replaced-by-dashes>.mp3
//
// If found, sets the frontmatter `audio` field to the corresponding URL
// (/static/audio-narrations/<file>.mp3) so the AudioPlayer component renders.
// An explicit `audio: false` opts out; an explicit `audio: <something>` is
// respected unchanged.
import { existsSync } from "fs"
import { resolve } from "path"
import { QuartzTransformerPlugin } from "../types"

const AUDIO_DIR_REL = "quartz/static/audio-narrations"

export const AudioAutoDiscover: QuartzTransformerPlugin = () => ({
  name: "AudioAutoDiscover",
  markdownPlugins() {
    return [
      () => {
        return (_, file) => {
          const fm = file.data.frontmatter as Record<string, unknown> | undefined
          if (!fm) return
          if (fm.audio !== undefined) return

          const slug = file.data.slug as string | undefined
          if (!slug) return
          if (slug === "all" || slug.startsWith("tags/")) return

          const filename = slug.replace(/\//g, "--") + ".mp3"
          const fullPath = resolve(process.cwd(), AUDIO_DIR_REL, filename)
          if (existsSync(fullPath)) {
            fm.audio = `/static/audio-narrations/${filename}`
          }
        }
      },
    ]
  },
})
