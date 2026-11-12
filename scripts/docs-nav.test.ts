// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { buildDocs } from "./docs.js";

const ROOT = resolve(import.meta.dirname, "../..");
const docs = buildDocs(ROOT);

/** The docs sidebar: a group for each task, its pages in reading order. */
const SIDEBAR: [string, string[]][] = [
  ["Get started", ["Start here", "Why Vimma", "Install and first launch"]],
  ["Browse with the keyboard", ["Modes and moving", "Bookmarks", "PDF viewer"]],
  ["Organise tabs and windows", ["Tabs and the window", "Split panes", "Workspaces"]],
  ["Make it yours", ["config.toml", "Theming", "Firefox shortcuts", "Add-ons"]],
  ["Use it with AI agents", ["Agent workspace", "Agent tools", "vimma-ctl"]],
  ["Trust and limits", ["Privacy defaults", "Known limits"]],
  ["Get help", ["Help", "Every key"]],
];

/** The sidebar as a page renders it: each group's name and its links' text. */
function sidebarOf(body: string): [string, string[]][] {
  const nav = /<details class="docs-pages"[\s\S]*?<\/details>/.exec(body)?.[0] ?? "";
  return [...nav.matchAll(/<p class="group"[^>]*>([^<]*)<\/p>\s*<ul>([\s\S]*?)<\/ul>/g)].map((g) => [
    g[1] ?? "",
    // a link's text only: a link with markup inside (such as a page number) does not match
    [...(g[2] ?? "").matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((a) => (a[1] ?? "").trim()),
  ]);
}

test("the docs sidebar groups the pages by task", () => {
  assert.deepEqual(sidebarOf(docs.pages[0]?.body ?? ""), SIDEBAR);
});

test("every docs page has the same sidebar, and the pages follow it", () => {
  for (const p of docs.pages) assert.deepEqual(sidebarOf(p.body), SIDEBAR, p.slug);
  assert.deepEqual(
    docs.pages.map((p) => p.group),
    // the help group links pages outside the docs
    SIDEBAR.filter(([g]) => g !== "Get help").flatMap(([g, pages]) => pages.map(() => g)),
  );
});

test("the sidebar's help group links the help page and the keys page", () => {
  for (const p of docs.pages) {
    const root = p.slug === "" ? "../" : "../../";
    assert.match(p.body, new RegExp(`<li><a href="${root}support/">Help</a></li>\\n<li><a href="${root}keys/">Every key</a></li>`), p.slug);
  }
});

test("the sidebar has no page numbers", () => {
  for (const p of docs.pages) {
    const nav = /<nav class="docs-nav"[\s\S]*?<\/nav>/.exec(p.body)?.[0] ?? "";
    assert.match(nav, /<a href=/, p.slug);
    assert.doesNotMatch(nav, /class="n"|>\d\d /, p.slug);
  }
});
