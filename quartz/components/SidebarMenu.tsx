import { resolveRelative, FullSlug } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/navMenu.inline"

const css = `
.nav-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.nav-menu-toggle {
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
.nav-menu-toggle:hover {
  color: var(--secondary);
  border-color: var(--secondary);
}
.nav-menu-toggle svg {
  width: 1.1rem;
  height: 1.1rem;
}
.nav-menu-list {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 50;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 12rem;
  max-width: 16rem;
  padding: 0.5rem;
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
}
.nav-menu-list[hidden] { display: none !important; }
.nav-menu.collapsed .nav-menu-list { display: none; }

.nav-menu-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.25rem;
}
.nav-menu-close {
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
.nav-menu-close:hover {
  color: var(--secondary);
  background: var(--lightgray);
}

.nav-menu-link {
  display: block;
  padding: 0.55rem 0.75rem;
  background: var(--lightgray);
  color: var(--dark);
  border-radius: 4px;
  text-decoration: none;
  font-weight: 500;
  border: 1px solid transparent;
  transition: background 120ms, color 120ms, border-color 120ms;
}
.nav-menu-link:hover {
  background: var(--light);
  border-color: var(--secondary);
  color: var(--secondary);
}
`

const SidebarMenu: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const link = (slug: string, label: string) => (
    <a class="nav-menu-link" href={resolveRelative(fileData.slug!, slug as FullSlug)}>
      {label}
    </a>
  )
  return (
    <div class="nav-menu collapsed">
      <button
        type="button"
        class="nav-menu-toggle"
        aria-controls="nav-menu-list"
        aria-expanded="false"
        aria-label="Toggle navigation menu"
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
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <nav class="nav-menu-list" id="nav-menu-list" hidden aria-label="Site navigation">
        <div class="nav-menu-header">
          <button type="button" class="nav-menu-close" aria-label="Close menu">
            ×
          </button>
        </div>
        {link("about", "About")}
        {link("all", "All pages")}
        {link("writing/index", "All writing")}
        {link("contact", "Contact")}
        {link("tags", "Tags")}
      </nav>
    </div>
  )
}

SidebarMenu.css = css
SidebarMenu.afterDOMLoaded = script

export default (() => SidebarMenu) satisfies QuartzComponentConstructor
