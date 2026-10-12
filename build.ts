// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Builds the site into dist/: wraps each page in src/pages/ and each docs page (scripts/docs.ts)
// in src/layout.html, renders the keys tables from data/bindings.json and the docs search index,
// and copies the assets and the compiled scripts. Run through `npm run build` (tsc first, then this, as .build/build.js).

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { VIMMA_REPO } from "./scripts/bindings-types.js";
import { buildDocs } from "./scripts/docs.js";
import { readBindings } from "./scripts/gen-keys.js";
import { keysTables } from "./scripts/keys-html.js";
import {
  type LlmsLink,
  OG_IMAGE,
  PROMO_VIDEO,
  TAGLINE,
  headTags,
  homeJsonLd,
  lastChanged,
  llmsTxt,
  robotsTxt,
  sitemapXml,
} from "./scripts/seo.js";
import { escapeHtml } from "./src/ts/html.js";

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
  /** false: not in the tab list (the 404 page, docs pages other than Start here). */
  nav?: boolean;
  /** The tab-list entry (its `out`) that stays current on this page. */
  section?: string;
  /** Wide layout (the docs). */
  wide?: boolean;
}

interface Page {
  meta: PageMeta;
  body: string;
  /** The files the page is made from, for its date in the sitemap. */
  sources: string[];
}

function readPage(file: string): Page {
  const src = readFileSync(at("src/pages", file), "utf8");
  const m = /^<!--(\{.*?\})-->\n/s.exec(src);
  if (!m?.[1]) throw new Error(`${file}: missing the <!--{…}--> meta line`);
  const sources = [`src/pages/${file}`, ...(file === "keys.html" ? ["data/bindings.json", "data/bindings-source.json"] : [])];
  return { meta: JSON.parse(m[1]) as PageMeta, body: src.slice(m[0].length), sources };
}

/** Replaces {{name}} with vars[name]; an unknown name is an error, not an empty string. */
function fill(template: string, vars: Record<string, string>, where: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`${where}: no value for {{${name}}}`);
    return v;
  });
}

// --- pages ------------------------------------------------------------------------------------

