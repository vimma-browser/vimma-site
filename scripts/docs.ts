// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Builds the docs pages' bodies and the docs search index from data/docs/ (the synced copies of
// Vimma's guide.md and limits.md), data/bindings.json, the page list in docs-pages.ts and the
// hand-written intros in src/docs/. The site build wraps each body in the shared layout.

import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { escapeHtml } from "../src/ts/html.js";
import { type SearchEntry, WORD_SPLIT } from "../src/ts/search.js";
import { VIMMA_REPO } from "./bindings-types.js";
import { readBindings } from "./gen-keys.js";
import { type Block, DOC_PAGES, type DocPage, GUIDE_REWRITES, LIMIT_SECTIONS, STALE_LIMITS, STALE_PREFIXES } from "./docs-pages.js";
import { keysTables, slug } from "./keys-html.js";
import { ARCH_INSTALL, fill, readRelease, releaseVars } from "./release.js";
import {
  type MdSection,
  type RenderOptions,
  findSection,
  parseSections,
  rawBlocks,
  renderBlocks,
  renderSection,
  sectionIds,
} from "./md.js";
import { SUPPORT_TOPICS } from "./support.js";

export interface BuiltDoc {
  slug: string;
  /** Output path under dist/. */
  out: string;
  title: string;
  /** The sidebar group, a task ("Get started", "Make it yours", …). */
  group: string;
  /** The <title> text: the heading, or more when the heading alone says too little. */
  headTitle: string;
  description: string;
  /** The files the page is made from, for its date in the sitemap. */
  sources: string[];
  /** The page's main column: heading, intro, sections, pager. */
  body: string;
}

/**
 * The index as the docs pages load it: each page's title and path once, and each entry as an
 * array with only its fragment, so the module repeats no keys, titles or paths. site.ts unpacks
 * it into SearchEntry objects.
 */
export interface PackedIndex {
  /** [title, path from the docs root] */
  pages: [string, string][];
  /** [index into pages, h, the fragment of u ("" or "#id"), s, w] */
  entries: [number, string, string, string, string][];
}

export type { SearchEntry };

export function packIndex(index: SearchEntry[]): PackedIndex {
  const pages: [string, string][] = [];
  const entries = index.map((e): [number, string, string, string, string] => {
    const hash = e.u.indexOf("#");
    const path = hash < 0 ? e.u : e.u.slice(0, hash);
    let i = pages.findIndex(([p, u]) => p === e.p && u === path);
    if (i < 0) i = pages.push([e.p, path]) - 1;
    return [i, e.h, hash < 0 ? "" : e.u.slice(hash), e.s, e.w];
  });
  return { pages, entries };
}

interface Source {
  /** The release tag the copies were taken at. */
  ref: string;
  commit: string;
  date: string;
}

const START = { slug: "", title: "Start here", nav: "Start here", group: "Get started" };

/** Where an id from guide.md ended up: page slug ("" for Start here). */
export type IdMap = Map<string, string>;

/** A docs page's path under the site root; a slug that starts with "/" is a site path (the help page). */
const pageUrl = (s: string): string => (s.startsWith("/") ? s.slice(1) : s === "" ? "docs/" : `docs/${s}/`);
const LIMIT_ID = (title: string): string => `limit-${slug(title.replace(/\s*\(.*\)$/, ""))}`;

function fail(msg: string): never {
  throw new Error(`docs: ${msg}\n(the copy in data/docs/ comes from Vimma's latest release: update scripts/docs-pages.ts to match it)`);
}

function need(guide: MdSection, title: string): MdSection {
  return findSection(guide, title) ?? fail(`guide.md has no section "${title}"`);
}

/**
 * Link targets in guide.md and limits.md, rewritten for the site. A guide heading that no page
 * renders (`guideIds` holds every one) is linked in the guide on GitHub, at the release tag.
 */
