// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Tests for scripts/wording.ts. The strings below quote the phrases the check rejects, so the
// check skips this file (process-wording: the test data names the phrases).

import assert from "node:assert/strict";
import { test } from "node:test";

import { commentStyle, findCommentWording, findProcessWording } from "./wording.js";

const phrases = (found: { phrase: string }[]): string[] => found.map((f) => f.phrase);

test("prose: who asked for a change is process wording", () => {
  assert.deepEqual(phrases(findProcessWording("Removes the leader, at the user's request.")), ["user's request"]);
  assert.deepEqual(phrases(findProcessWording('The user\'s words (2026-10-12): "mirror the keys"')), ["user's words"]);
  assert.deepEqual(phrases(findProcessWording("Set to yes (the maintainer).")), ["(the maintainer)"]);
  assert.deepEqual(phrases(findProcessWording("Picked by the coordinator.")), ["coordinator"]);
  assert.deepEqual(phrases(findProcessWording("See https://claude.ai/code/session_01ABC")), ["claude.ai/code/session"]);
});

test("prose: a phrase broken across lines is found, on the line where it starts", () => {
  assert.deepEqual(findProcessWording("intro\n\nDone at the user's\nrequest, today."), [
    { line: 3, phrase: "user's request" },
  ]);
});

test("prose: product wording does not match", () => {
  assert.deepEqual(findProcessWording("Every request an agent makes waits for the user's answer."), []);
  assert.deepEqual(findProcessWording("Claude Code and Codex start vimma-ctl mcp."), []);
  assert.deepEqual(findProcessWording("Restore the previous session."), []);
});

test("prose: a marker with a reason exempts its paragraph only", () => {
  const md = "<!-- process-wording: the rule names the phrase -->\nNo user's request here.\n\nA user's request.";
  assert.deepEqual(findProcessWording(md), [{ line: 4, phrase: "user's request" }]);
  assert.equal(findProcessWording("<!-- process-wording: -->\nA user's request.").length, 1);
});

test("comments: review attributions and the agent instructions file are process wording", () => {
  assert.deepEqual(phrases(findCommentWording("// per the security review of #12\nconst a = 1;", "slash")), [
    "security review of #12",
  ]);
  assert.deepEqual(phrases(findCommentWording("x = 1 # see CLAUDE.md", "hash")), ["CLAUDE.md"]);
  assert.deepEqual(phrases(findCommentWording("/* the user (2026-10-12): keep it */", "slash")), ["user (2026-"]);
});

test("comments: only comments are read, and a marker exempts its block", () => {
  assert.deepEqual(findCommentWording('const s = "the user\'s request";', "slash"), []);
  assert.deepEqual(findCommentWording("const u = 'https://x.dev/a'; // fine", "slash"), []);
  assert.deepEqual(findCommentWording("// process-wording: quotes the phrase\n// a user's request", "slash"), []);
});

test("comment styles by extension", () => {
  assert.equal(commentStyle("scripts/check.ts"), "slash");
  assert.equal(commentStyle("assets/css/site.css"), "slash");
  assert.equal(commentStyle(".github/workflows/ci.yml"), "hash");
  assert.equal(commentStyle("scripts/video.sh"), "hash");
  assert.equal(commentStyle("data/bindings.json"), null);
});
