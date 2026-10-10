// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Builds the site into dist/: wraps each page in src/pages/ in src/layout.html, renders the keys
// tables from data/bindings.json and the hero's static frame, and copies the assets and the
// compiled script. Run through `npm run build` (tsc first, then this, as .build/build.js).

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Binding, BindingsFile } from "./scripts/bindings-types.js";
import { STATIC_STEP, STEPS, checkFrames, escapeHtml, frameHtml } from "./src/ts/hero-frames.js";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const at = (...p: string[]): string => join(ROOT, ...p);

interface PageMeta {
  title: string;
  short: string;
  /** Output path under dist/: "" for the home page, "keys/" for a directory, or a file name. */
  out: string;
  cmd: string;
  description: string;
  /** false: not in the tab list (the 404 page). */
  nav?: boolean;
}

interface Page {
  meta: PageMeta;
  body: string;
}

function readPage(file: string): Page {
  const src = readFileSync(at("src/pages", file), "utf8");
  const m = /^<!--(\{.*?\})-->\n/s.exec(src);
  if (!m?.[1]) throw new Error(`${file}: missing the <!--{…}--> meta line`);
  return { meta: JSON.parse(m[1]) as PageMeta, body: src.slice(m[0].length) };
}

/** Replaces {{name}} with vars[name]; an unknown name is an error, not an empty string. */
function fill(template: string, vars: Record<string, string>, where: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`${where}: no value for {{${name}}}`);
    return v;
  });
}

// --- keys -------------------------------------------------------------------------------------

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function bindingHtml(b: Binding): string {
  const keys = b.chords.map((c) => `<kbd>${escapeHtml(c)}</kbd>`).join(" ");
  const mode = b.mode ? `<span class="mode">${escapeHtml(b.mode)}</span>` : "";
  return `<span class="binding">${keys}${mode}</span>`;
}

function keysTables(data: BindingsFile): string {
  return data.sections
    .map((s) => {
      const id = `k-${slug(s.title)}`;
      const rows = s.rows
        .map((r) => {
          const search = [
            s.title,
            r.action,
            r.name,
            r.name.replace(/_/g, " "),
            ...r.bindings.map((b) => `${b.raw} ${b.chords.join(" ")} ${b.mode ?? ""}`),
          ]
            .join(" ")
            .toLowerCase();
          const keys = r.bindings.length
            ? r.bindings.map(bindingHtml).join("")
            : '<span class="nokey">no default key</span>';
          return (
            `<tr data-search="${escapeHtml(search)}">` +
            `<td>${escapeHtml(r.action)}</td>` +
            `<td><span class="bindings">${keys}</span></td>` +
            `<td><code class="name">${escapeHtml(r.name)}</code></td></tr>`
          );
        })
        .join("\n");
      return `<section class="keys-section" data-keys-section aria-labelledby="${id}">
<h2 id="${id}">${escapeHtml(s.title)} <span class="n">(${s.rows.length})</span></h2>
<table class="keys-table">
<thead><tr><th scope="col">Action</th><th scope="col">Keys</th><th scope="col">Name</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
    })
    .join("\n");
}

// --- hero -------------------------------------------------------------------------------------

function heroSteps(): string {
  return STEPS.map((s, i) => {
    const keys = s.keys.length ? s.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join(" ") + " " : "";
    const cls = i === STATIC_STEP ? ' class="current"' : "";
    return `    <li${cls}><span>${keys}${escapeHtml(s.label)}</span></li>`;
  }).join("\n");
}

// --- pages ------------------------------------------------------------------------------------

function nav(pages: Page[], current: Page, root: string): string {
  return pages
    .filter((p) => p.meta.nav !== false)
    .map((p, i) => {
      const cur = p === current ? ' aria-current="page"' : "";
      const href = p.meta.out === "" ? root : root + p.meta.out;
      return `            <li><a href="${href}"${cur}><span class="n">${i + 1}:</span>${p.meta.short}</a></li>`;
    })
    .join("\n");
}

function rootFor(out: string): string {
  if (out === "404.html") return "/"; // served at any missing path, so links must be absolute
  const depth = out.split("/").filter(Boolean).length;
  return depth === 0 ? "./" : "../".repeat(depth);
}

function outFile(out: string): string {
  return out === "" || out.endsWith("/") ? join(DIST, out, "index.html") : join(DIST, out);
}

function sizeOf(path: string): number {
  const st = statSync(path);
  if (!st.isDirectory()) return st.size;
  return readdirSync(path).reduce((n, f) => n + sizeOf(join(path, f)), 0);
}

function main(): void {
  const frameErrors = checkFrames();
  if (frameErrors.length) throw new Error(frameErrors.join("\n"));

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const layout = readFileSync(at("src/layout.html"), "utf8");
  const order = ["index.html", "keys.html", "install.html", "about.html", "404.html"];
  const pages = order.map(readPage);
  const navPages = pages.filter((p) => p.meta.nav !== false);
  const keys = JSON.parse(readFileSync(at("data/bindings.json"), "utf8")) as BindingsFile;
  const total = keys.sections.reduce((n, s) => n + s.rows.length, 0);
  const staticStep = STEPS[STATIC_STEP];
  if (!staticStep) throw new Error("no static hero step");

  for (const page of pages) {
    const root = rootFor(page.meta.out);
    const n = navPages.indexOf(page);
    const vars: Record<string, string> = {
      root,
      hero_frame: frameHtml(staticStep),
      hero_keys: staticStep.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join(" "),
      hero_steps: heroSteps(),
      keys_tables: keysTables(keys),
      keys_total: String(total),
      keys_commit: escapeHtml(keys.commit),
    };
    const content = fill(page.body, vars, page.meta.out || "index");
    const html = fill(
      layout,
      {
        root,
        title: escapeHtml(page.meta.title),
        description: escapeHtml(page.meta.description),
        cmd: escapeHtml(page.meta.cmd),
        short: escapeHtml(page.meta.short),
        pos: n >= 0 ? `page ${n + 1}/${navPages.length}` : "page -/-",
        nav: nav(pages, page, root),
        content,
      },
      "layout",
    );
    const file = outFile(page.meta.out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
  }

  cpSync(at("assets"), join(DIST, "assets"), { recursive: true });
  mkdirSync(join(DIST, "assets/js"), { recursive: true });
  for (const f of readdirSync(at(".build/site"))) {
    if (f.endsWith(".js")) cpSync(at(".build/site", f), join(DIST, "assets/js", f));
  }
  cpSync(at("LICENSE"), join(DIST, "LICENSE.txt"));

  const img = sizeOf(join(DIST, "assets/img"));
  const all = sizeOf(DIST);
  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
  console.log(`built ${pages.length} pages into dist/: ${kb(all)} in all,`);
  console.log(`  ${kb(all - img)} without images (logo variants and icons: ${kb(img)})`);
}

main();
