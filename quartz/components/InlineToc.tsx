import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const css = `
/* A compact, left-aligned control rather than a full-width panel. It
   shrinks to its own width so it never spans the column, and it aligns
   with the body text below it, leaving the title uncontested at the top
   of the page. Open/closed default follows the "Expand TOC by default"
   setting in the gear menu. */
.inline-toc {
  display: inline-block;
  margin: 0.2rem 0 1.5rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: transparent;
  font-size: 0.85em;
  max-width: 100%;
  box-sizing: border-box;
}
.inline-toc > summary {
  cursor: pointer;
  font-weight: 400;
  color: var(--darkgray);
  list-style: none;
  user-select: none;
  outline: none;
  display: flex;
  align-items: center;
  gap: 0.4rem;
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
  color: var(--gray);
}
.inline-toc[open] > summary::after {
  content: " \u25be";
}
.toc-icon {
  width: 0.95em;
  height: 0.95em;
  flex-shrink: 0;
}
.inline-toc ul {
  margin: 0.45rem 0 0.15rem;
  padding-left: 0;
  list-style: none;
}
.inline-toc li {
  margin: 0.15rem 0;
  line-height: 1.4;
}
.inline-toc li.depth-1 { margin-left: 0; }
.inline-toc li.depth-2 { margin-left: 0.85rem; }
.inline-toc li.depth-3 { margin-left: 1.7rem; }
.inline-toc li.depth-4 { margin-left: 2.55rem; }
.inline-toc li.depth-5 { margin-left: 3.4rem; }
.inline-toc a {
  color: var(--darkgray);
  text-decoration: none;
  white-space: nowrap;
}
.inline-toc a:hover {
  color: var(--secondary);
  text-decoration: underline;
}
`

const InlineToc: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  // Only render when there are enough sections to justify a table of
  // contents. Two entries is not navigation, it is a restatement of a
  // page you can already see all of, so three is the floor.
  if (!fileData.toc || fileData.toc.length < 3) return null
  // Defer to the user's settings toggle for the default open state; per-page
  // frontmatter expandToc still wins if set.
  const userPref =
    typeof document !== "undefined"
      ? document.documentElement.getAttribute("data-expand-toc") === "true"
      : false
  const open = fileData.frontmatter?.expandToc === true || userPref
  return (
    <details class="inline-toc" open={open}>
      <summary>
        <svg
          class="toc-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <line x1="8" y1="6" x2="20" y2="6" />
          <line x1="8" y1="12" x2="20" y2="12" />
          <line x1="8" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
        <span>Contents</span>
      </summary>
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
