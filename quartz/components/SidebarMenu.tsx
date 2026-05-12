import { resolveRelative, FullSlug } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const css = `
.sidebar-menu {
  margin-top: 1.25rem;
  font-size: 0.95em;
}
.sidebar-menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sidebar-menu li {
  margin: 0.35rem 0;
}
.sidebar-menu a {
  color: var(--darkgray);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}
.sidebar-menu a:hover {
  color: var(--secondary);
  border-bottom-color: var(--secondary);
}
`

const SidebarMenu: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const link = (slug: string, label: string) => (
    <a href={resolveRelative(fileData.slug!, slug as FullSlug)}>{label}</a>
  )
  return (
    <nav class="sidebar-menu" aria-label="Site navigation">
      <ul>
        <li>{link("about", "About")}</li>
        <li>{link("all", "All writing")}</li>
      </ul>
    </nav>
  )
}

SidebarMenu.css = css

export default (() => SidebarMenu) satisfies QuartzComponentConstructor
