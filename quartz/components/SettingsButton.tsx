import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import settingsScript from "./scripts/settings.inline"

const css = `
.settings {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.settings-button {
  background: transparent;
  border: 1px solid var(--gray);
  border-radius: 4px;
  padding: 0.35rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--darkgray);
  width: 2rem;
  height: 2rem;
  line-height: 1;
}
.settings-button:hover {
  color: var(--secondary);
  border-color: var(--secondary);
}
.settings-button svg {
  width: 1.1rem;
  height: 1.1rem;
}

.settings-panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 100;
  /* Cap absolute width so the panel stays in the viewport at high text
     zoom (where 15rem would otherwise balloon past the screen). */
  width: min(15rem, 280px, calc(100vw - 2rem));
  max-height: calc(100vh - 5rem);
  overflow-y: auto;
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  padding: 1.6rem 0.85rem 0.75rem;
  display: none;
  font-size: min(0.9rem, 14px);
}
.settings-panel[data-open="true"] { display: block; }
.settings-panel .settings-row {
  margin: 0.35rem 0;
}
.settings-panel label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.5rem 0;
}
.settings-panel select {
  background: transparent;
  border: 1px solid var(--gray);
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font: inherit;
  font-size: 0.9em;
  color: var(--darkgray);
  margin-left: auto;
}
.settings-panel input[type="checkbox"] {
  transform: none;
  margin: 0;
  vertical-align: middle;
  flex-shrink: 0;
}

/* Close (×) button in the top-right corner — same look as the sidebar
   menu's close button. */
.settings-close {
  position: absolute;
  top: 0.3rem;
  right: 0.4rem;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.1rem 0.5rem;
  color: var(--darkgray);
  font: inherit;
  font-size: 1.2em;
  font-weight: 600;
  line-height: 1;
  border-radius: 4px;
}
.settings-close:hover {
  color: var(--secondary);
  background: var(--lightgray);
}

/* Pill swatch (capsule shape) — the alternate-accent toggle. Lives in
   the bottom-right of the panel footer next to the reset button.
   Invisible (opacity: 0) until hovered; in red mode the (blue) pill is
   always visible so the user can switch back. Because the pill sits in
   its own flex slot, nothing overlaps its click target — so hovering
   its location reveals it reliably. */
.settings-footer {
  margin-top: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.settings-pill {
  width: 1.6rem;
  height: 0.8rem;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  background-color: #C8002A;
  padding: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}
.settings-pill:hover,
.settings-pill:focus-visible {
  opacity: 1;
}
:root[data-color-theme="red"] .settings-pill {
  background-color: #2640D8;
  opacity: 1;
}

.settings-sub {
  margin: 0.35rem 0;
}
.settings-sub > summary {
  cursor: pointer;
  list-style: none;
  color: var(--darkgray);
  padding: 0.18rem 0;
  outline: none;
}
.settings-sub > summary::-webkit-details-marker { display: none; }
.settings-sub > summary::after {
  content: " ▸";
  color: var(--gray);
  font-size: 0.85em;
}
.settings-sub[open] > summary::after { content: " ▾"; }
.settings-sub > .settings-row {
  padding-left: 0.6rem;
  border-left: 2px solid var(--lightgray);
  margin: 0.2rem 0 0.2rem 0.1rem;
}

.settings-reset {
  padding: 0.3rem 0.55rem;
  background: transparent;
  border: 1px solid var(--gray);
  border-radius: 4px;
  color: var(--darkgray);
  font: inherit;
  font-size: 0.88em;
  cursor: pointer;
}
.settings-reset:hover {
  color: var(--secondary);
  border-color: var(--secondary);
}
`

const SettingsButton: QuartzComponent = (_props: QuartzComponentProps) => (
  <div class="settings">
    <button
      type="button"
      class="settings-button"
      aria-label="Settings"
      aria-controls="settings-panel"
      aria-expanded="false"
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
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
    <div
      class="settings-panel"
      id="settings-panel"
      data-open="false"
      role="dialog"
      aria-label="Site settings"
    >
      <button type="button" class="settings-close" aria-label="Close settings">
        ×
      </button>
      <div class="settings-row">
        <label>
          <input type="checkbox" data-setting="showBreadcrumbs" />
          <span>Show breadcrumbs</span>
        </label>
        <label>
          <input type="checkbox" data-setting="expandToc" />
          <span>Expand TOC by default</span>
        </label>
        <label>
          <span>Text zoom</span>
          <select data-setting="zoom">
            <option value="0.75">75%</option>
            <option value="1" selected>100%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>
        </label>
        <label>
          <span>Bar reveal</span>
          <select data-setting="topBarReveal">
            <option value="off">Off</option>
            <option value="slow">Slow</option>
            <option value="normal" selected>Normal</option>
            <option value="fast">Fast</option>
            <option value="instant">Instant</option>
          </select>
        </label>
      </div>
      <details class="settings-sub">
        <summary>Background art</summary>
        <div class="settings-row">
          <label>
            <span>Type</span>
            <select data-setting="decor">
              <option value="placeholder">Grid</option>
              <option value="cycle">Cycle (test)</option>
              <option value="none">None</option>
            </select>
          </label>
          <label>
            <span>Scale</span>
            <select data-setting="decorScale">
              <option value="fill" selected>Fill</option>
              <option value="fit">Fit</option>
            </select>
          </label>
          <label>
            <span>Inner edge</span>
            <select data-setting="decorEdgeInner">
              <option value="solid" selected>Solid</option>
              <option value="fade">Fade</option>
            </select>
          </label>
          <label>
            <span>Outer edge</span>
            <select data-setting="decorEdgeOuter">
              <option value="solid" selected>Solid</option>
              <option value="fade">Fade</option>
            </select>
          </label>
          <label>
            <span>Outer color</span>
            <select data-setting="decorOuter">
              <option value="match" selected>Match</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="gray">Gray</option>
            </select>
          </label>
        </div>
      </details>
      <details class="settings-sub">
        <summary>Page metadata fields</summary>
        <div class="settings-row">
          <label><input type="checkbox" data-setting="metaDate" /><span>Published date</span></label>
          <label><input type="checkbox" data-setting="metaModified" /><span>Updated date</span></label>
          <label><input type="checkbox" data-setting="metaReading" /><span>Reading time</span></label>
          <label><input type="checkbox" data-setting="metaImportance" /><span>Importance</span></label>
          <label><input type="checkbox" data-setting="metaAudio" /><span>Audio icon</span></label>
          <label><input type="checkbox" data-setting="metaTags" /><span>Tags</span></label>
        </div>
      </details>
      <div class="settings-footer">
        <button type="button" class="settings-reset" data-setting="reset">
          Restore defaults
        </button>
        <button
          type="button"
          class="settings-pill"
          data-setting="color-theme-toggle"
          aria-label="Switch accent color (blue / red)"
        ></button>
      </div>
    </div>
  </div>
)

SettingsButton.css = css
SettingsButton.afterDOMLoaded = settingsScript

export default (() => SettingsButton) satisfies QuartzComponentConstructor
