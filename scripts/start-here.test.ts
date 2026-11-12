// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { buildDocs } from "./docs.js";

const ROOT = resolve(import.meta.dirname, "../..");
const docs = buildDocs(ROOT);
const page = (slug: string): string => {
  const body = docs.pages.find((p) => p.slug === slug)?.body ?? "";
  return /<article class="docs-body"[\s\S]*<\/article>/.exec(body)?.[0] ?? "";
};

test("Start here opens with what a reader wants to do, each a link", () => {
  const start = page("");
  const first = /<h2 id="([^"]+)"/.exec(start)?.[1];
  assert.equal(first, "i-want-to");
  const list = /<h2 id="i-want-to">[\s\S]*?<\/ul>/.exec(start)?.[0] ?? "";
  const links = [...list.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(links, [
    ["Switch from Firefox", "../docs/firefox-shortcuts/"],
    ["Learn the basic keys", "#first-five-minutes"],
    ["Split the window", "../docs/panes/"],
    ["Keep work and personal apart", "../docs/workspaces/"],
    ["Change a key", "../docs/config/"],
    ["Let an AI agent browse", "../docs/agent-workspace/"],
    ["Report a bug", "../support/#report"],
  ]);
});

test("Start here has no numbered walk, and leaves the config to its page", () => {
  const start = page("");
  assert.doesNotMatch(start, /Each page builds on the one before/);
  assert.doesNotMatch(start, /<ol class="walk">/);
  assert.doesNotMatch(start, /id="every-key-is-yours"/);
  assert.doesNotMatch(start, /The details come from Vimma's own user guide/);
});

test("the first look and the first five minutes are on Start here, not on the install page", () => {
  for (const id of ["what-you-see", "first-five-minutes"]) {
    assert.match(page(""), new RegExp(`<h2 id="${id}">`));
    assert.doesNotMatch(page("install"), new RegExp(`id="${id}"`));
  }
});
