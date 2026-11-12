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
