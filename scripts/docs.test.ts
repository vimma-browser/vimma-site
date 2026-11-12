// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { rank } from "../src/ts/search.js";
import { type IdMap, buildDocs, linker, packIndex, textOf } from "./docs.js";

const ROOT = resolve(import.meta.dirname, "../..");
const docs = buildDocs(ROOT);

/** The docs search as site.ts runs it: the top twelve entries, best first. */
const search = (q: string): typeof docs.index => rank(docs.index, q.toLowerCase().split(/\s+/).filter(Boolean));

test("a search entry's text keeps punctuation on its word", () => {
  assert.equal(textOf("<p>a <code>b</code> , c ( d ) .</p>"), "a b, c (d).");
});

test("a block that starts with a colon is not glued to the one before", () => {
  assert.equal(
    textOf("<li>it matched.</li>\n<li><strong><code>:mcp log</code></strong> lists</li>"),
    "it matched. :mcp log lists",
  );
});

test("the search index holds no unfilled placeholder", () => {
  const packed = JSON.stringify(packIndex(docs.index));
  assert.doesNotMatch(packed, /\{\{|\}\}/);
});

test("the search index has the release's version where a page names it", () => {
  const release = JSON.parse(readFileSync(resolve(ROOT, "data/release.json"), "utf8")) as { version: string };
  assert.ok(docs.index.some((e) => `${e.s} ${e.w}`.includes(release.version)));
});

