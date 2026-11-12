// Copies Bryntum Gantt's prebuilt browser bundle, styles and fonts into public/vendor/bryntum/.
// The page loads them with a <script> and <link> tags instead of sending the 6 MB bundle through
// the Next bundler (Turbopack ran out of memory on it). Runs before `npm run dev` and `npm run build`.
// public/vendor/ is git-ignored: the Bryntum trial is installed from npm, never committed here.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@bryntum", "gantt");
const to = join(root, "public", "vendor", "bryntum");

if (!existsSync(from)) {
  console.error("[copy-bryntum] @bryntum/gantt is not installed. Run npm install first.");
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const name of ["gantt.umd.js", "gantt.css", "svalbard-light.css", "fontawesome", "fonts"]) {
  cpSync(join(from, name), join(to, name), { recursive: true });
}
console.log("[copy-bryntum] copied to public/vendor/bryntum");
