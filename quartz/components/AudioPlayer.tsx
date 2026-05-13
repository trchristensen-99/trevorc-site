import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/audioPlayer.inline"

const css = `
.audio-player {
  margin: 0.5rem 0 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Closed: just a small icon button, visually matched to the dark-mode and
   hamburger buttons. The full player is hidden. */
.audio-player[data-expanded="false"] .audio-player-full { display: none; }
.audio-player[data-expanded="true"] .audio-player-launch { display: none; }

.audio-player-launch {
  background: transparent;
  border: 1px solid var(--gray);
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--darkgray);
  width: 2rem;
  height: 2rem;
  padding: 0;
}
.audio-player-launch:hover {
  color: var(--secondary);
  border-color: var(--secondary);
}
.audio-player-launch svg {
  width: 1.1rem;
  height: 1.1rem;
}

.audio-player-full {
  width: 100%;
  background: var(--lightgray);
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
}
.audio-player-full audio {
  width: 100%;
  display: block;
  height: 36px;
}
.audio-player-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}
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
.audio-player-close {
  background: transparent;
  border: 1px solid var(--gray);
  color: var(--darkgray);
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  font-size: 1em;
  line-height: 1;
}
.audio-player-close:hover {
  color: var(--secondary);
  border-color: var(--secondary);
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
      <button
        type="button"
        class="audio-player-launch"
        aria-label="Play audio narration"
        aria-expanded="false"
        aria-controls="audio-player-full"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1z" />
          <path d="M16 8a5 5 0 0 1 0 8" />
          <path d="M19 5a9 9 0 0 1 0 14" />
        </svg>
      </button>
      <div class="audio-player-full" id="audio-player-full">
        <audio controls preload="metadata" src={src} />
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
          <button
            type="button"
            class="audio-player-close"
            aria-label="Close audio player"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

AudioPlayer.css = css
AudioPlayer.afterDOMLoaded = script

export default (() => AudioPlayer) satisfies QuartzComponentConstructor