function nav(pages: Page[], current: Page, root: string): string {
  return pages
    .filter((p) => p.meta.nav !== false)
    .map((p, i) => {
      const here = p === current || p.meta.out === current.meta.section;
      const cur = here ? (p === current ? ' aria-current="page"' : ' aria-current="true"') : "";
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
  if (!existsSync(at(OG_IMAGE.path))) throw new Error(`${OG_IMAGE.path} missing (scripts/og-image.sh)`);
  for (const f of [PROMO_VIDEO.path, PROMO_VIDEO.poster]) {
    if (!existsSync(at(f))) throw new Error(`${f} missing (scripts/video.sh)`);
  }
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const layout = readFileSync(at("src/layout.html"), "utf8");
  const docs = buildDocs(ROOT);
  const docPages: Page[] = docs.pages.map((d) => ({
    meta: {
      title: `${d.headTitle} · Vimma docs`,
      short: d.slug ? `docs/${d.slug}` : "docs",
      out: d.out,
      cmd: `less docs/${d.slug || "start-here"}.md`,
      description: d.description,
      nav: d.slug === "",
      section: "docs/",
      wide: true,
    },
    body: d.body,
    sources: d.sources,
  }));
  const [home, keysPage, install, about, notFound] = ["index.html", "keys.html", "install.html", "about.html", "404.html"].map(readPage);
  const start = docPages[0];
  if (!home || !keysPage || !install || !about || !notFound || !start) throw new Error("missing page");
  const pages = [home, start, keysPage, install, about, notFound, ...docPages.slice(1)];
  const navPages = pages.filter((p) => p.meta.nav !== false);
  const keys = readBindings(ROOT);
  const total = keys.sections.reduce((n, s) => n + s.rows.length, 0);

  const notFoundPage = (p: Page): boolean => p.meta.out === "404.html";
  for (const page of pages) {
    const root = rootFor(page.meta.out);
    const seo = [
      headTags({
        title: page.meta.title,
        description: page.meta.description,
        out: page.meta.out,
        indexable: !notFoundPage(page),
        type: page === home || notFoundPage(page) ? "website" : "article",
        video: page === home,
      }),
      ...(page === home ? [homeJsonLd(page.meta.description)] : []),
    ].join("\n    ");
    const n = navPages.findIndex((p) => p === page || p.meta.out === page.meta.section);
    const vars: Record<string, string> = {
      root,
      keys_tables: keysTables(keys.sections),
      keys_total: String(total),
      keys_commit: escapeHtml(keys.commit),
      keys_commit_url: `${VIMMA_REPO}/commit/${escapeHtml(keys.commitFull)}`,
    };
    const content = fill(page.body, vars, page.meta.out || "index");
    const html = fill(
      layout,
      {
        root,
        title: escapeHtml(page.meta.title),
        description: escapeHtml(page.meta.description),
        seo,
        cmd: escapeHtml(page.meta.cmd),
        short: escapeHtml(page.meta.short),
        pos: n >= 0 ? `page ${n + 1}/${navPages.length}` : "page -/-",
        nav: nav(pages, page, root),
        main_class: page.meta.wide ? "wrap wide md" : "wrap md",
        skip: page.meta.wide ? "#doc" : "#main",
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
  // static/: files served at the site's root as they are (search-engine verification files,
  // a _headers file); dotfiles such as .gitkeep stay behind
  for (const f of readdirSync(at("static"))) {
    if (f.startsWith(".")) continue;
    if (existsSync(join(DIST, f))) throw new Error(`static/${f} would overwrite a built file`);
    cpSync(at("static", f), join(DIST, f), { recursive: true });
  }

  // For search engines and AI tools: the page list with dates, the crawl rules, and llms.txt.
  const buildDate = new Date().toISOString().slice(0, 10);
  const indexed = pages.filter((p) => !notFoundPage(p));
  writeFileSync(
    join(DIST, "sitemap.xml"),
    sitemapXml(
      indexed.map((p) => ({ out: p.meta.out, lastmod: lastChanged(ROOT, p.sources, buildDate) })),
    ),
  );
  writeFileSync(join(DIST, "robots.txt"), robotsTxt());
  const link = (p: Page, title = p.meta.title.replace(/ · Vimma( docs)?$/, "")): LlmsLink => ({
    title,
    out: p.meta.out,
    description: p.meta.description,
  });
  const docsOf = (group: string): LlmsLink[] =>
    docs.pages.flatMap((d) => {
      const p = docPages.find((x) => x.meta.out === d.out);
      return p && d.group === group ? [link(p, d.title)] : [];
    });
  writeFileSync(
    join(DIST, "llms.txt"),
    llmsTxt(
      `${TAGLINE}. Vimma is a Firefox fork for Linux: Vim modes on every page, a tmux-style ctrl+b prefix for tabs, split panes and workspaces, and one config.toml for every key.`,
      `Vimma is pre-alpha and open source (MPL-2.0): there are no binaries yet, so it is built from source on Linux x86_64. Source: ${VIMMA_REPO}. The whole user guide as one Markdown file: https://vimma.dev/llms-full.txt`,
      [
        ["Start", [link(home, "Vimma"), ...docsOf("Start"), link(install, "Install Vimma"), link(keysPage, "Key bindings")]],
        ["Docs", ["Get going", "Tabs, panes, workspaces", "Make it yours"].flatMap(docsOf)],
        ["Optional", [...docsOf("Reference"), link(about, "About Vimma")]],
      ],
    ),
  );
  writeFileSync(join(DIST, "llms-full.txt"), docs.markdown);
  // The docs search index: an ES module the docs pages import when the search is first used.
  writeFileSync(
    join(DIST, "assets/js/docs-index.js"),
    `// Generated by build.ts from the docs pages (Vimma ${docs.source.commit}).\nexport default ${JSON.stringify(docs.index)};\n`,
  );
  // The ? overlay's "In Vimma" part: the keys page's rows, as a data module every page imports
  // when the overlay first opens (site.ts). `k` is the chords, `m` the mode.
  const overlayKeys = {
    commit: keys.commit,
    sections: keys.sections.map((s) => ({
      title: s.title,
      rows: s.rows.map((r) => ({
        action: r.action,
        name: r.name,
        keys: r.bindings.map((b) => (b.mode ? { k: b.chords, m: b.mode } : { k: b.chords })),
      })),
    })),
  };
  writeFileSync(
    join(DIST, "assets/js/vimma-keys.js"),
    `// Generated by build.ts from data/bindings.json (Vimma ${keys.commit}).\nexport default ${JSON.stringify(overlayKeys)};\n`,
  );

  const img = sizeOf(join(DIST, "assets/img"));
  const video = sizeOf(join(DIST, "assets/video"));
  const all = sizeOf(DIST);
  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
  console.log(`built ${pages.length} pages (${docPages.length} docs) into dist/: ${kb(all)} in all,`);
  console.log(`  ${kb(all - img - video)} without images (logo variants and icons: ${kb(img)})`);
  console.log(`  and the promo video and its poster: ${kb(video)}`);
}

main();
