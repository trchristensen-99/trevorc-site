// Per-decor hide toggle. State persisted in localStorage so a hide on one
// page sticks across navigation.
const STORAGE_KEY = "trevorc-decor-hidden"

function readHidden(): Set<string> {
  const raw = localStorage.getItem(STORAGE_KEY) ?? ""
  return new Set(raw.split(",").filter(Boolean))
}

function writeHidden(set: Set<string>) {
  localStorage.setItem(STORAGE_KEY, Array.from(set).join(","))
}

function attach() {
  const hidden = readHidden()
  document.querySelectorAll<HTMLElement>("[data-decor]").forEach((d) => {
    const id = d.getAttribute("data-decor") ?? ""
    if (hidden.has(id)) {
      d.setAttribute("hidden", "")
    } else {
      d.removeAttribute("hidden")
    }
    const close = d.querySelector<HTMLButtonElement>(".decor-close")
    if (!close) return
    const onClick = () => {
      d.setAttribute("hidden", "")
      const next = readHidden()
      next.add(id)
      writeHidden(next)
    }
    close.addEventListener("click", onClick)
    if (typeof window.addCleanup === "function") {
      window.addCleanup(() => close.removeEventListener("click", onClick))
    }
  })
}

document.addEventListener("nav", attach)
if (document.readyState !== "loading") attach()
else document.addEventListener("DOMContentLoaded", attach, { once: true })
