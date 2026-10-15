// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { test } from "node:test";

import { minifyCss } from "./css.js";

test("comments and the whitespace around braces and semicolons go", () => {
  const css = "/* palette */\n:root {\n  --bg: #0a0f12;\n  --fg: #c4cec8;\n}\n\na:hover,\na:focus {\n  color: var(--fg);\n}\n";
  assert.equal(minifyCss(css), ":root{--bg: #0a0f12;--fg: #c4cec8;}a:hover, a:focus{color: var(--fg);}");
});

test("a descendant combinator before a pseudo-class keeps its space", () => {
  assert.equal(minifyCss(".docs-body :is(h2, h3) {\n  margin: 0;\n}"), ".docs-body :is(h2, h3){margin: 0;}");
});

test("strings keep their spaces", () => {
  assert.equal(minifyCss('h2::before {\n  content: "## " / "";\n}'), 'h2::before{content: "## " / "";}');
  assert.equal(minifyCss("p::after { content: 'a  ;  b /* c */'; }"), "p::after{content: 'a  ;  b /* c */';}");
});
