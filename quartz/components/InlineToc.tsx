import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const css = `
.inline-toc {
  margin: 1rem 0 1.5rem;
  padding: 0.5rem 0.85rem;
  border-left: 3px solid var(--lightgray);
  background: var(--light);
  font-size: 0.95em;
}
.inline-toc > summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--darkgray);
  list-style: none;
  user-select: none;
  outline: none;
}
.inline-toc > summary::-webkit-details-marker {
  display: none;
}
.inline-toc > summary::after {
  content: " ▸";
  font-size: 0.85em;
  color: var(--gray);
}
.inline-toc[open] > summary::after {
  content: " ▾";
}
.inline-toc ul {
  margin: 0.5rem 0 0.25rem;
  padding-left: 1rem;
  list-style: none;
}
.inline-toc li {
  margin: 0.15rem 0;
  line-height: 1.4;
}
.inline-toc li.depth-1 { margin-left: 0; }
.inline-toc li.depth-2 { margin-left: 1rem; }
.inline-toc li.depth-3 { margin-left: 2rem; }
.inline-toc li.depth-4 { margin-left: 3rem; }
.inline-toc li.depth-5 { margin-left: 4rem; }
.inline-toc a {
  color: var(--darkgray);
  text-decoration: none;
}
.inline-toc a:hover {
  color: var(--secondary);
  text-decoration: underline;
}
`

const InlineToc: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  if (!fileData.toc || fileData.toc.length === 0) return null
  return (
    <details class="inline-toc" open={!fileData.collapseToc}>
      <summary>Contents</summary>
      <ul>
        {fileData.toc.map((entry) => (
          <li key={entry.slug} class={`depth-${entry.depth}`}>
            <a href={`#${entry.slug}`} data-for={entry.slug}>
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

InlineToc.css = css

export default (() => InlineToc) satisfies QuartzComponentConstructor
