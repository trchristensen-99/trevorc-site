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
  font-size: 1.75rem;
  margin: 0;
  font-family: var(--titleFont);
  line-height: 1;
  overflow-wrap: break-word;
  font-weight: 700;
}
.page-title a {
  /* Site title is always ultramarine, in both light and dark modes. */
  color: var(--secondary);
  text-decoration: none;
}
.page-title a:hover {
  color: var(--tertiary);
}
@media (max-width: 700px) {
  .page-title {
    font-size: 1.15rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
`

export default (() => PageTitle) satisfies QuartzComponentConstructor
