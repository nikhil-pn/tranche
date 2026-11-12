// Loads Bryntum Gantt in the browser without sending it through the bundler.
//
// The trial package ships one 6 MB obfuscated module. Turbopack runs out of memory analysing it
// (it took the shared dev server down three times), so nothing in this folder may import
// "@bryntum/gantt" or "@bryntum/gantt-react" as a value. Types are fine: `import type` is erased.
// Instead the prebuilt gantt.umd.js and the stylesheets are added to the page at runtime.
//
// The files are plain static assets in public/vendor/bryntum, copied there from node_modules by
// scripts/copy-bryntum.mjs (runs before dev and build). To serve them from somewhere else, set
// NEXT_PUBLIC_BRYNTUM_BASE.

export type BryntumGantt = typeof import("@bryntum/gantt");

const BASE = (process.env.NEXT_PUBLIC_BRYNTUM_BASE || "/vendor/bryntum").replace(/\/+$/, "");

// Order matters: structure first, then the theme, then the icon font.
const STYLES = ["gantt.css", "svalbard-light.css", "fontawesome/css/fontawesome.css", "fontawesome/css/solid.css"];
const SCRIPT = "gantt.umd.js";
const MARK = "data-tranche-bryntum";

type BryntumWindow = Window & { bryntum?: { gantt?: BryntumGantt } };

let pending: Promise<BryntumGantt> | undefined;

function addStyle(href: string, before: Node | null): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(MARK, "style");
    // A missing stylesheet should not stop the board from appearing; the console shows the 404.
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.insertBefore(link, before);
  });
}

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute(MARK, "script");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

export function loadBryntum(): Promise<BryntumGantt> {
  if (typeof window === "undefined") return Promise.reject(new Error("Bryntum Gantt only loads in the browser"));
  const ready = (window as BryntumWindow).bryntum?.gantt;
  if (ready?.Gantt) return Promise.resolve(ready);

  pending ??= (async () => {
    // Bryntum's styles go first in <head> so the app's own stylesheets (and gantt.css next to this
    // file) always come later and win on equal specificity.
    const first = document.head.firstChild;
    const styles = STYLES.map((s) => addStyle(`${BASE}/${s}`, first));
    await addScript(`${BASE}/${SCRIPT}`);
    await Promise.all(styles);
    const lib = (window as BryntumWindow).bryntum?.gantt;
    if (!lib?.Gantt) throw new Error("gantt.umd.js loaded but did not register window.bryntum.gantt");
    return lib;
  })().catch((err) => {
    pending = undefined; // let a later mount try again
    throw err;
  });
  return pending;
}
