// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Tests for scripts/release.ts (the committed release file and the build's placeholders) and
// scripts/sync-release.ts (fetching a release from GitHub), with GitHub replaced by a stub.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { type Release, fill, parseTitle, pickAssets, readRelease, releaseVars } from "./release.js";
import { type Fetcher, syncRelease } from "./sync-release.js";

const ASSETS = [
  "PKGBUILD",
  "PKGBUILD.sigstore.json",
  "SHA256SUMS",
  "vimma-0.1.2-linux-x86_64.tar.xz",
  "vimma-0.1.2-linux-x86_64.tar.xz.sigstore.json",
  "vimma-0.1.2-x86_64.AppImage",
  "vimma-0.1.2-x86_64.AppImage.sigstore.json",
  "vimma-0.1.2.cdx.json",
  "vimma_0.1.2_amd64.deb",
  "vimma_0.1.2_amd64.deb.sigstore.json",
];

const RELEASE: Release = {
  repo: "https://github.com/vimma-browser/vimma",
  tag: "v0.1.2",
  version: "0.1.2",
  firefox: "158.0",
  commit: "4466bc7e4b107893554a57e9d9d219352834a6e7",
  published: "2026-10-17",
  url: "https://github.com/vimma-browser/vimma/releases/tag/v0.1.2",
  assets: {
    deb: "vimma_0.1.2_amd64.deb",
    appimage: "vimma-0.1.2-x86_64.AppImage",
    tarball: "vimma-0.1.2-linux-x86_64.tar.xz",
  },
};

// --- the release title and assets --------------------------------------------------------------

test("title: the Vimma and Firefox versions", () => {
  assert.deepEqual(parseTitle("Vimma 0.1.2 · Firefox 158.0"), { version: "0.1.2", firefox: "158.0" });
  assert.deepEqual(parseTitle("Vimma 1.10.0 · Firefox 160.0.1"), { version: "1.10.0", firefox: "160.0.1" });
});

test("title: without the Firefox part, only the version", () => {
  assert.deepEqual(parseTitle("Vimma 0.2.0"), { version: "0.2.0" });
});

test("title: anything else is not understood", () => {
  assert.deepEqual(parseTitle("v0.1.2"), {});
  assert.deepEqual(parseTitle(""), {});
});

test("assets: the .deb, AppImage and tarball, not their signatures", () => {
  assert.deepEqual(pickAssets(ASSETS, "0.1.2"), RELEASE.assets);
});

test("assets: a missing package fails and names it", () => {
  assert.throws(() => pickAssets(ASSETS.filter((a) => !a.endsWith(".deb")), "0.1.2"), /no \.deb/);
});

test("assets: a package of another version fails", () => {
  assert.throws(() => pickAssets(ASSETS, "0.1.3"), /no \.deb/);
});

// --- placeholders -----------------------------------------------------------------------------

test("placeholders: filled from the release file", () => {
  const vars = releaseVars(RELEASE);
  assert.equal(
    fill("Vimma {{version}} on Firefox {{firefox}} ({{firefox_major}}): {{deb}}", vars, "t"),
    "Vimma 0.1.2 on Firefox 158.0 (158): vimma_0.1.2_amd64.deb",
  );
  assert.equal(fill("{{appimage}} {{tarball}} {{release_tag}}", vars, "t"), "vimma-0.1.2-x86_64.AppImage vimma-0.1.2-linux-x86_64.tar.xz v0.1.2");
});

test("placeholders: an unknown one fails the build and names the page", () => {
  assert.throws(() => fill("Vimma {{vesion}}", releaseVars(RELEASE), "install/"), /install\/: no value for \{\{vesion\}\}/);
});

// --- the committed file -----------------------------------------------------------------------