test("a search for limits finds the known limits page first", () => {
  const hits = search("limits");
  assert.ok(hits.length > 0);
  assert.match(hits[0]?.u ?? "", /^limits\//);
});

test("the per-page known limits links and key tables are not in the index", () => {
  for (const e of docs.index) {
    assert.notEqual(e.h, "Known limits", `${e.u}`);
    assert.notEqual(e.h, "All the keys for this page", `${e.u}`);
  }
});

test("the site's script loads its modules relative to itself, not to the page", () => {
  // import() resolves against the module's URL (assets/js/), so a page-relative ROOT prefix
  // breaks on pages at another depth, such as /docs/
  const site = readFileSync(resolve(ROOT, "src/ts/site.ts"), "utf8");
  assert.doesNotMatch(site, /import\(`/);
  for (const m of site.matchAll(/import\((\w+)\)/g)) {
    assert.match(site, new RegExp(`const ${m[1]} = "\\./[\\w-]+\\.js";`), `import(${m[1]})`);
  }
});

test("the help page, the install page and About are in the search index", () => {
  // among the first five results, so the reader sees it without scrolling the list
  const near = (q: string, page: RegExp): void => {
    const hits = search(q).slice(0, 5);
    assert.ok(hits.some((e) => page.test(e.u)), `${q}: ${hits.map((e) => e.u).join(" ")}`);
  };
  near("update", /^\.\.\/install\/#updating$/);
  near("uninstall", /^\.\.\/install\/#macos$/);
  near("bug", /^\.\.\/support\/#report$/);
  near("crash", /^\.\.\/support\/#faq-and-troubleshooting$/);
  near("licence", /^\.\.\/about\//);
  near("orca", /^\.\.\/about\/#accessibility$/);
  for (const e of docs.index) assert.doesNotMatch(e.u, /\{\{|^troubleshooting/, e.u);
});

test("the help page carries the guide's FAQ, its links pointing at the docs pages", () => {
  assert.match(docs.faq, /^<h2 id="faq-and-troubleshooting">/);
  assert.match(docs.faq, /coredumpctl/);
  // the help page sits one level down, so a docs link starts with ../docs/
  assert.match(docs.faq, /href="\.\.\/docs\/tabs\/#tab-search-and-tab-rename"/);
  assert.doesNotMatch(docs.faq, /href="#(?!faq)/);
});

test("a guide link to the FAQ points at the help page, from a docs page, the help page and llms-full.txt", () => {
  const ids: IdMap = new Map([["faq-and-troubleshooting", "/support/"]]);
  const href = "#faq-and-troubleshooting";
  assert.equal(linker(ids, "tabs", "../../", "v0")(href), "../../support/#faq-and-troubleshooting");
  assert.equal(linker(ids, "/support/", "../", "v0")(href), "#faq-and-troubleshooting");
  assert.equal(linker(ids, "\0", "https://vimma.dev/", "v0")(href), "https://vimma.dev/support/#faq-and-troubleshooting");
  assert.doesNotMatch(docs.markdown, /docs\/troubleshooting/);
});

test("the search snippets of the help, install and about pages do not start with their eyebrow", () => {
  for (const e of docs.index.filter((x) => x.u.startsWith("../"))) assert.doesNotMatch(e.s, /·/, e.u);
});

test("a guide link to a heading no page shows goes to the guide on GitHub, at the release tag", () => {
  const link = linker(new Map(), "tabs", "../../", "v0.1.18", new Set(["downloads"]));
  assert.equal(link("#downloads"), "https://github.com/vimma-browser/vimma/blob/v0.1.18/docs/guide.md#downloads");
  assert.equal(link("#no-such-heading"), null);
});

test("the guide's downloads, site permissions, pop-ups and hidden toolbar link to GitHub from the site", () => {
  const tabs = docs.pages.find((p) => p.slug === "tabs")?.body ?? "";
  for (const id of ["downloads", "site-permissions", "blocked-pop-ups", "hiding-the-toolbar"]) {
    assert.match(tabs, new RegExp(`href="https://github\\.com/vimma-browser/vimma/blob/[^"]+/docs/guide\\.md#${id}"`), id);
  }
});

test("no page leaves a guide link as plain text", () => {
  for (const p of docs.pages) assert.doesNotMatch(p.body, /title="not on this site"/, p.slug);
  assert.doesNotMatch(docs.faq, /title="not on this site"/);
});

test("a limits.md link to a guide heading the site renders stays on the site", () => {
  const link = linker(new Map([["private-workspace", "workspaces"]]), "limits", "../../", "v0", new Set(["private-workspace"]));
  assert.equal(link("guide.md#private-workspace"), "../../docs/workspaces/#private-workspace");
  assert.equal(link("guide.md"), "https://github.com/vimma-browser/vimma/blob/v0/docs/guide.md");
});

test("a guide section named like its page gives its subsections a level of their own", () => {
  // the page's own title replaces the section's heading, so the subsections move up to h3 and
  // stay in the outline and the search
  const ws = docs.pages.find((p) => p.slug === "workspaces")?.body ?? "";
  assert.match(ws, /<span id="workspaces"><\/span>/);
  assert.match(ws, /<h3 id="routing-which-workspace-a-link-opens-in">/);
  assert.ok(docs.index.some((e) => e.u === "workspaces/#private-workspace"));
  // no page's outline skips a level going down
  for (const p of docs.pages) {
    const levels = [...p.body.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    levels.forEach((l, i) => assert.ok(i === 0 || l <= (levels[i - 1] ?? 1) + 1, `${p.slug}: h${levels[i - 1]} then h${l}`));
  }
});

test("Coming from Firefox holds the import, the shortcuts, the add-ons and what Vimma changes", () => {
  const body = (slug: string) => docs.pages.find((p) => p.slug === slug)?.body ?? "";
  const ff = body("firefox-shortcuts");
  // Firefox's keyboard-shortcuts help topic opens this address, so it stays
  assert.match(ff, /<h1[^>]*>Coming from Firefox<\/h1>/);
  for (const id of ["import", "what-moved", "your-add-ons", "what-vimma-changes", "moving-over-from-firefox-or-chrome", "firefoxs-own-shortcuts", "add-ons", "firefox-behaviour-vimma-changes", "keys-add-ons"]) {
    assert.match(ff, new RegExp(`id="${id}"`), id);
  }
  assert.equal(docs.pages.find((p) => p.slug === "add-ons"), undefined);
  // Privacy keeps what it turns off (a help topic's anchor), and leaves Firefox's other changes
  const privacy = body("privacy");
  assert.match(privacy, /<h2 id="turned-off">/);
  assert.doesNotMatch(privacy, /id="firefox-behaviour-vimma-changes"/);
  assert.match(privacy, /href="\.\.\/\.\.\/docs\/firefox-shortcuts\/#what-vimma-changes"/);
});

test("config.toml holds the colours and Omarchy, and the search engines' anchor", () => {
  const config = docs.pages.find((p) => p.slug === "config")?.body ?? "";
  for (const id of ["colours", "dark-or-light", "with-omarchy", "colours-and-themes", "search-engines", "configtoml"]) {
    assert.match(config, new RegExp(`id="${id}"`), id);
  }
  // the hand-written "Remap a key" says it, leader included
  assert.doesNotMatch(config, /id="every-key-is-yours"/);
  assert.match(config, /leader/);
  assert.equal(docs.pages.find((p) => p.slug === "theming"), undefined);
});
