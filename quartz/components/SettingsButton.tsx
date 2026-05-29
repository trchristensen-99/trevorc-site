import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import settingsScript from "./scripts/settings.inline"

const css = `
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
  position: fixed;
  top: 3.25rem;
  right: 1rem;
  z-index: 100;
  width: min(22rem, calc(100vw - 2rem));
  max-height: calc(100vh - 5rem);
  overflow-y: auto;
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  padding: 0.85rem 1rem;
  display: none;
  font-size: 0.92em;
}
.settings-panel[data-open="true"] { display: block; }
.settings-panel h3 {
  font-size: 0.95em;
  margin: 0.75rem 0 0.4rem;
  color: var(--darkgray);
  font-weight: 600;
}
.settings-panel h3:first-of-type { margin-top: 0; }
.settings-panel .settings-row {
  margin: 0.35rem 0 0.5rem;
}
.settings-panel label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0;
}
.settings-panel select {
  background: transparent;
  border: 1px solid var(--gray);
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  font: inherit;
  font-size: 0.9em;
  color: var(--darkgray);
}
.settings-panel input[type="checkbox"] {
  transform: none;
  margin: 0;
  vertical-align: middle;
}
.settings-panel-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin: 0.4rem 0;
}
.settings-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  border: 2px solid var(--lightgray);
  cursor: pointer;
  flex-shrink: 0;
  background-color: #C8002A; /* shows the OPPOSITE — clicking flips to red */
}
:root[data-color-theme="red"] .settings-pill {
  background-color: #2640D8; /* clicking flips back to blue */
}

.settings-sub {
  margin-top: 0.25rem;
  padding-left: 0.25rem;
  border-left: 2px solid var(--lightgray);
}
.settings-sub > summary {
  cursor: pointer;
  list-style: none;
  color: var(--darkgray);
  padding: 0.15rem 0;
  outline: none;
}
.settings-sub > summary::-webkit-details-marker { display: none; }
.settings-sub > summary::after {
  content: " ▸";
  color: var(--gray);
  font-size: 0.85em;
}
.settings-sub[open] > summary::after { content: " ▾"; }

.settings-reset {
  margin-top: 0.7rem;
  padding: 0.35rem 0.6rem;
  background: transparent;
  border: 1px solid var(--gray);
  border-radius: 4px;
  color: var(--darkgray);
  font: inherit;
  font-size: 0.9em;
  cursor: pointer;
}
.settings-reset:hover {
  color: var(--secondary);
  border-color: var(--secondary);
}
`

const SettingsButton: QuartzComponent = (_props: QuartzComponentProps) => (
  <>
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
    <div class="settings-panel" id="settings-panel" data-open="false" role="dialog" aria-label="Site settings">
      <h3>Theme</h3>
      <div class="settings-panel-row">
        <span>Accent color</span>
        <button type="button" class="settings-pill" data-setting="color-theme-toggle" aria-label="Switch accent color (blue / red)"></button>
      </div>
      <h3>Layout</h3>
      <div class="settings-row">
        <label>
          <input type="checkbox" data-setting="showBreadcrumbs" />
          <span>Show breadcrumbs</span>
        </label>
        <label>
          <input type="checkbox" data-setting="expandToc" />
          <span>Expand table of contents by default</span>
        </label>
        <label>
          <input type="checkbox" data-setting="compactMode" />
          <span>Compact spacing</span>
        </label>
      </div>
      <h3>Text</h3>
      <div class="settings-row">
        <label>
          <span>Zoom</span>
          <select data-setting="zoom">
            <option value="0.75">75%</option>
            <option value="1" selected>100%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>
        </label>
      </div>
      <h3>Metadata</h3>
      <details class="settings-sub">
        <summary>Which fields appear under titles</summary>
        <div class="settings-row">
          <label><input type="checkbox" data-setting="metaDate" /><span>Published date</span></label>
          <label><input type="checkbox" data-setting="metaModified" /><span>Updated date</span></label>
          <label><input type="checkbox" data-setting="metaReading" /><span>Reading time</span></label>
          <label><input type="checkbox" data-setting="metaImportance" /><span>Importance</span></label>
          <label><input type="checkbox" data-setting="metaAudio" /><span>Audio narration icon</span></label>
          <label><input type="checkbox" data-setting="metaTags" /><span>Tags</span></label>
        </div>
      </details>
      <h3>Decoration</h3>
      <div class="settings-row">
        <label>
          <span>Background art</span>
          <select data-setting="decor">
            <option value="placeholder">Placeholder grid</option>
            <option value="none">None</option>
          </select>
        </label>
        <label>
          <input type="checkbox" data-setting="decorFade" />
          <span>Fade inner edge of side art</span>
        </label>
      </div>
      <button type="button" class="settings-reset" data-setting="reset">
        Restore defaults
      </button>
    </div>
  </>
)

SettingsButton.css = css
SettingsButton.afterDOMLoaded = settingsScript

export default (() => SettingsButton) satisfies QuartzComponentConstructor
