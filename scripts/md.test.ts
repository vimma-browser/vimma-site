// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { test } from "node:test";

import { inline } from "./md.js";

const opts = { link: (href: string): string | null => href };

test("bold around a code span is bold", () => {
  assert.equal(
    inline("- **`:mcp log`** lists what agents did", opts),
    "- <strong><code>:mcp log</code></strong> lists what agents did",
  );
  assert.equal(inline("**Run `npm ci` first**", opts), "<strong>Run <code>npm ci</code> first</strong>");
});

test("bold and emphasis around a link", () => {
  assert.equal(inline("**[guide](guide.md)**", opts), '<strong><a href="guide.md">guide</a></strong>');
  assert.equal(inline("see _[guide](guide.md)_.", opts), 'see <em><a href="guide.md">guide</a></em>.');
});

test("asterisks inside a code span stay text", () => {
  assert.equal(inline("`**not bold**` and **bold**", opts), "<code>**not bold**</code> and <strong>bold</strong>");
  assert.equal(inline("`a` ** `b`", opts), "<code>a</code> ** <code>b</code>");
});

test("Markdown never brings in raw HTML", () => {
  assert.equal(
    inline('**<img src=x onerror="a()">** `<b>` [<i>x</i>](u"v)', opts),
    "<strong>&lt;img src=x onerror=&quot;a()&quot;&gt;</strong> <code>&lt;b&gt;</code> " +
      '<a href="u&quot;v">&lt;i&gt;x&lt;/i&gt;</a>',
  );
});

test("text that looks like a placeholder stays text", () => {
  const s = "" + "0 **`x`** 0";
  const out = inline(s, opts);
  assert.equal(out.match(/<code>/g)?.length, 1);
  assert.ok(!out.includes("") && !out.includes(""), out);
});
