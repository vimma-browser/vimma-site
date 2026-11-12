// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { REDIRECTS, workerFirstPaths } from "./redirects.js";
import worker, { respond } from "./worker.js";

const ROOT = resolve(import.meta.dirname, "../..");
const PREFIX = "https://vimma.dev/support/159.0.1/Linux/en-US/";

/** The assets binding: answers every request it is handed with the request's path. */
const ASSETS = {
  fetch: (request: Request) => Promise.resolve(new Response(`asset ${new URL(request.url).pathname}`)),
};

const get = (url: string) => worker.fetch(new Request(url), { ASSETS });

test("every topic Vimma documents opens its page, not Mozilla's article", async () => {
  // Cloudflare's own _redirects sent all of these to the forward in production
  const pages: [string, string][] = [
    ["prefs-search", "/docs/config/#search-engines"],
    ["technical-and-interaction-data", "/docs/privacy/#turned-off"],
    ["addons-help", "/docs/add-ons/"],
    ["containers", "/docs/workspaces/"],
    ["firefox-help", "/support/"],
    ["preferences", "/support/"],
    ["keyboard-shortcuts-perform-firefox-tasks-quickly", "/docs/firefox-shortcuts/"],
    ["", "/support/"],
  ];
  for (const [topic, page] of pages) {
    const response = await get(PREFIX + topic);
    assert.equal(response.status, 302, topic);
    assert.equal(response.headers.get("Location"), page, topic);
  }
});

test("any other topic goes to Mozilla's article, query kept, still a 302", async () => {
  const response = await get(`${PREFIX}connection-not-secure?as=u&utm_source=inproduct`);
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://support.mozilla.org/1/firefox/159.0.1/Linux/en-US/connection-not-secure?as=u&utm_source=inproduct",
  );
});

test("a query on a Vimma page goes before its fragment", async () => {
  const response = await get(`${PREFIX}prefs-search?as=u`);
  assert.equal(response.headers.get("Location"), "/docs/config/?as=u#search-engines");
});

test("hostile topics stay on support.mozilla.org, the path as it came", async () => {
  for (const topic of ["%2F%2Fevil.example", "@evil.example", "..%2F..%2Fx", "a%0D%0ALocation:x", "x".repeat(4000)]) {
    const response = await get(PREFIX + topic);
    const location = response.headers.get("Location") ?? "";
    assert.equal(new URL(location).host, "support.mozilla.org", topic);
    assert.equal(location, `https://support.mozilla.org/1/firefox/159.0.1/Linux/en-US/${topic}`);
  }
});

test("an address without all three parts, or with more, is served as a file or not found", async () => {
  for (const path of ["/support/", "/support/159.0.1/Linux", "/support/159.0.1/Linux/en-US", "/support/a/b/c/d/e"]) {
    const response = await get(`https://vimma.dev${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), `asset ${path}`);
  }
});

test("wrangler.jsonc runs the script for /support/* and the retired pages only, the rest is plain static assets with a 404 page", () => {
  // strip the // comments that start a line: wrangler.jsonc is JSON with comments
  const text = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const config = JSON.parse(text) as { main?: string; assets?: Record<string, unknown> };
  assert.equal(config.main, "scripts/worker.ts");
  assert.deepEqual(config.assets, {
    directory: "./dist",
    binding: "ASSETS",
    run_worker_first: ["/support/*", ...workerFirstPaths()],
    not_found_handling: "404-page",
  });
});

const SAMPLE = { "/docs/old/": "/docs/new/", "/docs/gone/": "/docs/new/#gone" };
const sample = (url: string) => respond(new Request(url), { ASSETS }, SAMPLE);

test("a retired page answers 301 with its target, with or without the trailing slash", async () => {
  for (const path of ["/docs/old/", "/docs/old", "/docs/old/index.html"]) {
    const response = await sample(`https://vimma.dev${path}`);
    assert.equal(response.status, 301, path);
    assert.equal(response.headers.get("Location"), "/docs/new/", path);
  }
});

test("a retired page's query goes along, before the target's fragment", async () => {
  const response = await sample("https://vimma.dev/docs/old?x=1&y=2");
  assert.equal(response.headers.get("Location"), "/docs/new/?x=1&y=2");
  const anchored = await sample("https://vimma.dev/docs/gone/?x=1");
  assert.equal(anchored.headers.get("Location"), "/docs/new/?x=1#gone");
});

test("a target without a fragment leaves the browser's own fragment to it", async () => {
  // a browser never sends the fragment, and keeps it across a redirect whose Location has none,
  // so /docs/old/#a-heading lands on /docs/new/#a-heading
  const response = await sample("https://vimma.dev/docs/old/");
  assert.doesNotMatch(response.headers.get("Location") ?? "", /#/);
});

test("every other path goes to the assets unchanged", async () => {
  for (const path of ["/", "/docs/", "/docs/new/", "/docs/old/x", "/docs/older/", "/keys/", "/support/"]) {
    const response = await sample(`https://vimma.dev${path}?q=1`);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), `asset ${path}`);
  }
});

test("the help links still answer 302 beside the redirects", async () => {
  const response = await sample(`${PREFIX}prefs-search`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/docs/config/#search-engines");
});

test("every retired page of the site redirects with a 301 to its target", async () => {
  for (const [from, to] of Object.entries(REDIRECTS)) {
    for (const path of [from, from.slice(0, -1)]) {
      const response = await get(`https://vimma.dev${path}`);
      assert.equal(response.status, 301, path);
      assert.equal(response.headers.get("Location"), to, path);
    }
  }
});
