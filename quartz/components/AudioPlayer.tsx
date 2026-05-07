import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/audioPlayer.inline"

const css = `
.audio-player {
  margin: 1rem 0 1.5rem;
  background: var(--lightgray);
  border-radius: 6px;
  padding: 0.75rem 0.9rem 0.6rem;
}
.audio-player audio {
  width: 100%;
  display: block;
}
.audio-player-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}
.audio-player-controls button,
.audio-player-controls select {
  background: transparent;
  border: 1px solid var(--gray);
  color: var(--darkgray);
  padding: 0.25rem 0.55rem;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 0.85em;
  line-height: 1.4;
}
.audio-player-controls button:hover,
.audio-player-controls select:hover {
  border-color: var(--secondary);
  color: var(--secondary);
}
.audio-player-status {
  font-size: 0.85em;
  color: var(--darkgray);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
.audio-player .audio-meta {
  font-size: 0.85em;
  color: var(--darkgray);
  margin: 0.4rem 0 0;
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
    <div class="audio-player" data-audio-key={fileData.slug}>
      <audio controls preload="metadata" src={src} />
      <div class="audio-player-controls">
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
      </div>
      {label && <p class="audio-meta">{label}</p>}
    </div>
  )
}

AudioPlayer.css = css
AudioPlayer.afterDOMLoaded = script

export default (() => AudioPlayer) satisfies QuartzComponentConstructor
