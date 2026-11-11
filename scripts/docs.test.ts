// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { test } from "node:test";

import { textOf } from "./docs.js";

test("a search entry's text keeps punctuation on its word", () => {
  assert.equal(textOf("<p>a <code>b</code> , c ( d ) .</p>"), "a b, c (d).");
});

test("a block that starts with a colon is not glued to the one before", () => {
  assert.equal(
    textOf("<li>it matched.</li>\n<li><strong><code>:mcp log</code></strong> lists</li>"),
    "it matched. :mcp log lists",
  );
});
