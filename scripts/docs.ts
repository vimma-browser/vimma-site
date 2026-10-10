// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Builds the docs pages' bodies and the docs search index from data/docs/ (the synced copies of
// Vimma's guide.md and limits.md), data/bindings.json, the page list in docs-pages.ts and the
// hand-written intros in src/docs/. The site build wraps each body in the shared layout.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { escapeHtml } from "../src/ts/hero-frames.js";
import type { BindingsFile } from "./bindings-types.js";
import { type Block, DOC_PAGES, type DocPage, LIMIT_SECTIONS, STALE_LIMITS, STALE_PREFIXES } from "./docs-pages.js";
import { keysTables, slug } from "./keys-html.js";
import {
  type MdSection,
  type RenderOptions,
  findSection,
  inline,
  parseSections,
  rawBlocks,
  renderBlocks,
  renderSection,
  renderTable,
  sectionIds,
} from "./md.js";

export interface BuiltDoc {
  slug: string;
  /** Output path under dist/. */
  out: string;
  title: string;
  description: string;
  /** The page's main column: heading, intro, sections, pager. */
  body: string;
}

export interface SearchEntry {
  /** page title */
  p: string;
  /** section heading ("" for the page itself) */
  h: string;
  /** URL from the site root */
  u: string;
  /** a short snippet */
  s: string;
  /** the section's distinct words, lower case, space-separated */
  w: string;
}

interface Source {
  commit: string;
  date: string;
}

const START = { slug: "", title: "Start here", nav: "Start here", group: "Start" };

/** Where an id from guide.md ended up: page slug ("" for Start here). */
type IdMap = Map<string, string>;

const pageUrl = (s: string): string => (s === "" ? "docs/" : `docs/${s}/`);
const LIMIT_ID = (title: string): string => `limit-${slug(title.replace(/\s*\(.*\)$/, ""))}`;

function fail(msg: string): never {
  throw new Error(`docs: ${msg}\n(run \`npm run docs:sync\`, then update scripts/docs-pages.ts)`);
}

function need(guide: MdSection, title: string): MdSection {
  return findSection(guide, title) ?? fail(`guide.md has no section "${title}"`);
}