test("release file: read and checked", () => {
  const dir = mkdtempSync(join(tmpdir(), "vimma-site-"));
  try {
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data/release.json"), JSON.stringify(RELEASE));
    assert.deepEqual(readRelease(dir), RELEASE);
    writeFileSync(join(dir, "data/release.json"), JSON.stringify({ ...RELEASE, firefox: 158 }));
    assert.throws(() => readRelease(dir), /firefox/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("release file: missing fails the build", () => {
  const dir = mkdtempSync(join(tmpdir(), "vimma-site-"));
  try {
    assert.throws(() => readRelease(dir), /data\/release\.json.*release:sync/s);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the sync, against a stub of GitHub ---------------------------------------------------------

const API = "https://api.github.com/repos/vimma-browser/vimma";
const RAW = `https://raw.githubusercontent.com/vimma-browser/vimma/${RELEASE.commit}`;
const BINDINGS = { version: 1, prefix: "ctrl+b", groups: [{ name: "Tabs", actions: [{ name: "tab-new", description: "New tab", keys: [{ keys: "ctrl+b c", chords: ["ctrl+b", "c"] }] }] }] };

function github(overrides: Record<string, { status: number; text: string }> = {}): { fetch: Fetcher; urls: string[] } {
  const ok = (v: unknown): { status: number; text: string } => ({ status: 200, text: typeof v === "string" ? v : JSON.stringify(v) });
  const routes: Record<string, { status: number; text: string }> = {
    [`${API}/releases/latest`]: ok({
      tag_name: "v0.1.2",
      name: "Vimma 0.1.2 · Firefox 158.0",
      draft: false,
      prerelease: false,
      published_at: "2026-10-17T04:19:58Z",
      html_url: RELEASE.url,
      assets: ASSETS.map((name) => ({ name })),
    }),
    [`${API}/commits/v0.1.2`]: ok({ sha: RELEASE.commit, commit: { committer: { date: "2026-10-17T04:10:00Z" } } }),
    [`${RAW}/surfer.json`]: ok({ version: { product: "firefox", version: "158.0" } }),
    [`${RAW}/docs/guide.md`]: ok("# Vimma user guide\n"),
    [`${RAW}/docs/limits.md`]: ok("# Known limits\n"),
    [`${RAW}/docs/bindings.json`]: ok(BINDINGS),
    ...overrides,
  };
  const urls: string[] = [];
  const fetch: Fetcher = async (url) => {
    urls.push(url);
    return routes[url] ?? { status: 404, text: "Not Found" };
  };
  return { fetch, urls };
}

function inTmp(fn: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "vimma-site-"));
    try {
      mkdirSync(join(dir, "data/docs"), { recursive: true });
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

const json = (dir: string, p: string): unknown => JSON.parse(readFileSync(join(dir, p), "utf8"));

test(
  "sync: the latest release, its docs and keys at the tag's commit",
  inTmp(async (dir) => {
    const gh = github();
    await syncRelease({ root: dir, fetch: gh.fetch, log: () => {} });
    assert.deepEqual(json(dir, "data/release.json"), RELEASE);
    assert.equal(readFileSync(join(dir, "data/docs/guide.md"), "utf8"), "# Vimma user guide\n");
    assert.equal(readFileSync(join(dir, "data/docs/limits.md"), "utf8"), "# Known limits\n");
    assert.deepEqual(json(dir, "data/docs/source.json"), {
      repo: RELEASE.repo,
      ref: "v0.1.2",
      commit: "4466bc7",
      date: "2026-10-17",
    });
    assert.deepEqual(json(dir, "data/bindings.json"), BINDINGS);
    assert.deepEqual(json(dir, "data/bindings-source.json"), {
      repo: RELEASE.repo,
      path: "docs/bindings.json",
      commit: RELEASE.commit,
      date: "2026-10-17",
    });
    // nothing is read from a branch: every file comes from the tag's commit
    assert.ok(gh.urls.filter((u) => u.startsWith("https://raw.")).every((u) => u.startsWith(RAW)));
  }),
);

test(
  "sync: a title without Firefox takes it from surfer.json at the tag",
  inTmp(async (dir) => {
    const latest = JSON.parse((await github().fetch(`${API}/releases/latest`, "application/json")).text) as Record<string, unknown>;
    const gh = github({ [`${API}/releases/latest`]: { status: 200, text: JSON.stringify({ ...latest, name: "Vimma 0.1.2" }) } });
    await syncRelease({ root: dir, fetch: gh.fetch, log: () => {} });
    assert.equal((json(dir, "data/release.json") as Release).firefox, "158.0");
  }),
);

test(
  "sync: no published release fails and writes nothing",
  inTmp(async (dir) => {
    const gh = github({ [`${API}/releases/latest`]: { status: 404, text: "Not Found" } });
    await assert.rejects(syncRelease({ root: dir, fetch: gh.fetch, log: () => {} }), /no published release/);
    assert.throws(() => readFileSync(join(dir, "data/release.json")));
  }),
);

test(
  "sync: a tag that is not a published release fails",
  inTmp(async (dir) => {
    await assert.rejects(syncRelease({ root: dir, tag: "v9.9.9", fetch: github().fetch, log: () => {} }), /no published release v9\.9\.9/);
    await assert.rejects(syncRelease({ root: dir, tag: "main; rm", fetch: github().fetch, log: () => {} }), /not a release tag/);
  }),
);

test(
  "sync: a title whose version is not the tag's fails",
  inTmp(async (dir) => {
    const latest = JSON.parse((await github().fetch(`${API}/releases/latest`, "application/json")).text) as Record<string, unknown>;
    const gh = github({ [`${API}/releases/latest`]: { status: 200, text: JSON.stringify({ ...latest, name: "Vimma 0.1.3 · Firefox 158.0" }) } });
    await assert.rejects(syncRelease({ root: dir, fetch: gh.fetch, log: () => {} }), /0\.1\.3.*v0\.1\.2/);
  }),
);

test(
  "sync: bindings of an unknown shape fail before anything is written",
  inTmp(async (dir) => {
    const gh = github({ [`${RAW}/docs/bindings.json`]: { status: 200, text: JSON.stringify({ version: 2 }) } });
    await assert.rejects(syncRelease({ root: dir, fetch: gh.fetch, log: () => {} }), /version 2/);
    assert.throws(() => readFileSync(join(dir, "data/release.json")));
    assert.throws(() => readFileSync(join(dir, "data/docs/guide.md")));
  }),
);

test(
  "sync: a Firefox version from surfer.json that is not a version number fails",
  inTmp(async (dir) => {
    const latest = JSON.parse((await github().fetch(`${API}/releases/latest`, "application/json")).text) as Record<string, unknown>;
    const gh = github({
      [`${API}/releases/latest`]: { status: 200, text: JSON.stringify({ ...latest, name: "Vimma 0.1.2" }) },
      [`${RAW}/surfer.json`]: { status: 200, text: JSON.stringify({ version: { version: "158 <script>" } }) },
    });
    await assert.rejects(syncRelease({ root: dir, fetch: gh.fetch, log: () => {} }), /firefox/);
    assert.throws(() => readFileSync(join(dir, "data/release.json")));
  }),
);

test("release file: every field has its expected form", () => {
  const dir = mkdtempSync(join(tmpdir(), "vimma-site-"));
  try {
    mkdirSync(join(dir, "data"));
    for (const [k, v] of [
      ["tag", "0.1.2"],
      ["version", "0.1.2 x"],
      ["published", "yesterday"],
      ["url", "https://example.com/"],
    ] as const) {
      writeFileSync(join(dir, "data/release.json"), JSON.stringify({ ...RELEASE, [k]: v }));
      assert.throws(() => readRelease(dir), new RegExp(k));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "sync: the latest release older than the one the site shows is refused, unless asked for by tag",
  inTmp(async (dir) => {
    writeFileSync(join(dir, "data/release.json"), JSON.stringify({ ...RELEASE, tag: "v0.2.0", version: "0.2.0" }));
    await assert.rejects(syncRelease({ root: dir, fetch: github().fetch, log: () => {} }), /older than v0\.2\.0/);
    const gh = github({ [`${API}/releases/tags/v0.1.2`]: { status: 200, text: (await github().fetch(`${API}/releases/latest`, "")).text } });
    await syncRelease({ root: dir, tag: "v0.1.2", fetch: gh.fetch, log: () => {} });
    assert.equal((json(dir, "data/release.json") as Release).tag, "v0.1.2");
  }),
);
