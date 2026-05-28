import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { resolveRelative, FullSlug } from "../util/path"

const ArticleTitle: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
  const title = fileData.frontmatter?.title
  if (!title) return null

  // On individual tag pages, the title is "Tag: <name>". Make the "Tag:"
  // prefix link back to the /tags index with that tag anchored.
  const slug = fileData.slug
  if (slug?.startsWith("tags/") && slug !== "tags" && title.startsWith("Tag: ")) {
    const tag = title.slice("Tag: ".length)
    const indexHref = `${resolveRelative(slug, "tags" as FullSlug)}#tag-${tag}`
    return (
      <h1 class={classNames(displayClass, "article-title")}>
        <a href={indexHref} class="tag-prefix-link">
          Tag:
        </a>{" "}
        {tag}
      </h1>
    )
  }

  return <h1 class={classNames(displayClass, "article-title")}>{title}</h1>
}

ArticleTitle.css = `
.article-title {
  margin: 0.5rem 0 0.4rem 0;
  text-align: center;
}
.article-title .tag-prefix-link {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted var(--gray);
}
.article-title .tag-prefix-link:hover {
  color: var(--secondary);
  border-bottom-color: var(--secondary);
}
`

export default (() => ArticleTitle) satisfies QuartzComponentConstructor