export function linker(ids: IdMap, here: string, root: string, ref: string, guideIds: ReadonlySet<string> = new Set()): RenderOptions["link"] {
  return (href) => {
    if (/^https?:\/\//.test(href)) return href;
    const [path = "", hash = ""] = href.split("#");
    // limits.md links the guide's headings as guide.md#…, and they go where the site renders them
    if (path === "" || (path === "guide.md" && hash !== "")) {
      const page = ids.get(hash);
      if (page === undefined) {
        return guideIds.has(hash) ? `${VIMMA_REPO}/blob/${encodeURIComponent(ref)}/docs/guide.md#${hash}` : null;
      }
      return page === here ? `#${hash}` : `${root}${pageUrl(page)}#${hash}`;
    }
    if (path === "bindings.md") return `${root}keys/`;
    if (path === "limits.md") return `${root}docs/limits/`;
    if (path.endsWith("README.md")) return `${root}docs/install/`;
    // specs, ADRs, the runbook and the plan: the file in Vimma's repository on GitHub, at the
    // release the copies came from
    const file = posix.normalize(`docs/${path}`);
    if (file.startsWith("..")) return null;
    return `${VIMMA_REPO}/blob/${encodeURIComponent(ref)}/${file}${hash === "" ? "" : `#${hash}`}`;
  };
}

function idsOf(block: Block, guide: MdSection): string[] {
  if ("guide" in block) return sectionIds(need(guide, block.guide), block.exclude ?? [], !block.only);
  if ("guideParas" in block) return [block.id];
  return [];
}

/** guide.md with GUIDE_REWRITES applied; reports the rewrites that matched nothing. */
function rewriteGuide(md: string): string {
  const unused: string[] = [];
  for (const [re, to] of GUIDE_REWRITES) {
    if (!re.test(md)) unused.push(String(re));
    re.lastIndex = 0;
    md = md.replace(re, to);
  }
  if (unused.length) console.log(`  docs: ${unused.length} guide rewrite(s) matched nothing: ${unused.join(" | ")}`);
  return md;
}

function guideParas(guide: MdSection, b: Extract<Block, { guideParas: unknown }>, opts: RenderOptions, level: number): string {
  const sec = need(guide, b.guideParas.section);
  const blocks = rawBlocks(sec.body);
  const head = `<h${level} id="${b.id}">${escapeHtml(b.title)}</h${level}>\n`;
  return head + b.guideParas.startsWith
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

/** The sidebar's last group: pages outside the docs, so they are not in the previous/next order. */
const SIDEBAR_HELP: [string, string][] = [
  ["Help", "support/"],
  ["Every key", "keys/"],
];

function sidebar(all: NavEntry[], here: string, root: string): string {
  const groups: string[] = [];
  for (const e of all) if (!groups.includes(e.group)) groups.push(e.group);
  const lists = groups
    .map((g) => {
      const items = all
        .filter((e) => e.group === g)
        .map((e) => {
          const cur = e.slug === here ? ' aria-current="page"' : "";
          return `<li><a href="${root}${pageUrl(e.slug)}"${cur}>${escapeHtml(e.nav)}</a></li>`;
        })
        .join("\n");
      return `<p class="group" aria-hidden="true">${escapeHtml(g)}</p>\n<ul>\n${items}\n</ul>`;
    })
    .join("\n");
  const help = SIDEBAR_HELP.map(([text, path]) => `<li><a href="${root}${path}">${escapeHtml(text)}</a></li>`).join("\n");
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
<p class="group" aria-hidden="true">Get help</p>
<ul>
${help}
</ul>
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
export const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENT[e] ?? e)
    .replace(/\s+/g, " ")
    // A space before punctuation that ends a word goes; one before a word that starts with it
    // (`:mcp log` after "matched.") stays.
    .replace(/ ([.,;:)])(?=[\s.,;:)]|$)/g, "$1")
    .replace(/\( /g, "(")
    .trim();

/** Words too common to search by; dropped from the index to keep it small. */
const STOP = new Set(
  (
    "the and for are but not you your with that this from have has its it's into one can when then than them they their there what which who will would also only each any all was were been being more most other some such out off over too very just about after before again here how why our yet own same both few nor on in it to or is as so of by at an up if be " +
    // words that turn up in many sections and say nothing about any of them
    "every does never first without nothing where still while next see another until through two three already under goes instead once like cannot within itself always even either anything way made gets below whole alone last stay go must need needs should could may might can't doesn't don't isn't because since though however rather much many well now something everything thing things"
  ).split(" "),
);

/**
 * Verb forms that describe what something does in almost every section ("opens", "shows"). They
 * are dropped after the substring rule below, so they do not bring back the shorter form they
 * contain ("open" stays covered by "opens" in another word, the heading or the snippet, or is
 * dropped with it): a search for them finds the sections whose heading or snippet has them.
 */
const WEAK = new Set(
  "shows opens keeps closes stays lists takes says leaves changes runs moves asks gets puts adds uses starts follows sees goes makes comes gives brings sets works needs turns".split(" "),
);

/** A page's search entries; `url` is its path from the docs root (docs/), as the index stores it. */
function indexPage(title: string, url: string, body: string): SearchEntry[] {
  const parts = body.split(/(?=<h[23] id=")/);
  return parts.flatMap((part, i) => {
    const m = /^<h[23] id="([^"]+)">([\s\S]*?)<\/h[23]>/.exec(part);
    if (i > 0 && !m) return [];
    // the per-page key tables repeat the keys page, which has its own filter, and the per-page
    // known limits links repeat the known limits page's headings: a search for "limits" would
    // list every page before the known limits page itself
    if (m && (m[1] === "default-keys" || m[1] === "known-limits" || m[1]?.startsWith("keys-"))) return [];
    const heading = m ? textOf(m[2] ?? "").replace(/\s*\(\d+\)$/, "") : "";
    // no scheme-qualified URLs in the shipped index: it is data, and `npm run check` keeps the
    // site's JS free of URLs; `example.com` still finds them
    const text = textOf(m ? part.slice(m[0].length) : part).replace(/\b[a-z]+:\/\//g, "");
    // the page title, heading and snippet are in the entry already (p, h, s), and the search
    // matches them there (site.ts), so the word list leaves out the words they hold
    const s = text.length > 80 ? `${text.slice(0, 77).replace(/\s\S*$/, "")}…` : text;
    const head = new Set(`${title} ${heading} ${s.replace(/…$/, "")}`.toLowerCase().split(WORD_SPLIT));
    // a colon or full stop at a word's end is punctuation ("page:", "x86_64."), not part of the
    // word: without it the word folds into the same word elsewhere in the section
    const distinct = [...new Set(text.toLowerCase().split(WORD_SPLIT).map((w) => w.replace(/[:.]+$/, "")))].filter((w) => w.length > 1 && !STOP.has(w) && !head.has(w));
    // the search matches substrings (site.ts), so a word inside a longer one ("tab" in "tabs"),
    // in the list or in p, h and s, is found there anyway; only the small bonus for a whole-word
    // match is lost
    const longer = [...distinct, ...head];
    const words = distinct
      .filter((w) => !longer.some((o) => o !== w && o.includes(w)))
      .filter((w) => !WEAK.has(w))
      .join(" ");
    return [{ p: title, h: heading, u: `${url}${m ? `#${m[1]}` : ""}`, s, w: words }];
  });
}

// --- build ------------------------------------------------------------------------------------

/** The guide section the help page shows as its FAQ, and the help page's path as an IdMap entry. */
const FAQ = "FAQ and troubleshooting";
const HELP = "/support/";

/** The site's pages the docs search covers besides the docs: the file in src/pages/, its title. */
const SITE_PAGES: [string, string][] = [
  ["support.html", "Help"],
  ["install.html", "Install"],
  ["about.html", "About"],
];

/** The help page's list of Firefox topics that open a Vimma page (the help page itself left out). */
export function topicList(root: string): string {
  const items = SUPPORT_TOPICS.filter((t) => t.to !== HELP).map(
    (t) => `  <li><a href="${root}${t.to.slice(1)}">${escapeHtml(t.title)}</a></li>`,
  );
  return `<ul>\n${items.join("\n")}\n</ul>`;
}

export function buildDocs(rootDir: string): {
  pages: BuiltDoc[];
  index: SearchEntry[];
  source: Source;
  markdown: string;
  /** The guide's FAQ, rendered for the help page ({{faq}} in src/pages/support.html). */
  faq: string;
} {
  const read = (p: string): string => readFileSync(join(rootDir, p), "utf8");
  const guideMd = rewriteGuide(read("data/docs/guide.md"));
  const limitsMd = read("data/docs/limits.md");
  const guide = parseSections(guideMd);
  const limits = parseSections(limitsMd);
  const keys = readBindings(rootDir);
  const source = JSON.parse(read("data/docs/source.json")) as Source;
  // the release's facts ({{version}}, {{arch_install}}): build.ts fills them in each page once
  // it is laid out, so the index text is filled here, or it would hold the placeholders
  const vars = { ...releaseVars(readRelease(rootDir)), arch_install: escapeHtml(ARCH_INSTALL) };

  const nav: NavEntry[] = [START, ...DOC_PAGES.map((p) => ({ ...p, nav: p.nav ?? p.title }))];

  // which page renders which guide heading, so #links can cross pages
  const ids: IdMap = new Map();
  for (const p of DOC_PAGES) for (const b of p.blocks) for (const id of idsOf(b, guide)) if (!ids.has(id)) ids.set(id, p.slug);
  // every guide heading, so a link to one no page renders goes to the guide on GitHub
  const guideIds = new Set(sectionIds(guide).filter(Boolean));
  // the guide's FAQ is on the help page (src/pages/support.html, {{faq}}), one level down
  const faqSection = need(guide, FAQ);
  for (const id of sectionIds(faqSection)) ids.set(id, HELP);
  const faq = `${renderSection(faqSection, { link: linker(ids, HELP, "../", source.ref, guideIds) }, 2)}
<p class="source">The FAQ is built from Vimma's <code>docs/guide.md</code> at <a href="${VIMMA_REPO}/commit/${escapeHtml(source.commit)}"><code>${escapeHtml(source.commit)}</code></a> (${escapeHtml(source.date)}).</p>`;

  const pages: BuiltDoc[] = [];
  const index: SearchEntry[] = [];

  nav.forEach((entry, i) => {
    const page: DocPage | undefined = DOC_PAGES.find((p) => p.slug === entry.slug);
    const depth = entry.slug === "" ? 1 : 2;
    const root = "../".repeat(depth);
    const opts: RenderOptions = { link: linker(ids, entry.slug, root, source.ref, guideIds) };
    const introFile = `src/docs/${entry.slug || "start-here"}.html`;
    const intro = read(introFile)
      .replace(/^<!--[\s\S]*?-->\n?/, "")
      .replace(/\{\{root\}\}/g, root);

    let sections = "";
    if (!page) {
      sections = intro;
    } else if (page.slug === "limits") {
      sections = limitsPage(limits, opts);
    } else {
      // the guide.md blocks sit under one "Details" heading, a level down
      const level = 3;
      let detailsOpen = false;
      // keys first, then the guide.md text, then the limits links
      const rank = (b: Block): number => ("keys" in b ? 0 : "limits" in b ? 2 : 1);
      sections = [...page.blocks]
        .sort((a, b) => rank(a) - rank(b))
        .map((b) => {
          let html: string;
          if ("guide" in b || "guideParas" in b) {
            if ("guide" in b) {
              const sec = need(guide, b.guide);
              // a section named like the page needs no second heading; keep its anchor, and
              // render it a level up, so its subsections are h3 under Details, not h4
              const named = sec.title.toLowerCase() === page.title.toLowerCase();
              html = renderSection(sec, opts, named ? level - 1 : level, b.exclude ?? [], !b.only);
              if (named) {
                html = html.replace(/^<h(\d) id="([^"]+)">[\s\S]*?<\/h\1>/, '<span id="$2"></span>');
              }
            } else {
              html = guideParas(guide, b, opts, level);
            }
            if (!detailsOpen) {
              detailsOpen = true;
              html = `<h2 id="details" class="details-head">Details</h2>
<p class="details-note">Everything below is Vimma's own user guide for this topic, in full: every edge case and exception. You do not need it to get started.</p>
${html}`;
            }
            return html;
          }
          if ("keys" in b) {
            const secs = b.keys.map((t) => keys.sections.find((s) => s.title === t) ?? fail(`bindings.json has no group "${t}"`));
            return `<h2 id="default-keys">All the keys for this page</h2>
<p>The default bindings, as Vimma's own <kbd>ctrl+b</kbd> <kbd>?</kbd> overlay lists them. <em>Name</em> is the action's name, which you use to <a href="${root}docs/config/">remap it</a> or to run it as a <code>:</code> command. Every key is on the <a href="${root}keys/">keys page</a>.</p>
${keysTables(secs, { level: 3, idPrefix: "keys-", filterable: false })}`;
          }
          return limitsLinks(b.limits, limits, root);
        })
        .join("\n");
    }

    const title = page?.title ?? START.title;
    const head = page ? `<h1>${escapeHtml(title)}</h1>\n${intro}` : "";
    const content = page ? `${head}\n${sections}` : sections;
    const hasKeys = !!page?.blocks.some((b) => "keys" in b);
    const src = page && !page.handWritten
      ? `<p class="source">The guide at the top is written for this site; the details are built from Vimma's <code>docs/${page.slug === "limits" ? "limits" : "guide"}.md</code> at <a href="${VIMMA_REPO}/commit/${escapeHtml(source.commit)}"><code>${escapeHtml(source.commit)}</code></a> (${escapeHtml(source.date)})${hasKeys ? `, and the keys from <code>docs/bindings.json</code> at <a href="${VIMMA_REPO}/commit/${escapeHtml(keys.commitFull)}"><code>${escapeHtml(keys.commit)}</code></a> (${escapeHtml(keys.date)})` : ""}.</p>`
      : "";
    const body = `<div class="docs">
${sidebar(nav, entry.slug, root)}
${toc(content)}
<article class="docs-body" id="doc" tabindex="-1">
${content}
${src}
${pager(nav, i, root)}
</article>
</div>`;
    const fromGuide = page && !page.handWritten ? [page.slug === "limits" ? "data/docs/limits.md" : "data/docs/guide.md"] : [];
    pages.push({
      slug: entry.slug,
      out: pageUrl(entry.slug),
      title,
      group: entry.group,
      headTitle: page ? (page.headTitle ?? title) : "Start here: your first five minutes in Vimma",
      description: page?.description ?? "Start here: what you see first, your first five minutes, and where to go for what you want to do.",
      sources: [introFile, ...fromGuide, ...(hasKeys ? ["data/bindings.json"] : [])],
      body,
    });
    const indexed = page ? content : sections.replace(/^[\s\S]*?(?=<h1)/, "");
    index.push(...indexPage(title, pageUrl(entry.slug).slice("docs/".length), fill(indexed, vars, `docs index: ${entry.slug || "start-here"}`)));
  });

  // the help, install and about pages, so a search for "update", "uninstall" or "bug" finds them;
  // their paths are relative to docs/, where the search's links start
  for (const [file, title] of SITE_PAGES) {
    const src = read(`src/pages/${file}`);
    const meta = JSON.parse(/^<!--(\{.*?\})-->\n/s.exec(src)?.[1] ?? fail(`src/pages/${file}: no meta line`)) as { out: string };
    // the eyebrow repeats the headings below it, and would start every snippet
    const html = src.replace(/^<!--\{.*?\}-->\n/s, "").replace(/<p class="eyebrow">[\s\S]*?<\/p>\n?/, "");
    const filled = fill(html, { ...vars, root: "../", faq, support_topics: topicList("../") }, `docs index: ${file}`);
    index.push(...indexPage(title, `../${meta.out}`, filled));
  }

  return { pages, index, source, markdown: fullMarkdown(guideMd, limitsMd, ids, source, guideIds), faq };
}

/**
 * Vimma's guide and known limits as one Markdown file (llms-full.txt), with the same rewrites as
 * the docs pages and every link made absolute: to the docs page that renders the heading, or to
 * the file on GitHub.
 */
function fullMarkdown(guideMd: string, limitsMd: string, ids: IdMap, source: Source, guideIds: ReadonlySet<string>): string {
  const link = linker(ids, "\0", "https://vimma.dev/", source.ref, guideIds);
  const fix = (md: string, file: string): string =>
    md.replace(/\]\(([^)\s]+)\)/g, (all, href: string) => {
      const to = link(href.startsWith("#") && file === "limits.md" ? `limits.md${href}` : href);
      return to === null ? all : `](${to})`;
    });
  const note = `<!-- Vimma's user guide and known limits, from ${VIMMA_REPO} at ${source.commit} (${source.date}). The site's docs at https://vimma.dev/docs/ are built from the same text. -->`;
  return `${note}\n\n${fix(guideMd, "guide.md").trim()}\n\n${fix(limitsMd, "limits.md").trim()}\n`;
}