/** Link targets in guide.md and limits.md, rewritten for the site. */
function linker(ids: IdMap, here: string, root: string): RenderOptions["link"] {
  return (href) => {
    if (/^https?:\/\//.test(href)) return href;
    const [path = "", hash = ""] = href.split("#");
    if (path === "") {
      const page = ids.get(hash);
      if (page === undefined) return null;
      return page === here ? `#${hash}` : `${root}${pageUrl(page)}#${hash}`;
    }
    if (path === "bindings.md") return `${root}keys/`;
    if (path === "limits.md") return `${root}docs/limits/`;
    if (path.endsWith("README.md")) return `${root}docs/install/`;
    // specs, ADRs, the runbook and the plan live in Vimma's repository, which is not public yet
    return null;
  };
}

function idsOf(block: Block, guide: MdSection): string[] {
  if ("guide" in block) return sectionIds(need(guide, block.guide), block.exclude ?? [], !block.only);
  if ("guideRows" in block) return [block.id];
  return [];
}

function guideRows(guide: MdSection, b: Extract<Block, { guideRows: unknown }>, opts: RenderOptions): string {
  const sec = need(guide, b.guideRows.section);
  const table = sec.body.filter((l) => /^\s*\|/.test(l));
  const firstCell = (l: string): string => l.trim().replace(/^\|/, "").split("|")[0]?.trim() ?? "";
  const rows = b.guideRows.rows.map(
    (want) => table.find((l) => firstCell(l) === want) ?? fail(`guide.md "${sec.title}" has no table row "${want}"`),
  );
  const header = b.guideRows.header;
  const sep = header.replace(/[^|]+/g, " --- ");
  return `<h2 id="${b.id}">${escapeHtml(b.title)}</h2>\n${renderTable([header, sep, ...rows], opts)}`;
}

function guideParas(guide: MdSection, b: Extract<Block, { guideParas: unknown }>, opts: RenderOptions): string {
  const sec = need(guide, b.guideParas.section);
  const blocks = rawBlocks(sec.body);
  return b.guideParas.startsWith
    .map((start) => {
      const blk = blocks.find((x) => (x[0] ?? "").startsWith(start)) ?? fail(`guide.md "${sec.title}" has no paragraph starting "${start}"`);
      return renderBlocks(blk, opts);
    })
    .join("\n");
}

function limitsLinks(titles: string[], limits: MdSection, root: string): string {
  const items = titles.map((t) => {
    if (!findSection(limits, t)) fail(`limits.md has no section "${t}"`);
    return `<li><a href="${root}docs/limits/#${LIMIT_ID(t)}">${escapeHtml(t.replace(/\s*\(.*\)$/, ""))}</a></li>`;
  });
  return `<h2 id="known-limits">Known limits</h2>
<p>Vimma is pre-alpha. What does not work yet, or works with a catch, is listed on the known limits page:</p>
<ul class="limit-links">${items.join("")}</ul>`;
}

/** The limits page body: each section's bullets, minus the ones the same commit's guide contradicts. */
function limitsPage(limits: MdSection, opts: RenderOptions): string {
  const dropped: string[] = [];
  const parts = LIMIT_SECTIONS.map((t) => {
    const sec = findSection(limits, t) ?? fail(`limits.md has no section "${t}"`);
    const blocks = rawBlocks(sec.body)
      .map((blk) => {
        // a block of bullets: drop stale ones, strip stale prefixes
        const bullets: string[][] = [];
        for (const l of blk) {
          if (/^- /.test(l) || bullets.length === 0) bullets.push([l]);
          else bullets[bullets.length - 1]?.push(l);
        }
        return bullets
          .filter((b) => {
            const text = (b[0] ?? "").replace(/^- /, "");
            const stale = STALE_LIMITS.some((s) => text.startsWith(s));
            if (stale) dropped.push(text.slice(0, 50));
            return !stale;
          })
          .map((b) => {
            let first = b[0] ?? "";
            for (const p of STALE_PREFIXES) {
              if (first.startsWith(`- ${p}`)) first = `- ${first.slice(2 + p.length, 3 + p.length).toUpperCase()}${first.slice(3 + p.length)}`;
            }
            return [first, ...b.slice(1)];
          })
          .flat();
      })
      .filter((b) => b.length);
    const title = t.replace(/\s*\(.*\)$/, "");
    const subs = sec.children.map((c) => {
      const plain = c.title.replace(/\s*\(\[.*$/, "");
      return `<h3 id="${LIMIT_ID(plain)}">${escapeHtml(plain)}</h3>\n${renderBlocks(c.body, opts)}`;
    });
    return [`<h2 id="${LIMIT_ID(t)}">${escapeHtml(title)}</h2>`, ...blocks.map((b) => renderBlocks(b, opts)), ...subs].join("\n");
  });
  if (dropped.length) console.log(`  docs: left out ${dropped.length} stale limits.md line(s): ${dropped.join(" | ")}…`);
  return parts.join("\n");
}

// --- page chrome ------------------------------------------------------------------------------

interface NavEntry {
  slug: string;
  title: string;
  nav: string;
  group: string;
}

function sidebar(all: NavEntry[], here: string, root: string): string {
  const groups: string[] = [];
  for (const e of all) if (!groups.includes(e.group)) groups.push(e.group);
  let n = 0;
  const lists = groups
    .map((g) => {
      const items = all
        .filter((e) => e.group === g)
        .map((e) => {
          const cur = e.slug === here ? ' aria-current="page"' : "";
          const num = String(n++).padStart(2, "0");
          return `<li><a href="${root}${pageUrl(e.slug)}"${cur}><span class="n" aria-hidden="true">${num}</span> ${escapeHtml(e.nav)}</a></li>`;
        })
        .join("\n");
      return `<p class="group" aria-hidden="true">${escapeHtml(g)}</p>\n<ul>\n${items}\n</ul>`;
    })
    .join("\n");
  return `<nav class="docs-nav" aria-label="Docs">
<div class="docs-search" data-js-only hidden>
<label for="docsearch"><span aria-hidden="true">/</span><span class="sr-only">Search the docs</span></label>
<input id="docsearch" type="search" placeholder="search docs" autocomplete="off" spellcheck="false" aria-describedby="docsearch-status" aria-controls="docsearch-results">
<p id="docsearch-status" class="status" aria-live="polite"></p>
<ol id="docsearch-results" class="results" hidden></ol>
</div>
<details class="docs-pages" open>
<summary>pages</summary>
${lists}
</details>
</nav>`;
}

function toc(body: string): string {
  const heads = [...body.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)];
  if (heads.length < 2) return "";
  const items = heads
    .map((m) => {
      const text = (m[3] ?? "").replace(/<[^>]+>/g, "").replace(/\s*\(\d+\)$/, "");
      return `<li class="l${m[1]}"><a href="#${m[2]}">${text}</a></li>`;
    })
    .join("\n");
  return `<nav class="toc" aria-labelledby="toc-title">
<details open>
<summary class="toc-title" id="toc-title">on this page</summary>
<ul>
${items}
</ul>
</details>
</nav>`;
}

function pager(all: NavEntry[], i: number, root: string): string {
  const prev = all[i - 1];
  const next = all[i + 1];
  const a = (e: NavEntry | undefined, rel: string, key: string): string =>
    e
      ? `<a rel="${rel}" href="${root}${pageUrl(e.slug)}"><span class="dir">${rel === "prev" ? "‹ previous" : "next ›"} <kbd>${key}</kbd></span> ${escapeHtml(e.title)}</a>`
      : "<span></span>";
  return `<nav class="pager" aria-label="Previous and next page">\n${a(prev, "prev", "[")}\n${a(next, "next", "]")}\n</nav>`;
}

// --- search index -----------------------------------------------------------------------------

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENT[e] ?? e)
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:)])/g, "$1")
    .replace(/\( /g, "(")
    .trim();

/** Words too common to search by; dropped from the index to keep it small. */
const STOP = new Set(
  "the and for are but not you your with that this from have has its it's into one can when then than them they their there what which who will would also only each any all was were been being more most other some such out off over too very just about after before again here how why our yet own same both few nor".split(
    " ",
  ),
);

function indexPage(title: string, slugName: string, body: string): SearchEntry[] {
  const parts = body.split(/(?=<h[23] id=")/);
  return parts.flatMap((part, i) => {
    const m = /^<h[23] id="([^"]+)">([\s\S]*?)<\/h[23]>/.exec(part);
    if (i > 0 && !m) return [];
    const heading = m ? textOf(m[2] ?? "").replace(/\s*\(\d+\)$/, "") : "";
    // no scheme-qualified URLs in the shipped index: it is data, and `npm run check` keeps the
    // site's JS free of URLs; `example.com` still finds them
    const text = textOf(m ? part.slice(m[0].length) : part).replace(/\b[a-z]+:\/\//g, "");
    const words = [...new Set(`${title} ${heading} ${text}`.toLowerCase().split(/[\s,;()"“”'’!?]+|\.(?=\s|$)/))]
      .filter((w) => w.length > 1 && !STOP.has(w))
      .join(" ");
    const s = text.length > 80 ? `${text.slice(0, 77).replace(/\s\S*$/, "")}…` : text;
    return [{ p: title, h: heading, u: `${pageUrl(slugName)}${m ? `#${m[1]}` : ""}`, s, w: words }];
  });
}

// --- build ------------------------------------------------------------------------------------

export function buildDocs(rootDir: string): { pages: BuiltDoc[]; index: SearchEntry[]; source: Source } {
  const read = (p: string): string => readFileSync(join(rootDir, p), "utf8");
  const guide = parseSections(read("data/docs/guide.md"));
  const limits = parseSections(read("data/docs/limits.md"));
  const keys = JSON.parse(read("data/bindings.json")) as BindingsFile;
  const source = JSON.parse(read("data/docs/source.json")) as Source;

  const nav: NavEntry[] = [START, ...DOC_PAGES.map((p) => ({ ...p, nav: p.nav ?? p.title }))];

  // which page renders which guide heading, so #links can cross pages
  const ids: IdMap = new Map();
  for (const p of DOC_PAGES) for (const b of p.blocks) for (const id of idsOf(b, guide)) if (!ids.has(id)) ids.set(id, p.slug);

  const pages: BuiltDoc[] = [];
  const index: SearchEntry[] = [];

  nav.forEach((entry, i) => {
    const page: DocPage | undefined = DOC_PAGES.find((p) => p.slug === entry.slug);
    const depth = entry.slug === "" ? 1 : 2;
    const root = "../".repeat(depth);
    const opts: RenderOptions = { link: linker(ids, entry.slug, root) };
    const introFile = `src/docs/${entry.slug || "start-here"}.html`;
    const intro = read(introFile)
      .replace(/^<!--[\s\S]*?-->\n?/, "")
      .replace(/\{\{root\}\}/g, root);

    let sections = "";
    if (!page) {
      sections = intro.replace("{{docs_list}}", docsList(DOC_PAGES, root));
    } else if (page.slug === "limits") {
      sections = limitsPage(limits, opts);
    } else {
      sections = page.blocks
        .map((b) => {
          if ("guide" in b) {
            const sec = need(guide, b.guide);
            const html = renderSection(sec, opts, 2, b.exclude ?? [], !b.only);
            // a section named like the page needs no second heading; keep its anchor
            return sec.title.toLowerCase() === page.title.toLowerCase()
              ? html.replace(/^<h2 id="([^"]+)">[\s\S]*?<\/h2>/, '<span id="$1"></span>')
              : html;
          }
          if ("guideRows" in b) return guideRows(guide, b, opts);
          if ("guideParas" in b) return guideParas(guide, b, opts);
          if ("keys" in b) {
            const secs = b.keys.map((t) => keys.sections.find((s) => s.title === t) ?? fail(`bindings.md has no section "${t}"`));
            return `<h2 id="default-keys">Default keys</h2>
<p>From <code>bindings.md</code>, the table Vimma's own <kbd>ctrl+b</kbd> <kbd>?</kbd> overlay shows. Every key is in the <a href="${root}keys/">keys cheatsheet</a>.</p>
${keysTables(secs, { level: 3, idPrefix: "keys-", filterable: false })}`;
          }
          return limitsLinks(b.limits, limits, root);
        })
        .join("\n");
    }

    const title = page?.title ?? START.title;
    const head = page ? `<h1>${escapeHtml(title)}</h1>\n<div class="intro">\n${intro}\n</div>` : "";
    const content = page ? `${head}\n${sections}` : sections;
    const src = page
      ? `<p class="source">The intro is written for this site; the rest is built from Vimma's <code>docs/${page.slug === "limits" ? "limits" : "guide"}.md</code> and <code>bindings.md</code> at <code>${escapeHtml(source.commit)}</code> (${escapeHtml(source.date)}).</p>`
      : "";
    const body = `<div class="docs">
${sidebar(nav, entry.slug, root)}
${toc(content)}
<article class="docs-body" id="doc" tabindex="-1">
<p class="crumb" aria-hidden="true"><span class="sigil">~/vimma/docs</span> $ less ${escapeHtml(entry.slug || "start-here")}.md</p>
${content}
${src}
${pager(nav, i, root)}
</article>
</div>`;
    pages.push({
      slug: entry.slug,
      out: pageUrl(entry.slug),
      title,
      description: page?.description ?? "Start here: a walk through Vimma's features, in the order you will meet them.",
      body,
    });
    index.push(...indexPage(title, entry.slug, page ? content : sections.replace(/^[\s\S]*?(?=<h1)/, "")));
  });

  return { pages, index, source };
}

function docsList(pages: DocPage[], root: string): string {
  const items = pages
    .filter((p) => p.group !== "Reference")
    .map((p) => `<li><a href="${root}${pageUrl(p.slug)}">${escapeHtml(p.title)}</a>: ${inline(p.description, { link: () => null })}</li>`)
    .join("\n");
  return `<ol class="walk">\n${items}\n</ol>`;
}
