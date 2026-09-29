// Guarantees window.addCleanup exists before any afterDOMLoaded script runs.
//
// Why this is needed: Quartz concatenates every inline script into one
// comma-separated expression in postscript.js, so an uncaught throw in
// any one of them aborts every script that follows it in the bundle.
// window.addCleanup is defined by spa.inline.ts, but several scripts
// (settings, sortable, audioPlayer, tagFilter, the toggles) also run
// immediately on DOMContentLoaded -- and on a cold load that happens
// before spa.inline.ts has assigned it. Any such call threw
// "window.addCleanup is not a function" and silently killed the rest of
// the bundle, including the sandwich menu.
//
// This shim runs in prescript.js (head, before postscript.js) and
// buffers anything registered early. spa.inline.ts drains the buffer
// into its real cleanup set, so nothing registered during the initial
// load is lost on the first SPA navigation.
declare global {
  interface Window {
    __earlyCleanups?: Array<(...args: any[]) => void>
  }
}

if (typeof window !== "undefined" && typeof window.addCleanup !== "function") {
  window.__earlyCleanups = []
  window.addCleanup = (fn: (...args: any[]) => void) => {
    window.__earlyCleanups!.push(fn)
  }
}

export {}
