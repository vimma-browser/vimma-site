// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { test } from "node:test";

import { REDIRECTS, resolveRedirect, workerFirstPaths } from "./redirects.js";

const SAMPLE = { "/docs/old/": "/docs/new/", "/docs/gone/": "/docs/new/#gone" };

test("a retired page goes to its target, with or without the trailing slash or index.html", () => {
  for (const path of ["/docs/old/", "/docs/old", "/docs/old/index.html"]) {
    assert.equal(resolveRedirect(path, SAMPLE), "/docs/new/", path);
  }
  assert.equal(resolveRedirect("/docs/gone", SAMPLE), "/docs/new/#gone");
});

test("any other path has no redirect", () => {
  for (const path of ["/", "/docs/", "/docs/new/", "/docs/old/x", "/docs/older/", "/docs/ol", "/support/", "/docs/OLD/"]) {
    assert.equal(resolveRedirect(path, SAMPLE), null, path);
  }
});

test("the worker runs first for each retired page's three spellings", () => {
  assert.deepEqual(workerFirstPaths(SAMPLE), [
    "/docs/old",
    "/docs/old/",
    "/docs/old/index.html",
    "/docs/gone",
    "/docs/gone/",
    "/docs/gone/index.html",
  ]);
});

test("every redirect is a page on this site that is not itself retired, and none is under /support/", () => {
  for (const [from, to] of Object.entries(REDIRECTS)) {
    assert.match(from, /^\/[a-z0-9/-]+\/$/, from);
    assert.match(to, /^\/[a-z0-9/-]*\/(#[a-z0-9-]+)?$/, `${from} → ${to}`);
    assert.ok(!from.startsWith("/support/"), from);
    assert.equal(resolveRedirect(to.split("#")[0] ?? "", REDIRECTS), null, `${from} → ${to} is a chain`);
  }
});
