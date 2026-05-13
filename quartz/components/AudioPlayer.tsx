import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/audioPlayer.inline"

const css = `
.audio-player {
  margin: 0.75rem 0 1rem;
  background: var(--lightgray);
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
}
.audio-player audio {
  width: 100%;
  display: block;
  height: 32px;
}
.audio-player-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.audio-player-row audio {
  flex: 1;
  min-width: 0;
}
.audio-player-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}
.audio-player[data-expanded="false"] .audio-player-toolbar { display: none; }

.audio-player-toolbar button,
.audio-player-toolbar select {
  background: transparent;
  border: 1px solid var(--gray);
  color: var(--darkgray);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 0.85em;
  line-height: 1.3;
}
.audio-player-toolbar button:hover,
.audio-player-toolbar select:hover {
  border-color: var(--secondary);
  color: var(--secondary);
}
.audio-player-status {
  font-size: 0.85em;
  color: var(--darkgray);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.audio-player-expand {
  background: transparent;
  border: 1px solid var(--gray);
  color: var(--darkgray);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 0.85em;
  flex-shrink: 0;
}
.audio-player-expand:hover {
  border-color: var(--secondary);
  color: var(--secondary);
}
`

const AudioPlayer: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const fm = fileData.frontmatter as Record<string, unknown> | undefined
  const raw = fm?.audio
  if (!raw) return null

  let src: string
  if (typeof raw === "string") {
    src = raw
  } else if (typeof raw === "object" && raw !== null && "src" in raw) {
    const obj = raw as { src: unknown }
    if (typeof obj.src !== "string") return null
    src = obj.src
  } else {
    return null
  }

  return (
    <div class="audio-player" data-audio-key={fileData.slug} data-expanded="false">
      <div class="audio-player-row">
        <audio controls preload="metadata" src={src} />
        <button
          type="button"
          class="audio-player-expand"
          aria-label="Toggle extra audio controls"
          aria-expanded="false"
        >
          more
        </button>
      </div>
      <div class="audio-player-toolbar">
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
    </div>
  )
}

AudioPlayer.css = css
AudioPlayer.afterDOMLoaded = script

export default (() => AudioPlayer) satisfies QuartzComponentConstructor
