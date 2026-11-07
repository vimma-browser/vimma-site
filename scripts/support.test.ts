// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { test } from "node:test";

import { FIREFOX_HELP, SUPPORT_TOPICS, redirectsFile, resolveSupport } from "./support.js";

const PREFIX = "/support/159.0.1/Linux/en-US/";

test("Firefox's general help links open the help page", () => {
  assert.equal(resolveSupport(`${PREFIX}firefox-help`), "/support/");
  assert.equal(resolveSupport(`${PREFIX}preferences`), "/support/");
  assert.equal(resolveSupport(PREFIX), "/support/");
});

test("a topic Vimma documents opens Vimma's page, whatever the version, system and language", () => {
  assert.equal(resolveSupport(`${PREFIX}technical-and-interaction-data`), "/docs/privacy/#turned-off");
  assert.equal(resolveSupport("/support/160.0/Darwin/fi/addons-help"), "/docs/add-ons/");
  assert.equal(resolveSupport("/support/x/y/z/containers"), "/docs/workspaces/");
});

test("any other topic goes to the same article in Firefox's help, on support.mozilla.org", () => {
  assert.equal(
    resolveSupport(`${PREFIX}connection-not-secure`),
    "https://support.mozilla.org/1/firefox/159.0.1/Linux/en-US/connection-not-secure",
  );
});

test("the forward never leaves support.mozilla.org, and keeps the path as it came, still encoded", () => {
  for (const topic of ["%2F%2Fevil.example", "@evil.example", "..%2F..%2Fx", "a%0D%0ALocation:x", "x".repeat(4000)]) {
    const to = resolveSupport(`${PREFIX}${topic}`);
    assert.ok(to?.startsWith(FIREFOX_HELP), `${topic} -> ${to}`);
    assert.equal(new URL(to ?? "").host, "support.mozilla.org");
    assert.equal(to, `${FIREFOX_HELP}159.0.1/Linux/en-US/${topic}`);
  }
  assert.equal(new URL(resolveSupport("/support/%2F%2Fevil.example/a/b/c") ?? "").host, "support.mozilla.org");
});

test("an address without all three parts, or with more, matches no rule", () => {
  for (const path of ["/support/159.0.1/Linux", "/support/159.0.1/Linux/en-US", "/support/a/b/c/d/e", "/support/"]) {
    assert.equal(resolveSupport(path), null, path);
  }
});

test("topics are lower-case slugs, each listed once, each pointing at a page on this site", () => {
  const seen = new Set<string>();
  for (const t of SUPPORT_TOPICS) {
    assert.match(t.to, /^\/[a-z0-9/-]*(#[a-z0-9-]+)?$/, t.to);
    for (const slug of t.slugs) {
      assert.match(slug, /^[a-z0-9-]+$/, slug);
      assert.ok(!seen.has(slug), `${slug} listed twice`);
      seen.add(slug);
    }
  }
});

test("_redirects lists the topics before the forward, which comes last", () => {
  const rules = redirectsFile()
    .split("\n")
    .filter((l) => l && !l.startsWith("#"));
  assert.equal(rules.at(-1), `/support/:version/:os/:locale/:topic ${FIREFOX_HELP}:version/:os/:locale/:topic 302`);
  assert.ok(rules.includes("/support/:version/:os/:locale/firefox-help /support/ 302"));
  // every rule a temporary redirect, so a topic that gets a Vimma page later is not cached away
  for (const r of rules) assert.match(r, /^\S+ \S+ 302$/, r);
});
