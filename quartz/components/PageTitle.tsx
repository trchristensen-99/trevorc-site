import { pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

const PageTitle: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const title = cfg?.pageTitle ?? i18n(cfg.locale).propertyDefaults.title
  const baseDir = pathToRoot(fileData.slug!)
  return (
    <h2 class={classNames(displayClass, "page-title")}>
      <a href={baseDir}>{title}</a>
    </h2>
  )
}

PageTitle.css = `
.page-title {
  font-size: 1.4rem;
  margin: 0;
  font-family: var(--titleFont);
  line-height: 1.15;
  overflow-wrap: break-word;
}
.page-title a {
  color: inherit;
  text-decoration: none;
}
.page-title a:hover {
  color: var(--secondary);
}
@media (max-width: 700px) {
  .page-title {
    font-size: 1.75rem;
  }
}
`

export default (() => PageTitle) satisfies QuartzComponentConstructor
