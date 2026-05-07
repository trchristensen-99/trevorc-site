import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const css = `
.audio-player {
  margin: 1rem 0 1.5rem;
}
.audio-player audio {
  width: 100%;
}
.audio-player .audio-meta {
  font-size: 0.85em;
  color: var(--darkgray);
  margin-top: 0.25rem;
}
`

const AudioPlayer: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const fm = fileData.frontmatter as Record<string, unknown> | undefined
  const raw = fm?.audio
  if (!raw) return null

  let src: string
  let label: string | undefined
  if (typeof raw === "string") {
    src = raw
  } else if (typeof raw === "object" && raw !== null && "src" in raw) {
    const obj = raw as { src: unknown; label?: unknown }
    if (typeof obj.src !== "string") return null
    src = obj.src
    if (typeof obj.label === "string") label = obj.label
  } else {
    return null
  }

  return (
    <div class="audio-player">
      <audio controls preload="metadata" src={src} />
      {label && <p class="audio-meta">{label}</p>}
    </div>
  )
}

AudioPlayer.css = css

export default (() => AudioPlayer) satisfies QuartzComponentConstructor
