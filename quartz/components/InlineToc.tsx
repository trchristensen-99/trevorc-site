import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const css = `
/* Deliberately understated. This sits directly under the title, which is
   where the eye lands first, so it reads as a small text affordance
   rather than a panel: no border, no fill, normal weight, left-aligned
   to the body text below it. The heading and the prose should win the
   attention; the TOC is there when you go looking for it. */
.inline-toc {
  margin: 0.15rem 0 1.4rem;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 0.85em;
  max-width: none;
  width: auto;
}
.inline-toc > summary {
  cursor: pointer;
  font-weight: 400;
  color: var(--gray);
  list-style: none;
  user-select: none;
  outline: none;
  text-align: left;
  /* inline-block so only the label is a click target, not the full row */
  display: inline-block;
  padding: 0.1rem 0;
  transition: color 0.15s ease;
}
.inline-toc > summary:hover,
.inline-toc > summary:focus-visible {
  color: var(--secondary);
}
.inline-toc > summary::-webkit-details-marker {
  display: none;
}
.inline-toc > summary::after {
  content: " \u25b8";
  font-size: 0.9em;
}
.inline-toc[open] > summary::after {
  content: " \u25be";
}
.inline-toc ul {
  margin: 0.4rem 0 0.25rem;
  padding-left: 0;
  list-style: none;
  border-left: 2px solid var(--lightgray);
}
.inline-toc li {
  margin: 0.15rem 0;
  line-height: 1.4;
  padding-left: 0.75rem;
}
.inline-toc li.depth-1 { margin-left: 0; }
.inline-toc li.depth-2 { margin-left: 0.9rem; }
.inline-toc li.depth-3 { margin-left: 1.8rem; }
.inline-toc li.depth-4 { margin-left: 2.7rem; }
.inline-toc li.depth-5 { margin-left: 3.6rem; }
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
  // Only render when there are enough sections to justify a table of contents.
  // For very short pages with one heading, the TOC is more noise than help.
  if (!fileData.toc || fileData.toc.length < 2) return null
  // Defer to the user's settings toggle for the default open state; per-page
  // frontmatter expandToc still wins if set.
  const userPref =
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-expand-toc") === "true"
      : false
  const open = fileData.frontmatter?.expandToc === true || userPref
  return (
    <details class="inline-toc" open={open}>
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
