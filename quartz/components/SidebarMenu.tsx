import { resolveRelative, FullSlug } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import script from "./scripts/navMenu.inline"

const css = `
.nav-menu {
  margin-top: 1rem;
  position: relative;
}
.nav-menu-toggle {
  background: transparent;
  border: 1px solid var(--gray);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--darkgray);
  font-size: 0.85em;
  font: inherit;
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
  left: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 14rem;
  max-width: 18rem;
  padding: 0.5rem;
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.nav-menu-list[hidden] { display: none; }
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

@media (max-width: 800px) {
  .nav-menu-list {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 50vw;
    min-width: 12rem;
    max-width: 18rem;
    border-radius: 0;
    border-right: 1px solid var(--lightgray);
    box-shadow: 4px 0 14px rgba(0, 0, 0, 0.08);
    padding-top: 1.2rem;
  }
}
`

const SidebarMenu: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const link = (slug: string, label: string) => (
    <a class="nav-menu-link" href={resolveRelative(fileData.slug!, slug as FullSlug)}>
      {label}
    </a>
  )
  return (
    <div class="nav-menu">
      <button
        type="button"
        class="nav-menu-toggle"
        aria-controls="nav-menu-list"
        aria-expanded="false"
        aria-label="Open navigation menu"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Menu
      </button>
      <nav class="nav-menu-list" id="nav-menu-list" hidden aria-label="Site navigation">
        {link("about", "About")}
        {link("all", "All pages")}
        {link("writing/index", "All writing")}
        {link("contact", "Contact")}
      </nav>
    </div>
  )
}

SidebarMenu.css = css
SidebarMenu.afterDOMLoaded = script

export default (() => SidebarMenu) satisfies QuartzComponentConstructor
