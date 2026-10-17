// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copies what the site needs from one published Vimma release into data/, all of it from the
// commit the release's tag points to, so the pages, the docs and the keys describe the same
// release a visitor downloads:
//
//   data/release.json             the tag, versions, package names and commit (scripts/release.ts)
//   data/docs/guide.md, limits.md Vimma's docs/guide.md and docs/limits.md, and source.json
//   data/bindings.json            Vimma's docs/bindings.json, and bindings-source.json
//
//   npm run release:sync              the latest published release
//   npm run release:sync -- v0.1.2    a given release tag
//
// It calls GitHub's API (with GITHUB_TOKEN when set, for the higher rate limit) and
// raw.githubusercontent.com. The build reads only the committed files. Everything is fetched
// and checked before anything is written, so a failed sync leaves data/ as it was.
// .github/workflows/release-sync.yml runs it daily and opens a pull request when data/ changes.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { BindingsSource } from "./bindings-types.js";
import { validate as validateBindings } from "./gen-keys.js";
import { RELEASE_FILE, type Release, compareVersions, parseTitle, pickAssets, readRelease, validateRelease } from "./release.js";

const OWNER_REPO = "vimma-browser/vimma";
const REPO_URL = `https://github.com/${OWNER_REPO}`;
const API = `https://api.github.com/repos/${OWNER_REPO}`;
const DOCS = ["guide.md", "limits.md"];

/** One HTTP GET: the status and the body. Replaced by a stub in the tests. */
export type Fetcher = (url: string, accept: string) => Promise<{ status: number; text: string }>;

export const httpFetch: Fetcher = async (url, accept) => {
  const headers: Record<string, string> = { accept, "user-agent": "vimma-site release:sync" };
  const token = process.env["GITHUB_TOKEN"];
  if (token && url.startsWith("https://api.github.com/")) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  return { status: res.status, text: await res.text() };
};

interface GhRelease {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  html_url: string;
  assets: { name: string }[];
}

export interface SyncOptions {
  root: string;
  /** A release tag; the latest published release when left out. */
  tag?: string;
  fetch: Fetcher;
  log?: (msg: string) => void;
}

export async function syncRelease(opts: SyncOptions): Promise<Release> {
  const log = opts.log ?? console.log;
  const get = async (url: string, accept: string, missing?: string): Promise<string> => {
    const res = await opts.fetch(url, accept);
    if (res.status === 404 && missing) throw new Error(missing);
    if (res.status !== 200) throw new Error(`${url}: HTTP ${res.status}`);
    return res.text;
  };
  const getJson = async <T>(url: string, missing?: string): Promise<T> =>
    JSON.parse(await get(url, "application/vnd.github+json", missing)) as T;

  if (opts.tag !== undefined && !/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(opts.tag)) throw new Error(`not a release tag: ${opts.tag}`);
  const what = opts.tag ? `no published release ${opts.tag}` : "no published release";
  const gh = await getJson<GhRelease>(opts.tag ? `${API}/releases/tags/${opts.tag}` : `${API}/releases/latest`, `${what} in ${OWNER_REPO}`);
  if (gh.draft || gh.prerelease) throw new Error(`${what}: ${gh.tag_name} is a ${gh.draft ? "draft" : "pre-release"}`);
  const tag = gh.tag_name;
  if (!/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(tag)) throw new Error(`release tag ${tag} is not vX.Y.Z`);

  // GitHub's "latest" can move back (a release deleted or demoted); a scheduled run must not take
  // the site back with it. Going back to an older release takes its tag, by hand.
  if (!opts.tag && existsSync(resolve(opts.root, RELEASE_FILE))) {
    const current = readRelease(opts.root);
    if (compareVersions(tag.slice(1), current.version) < 0) {
      throw new Error(`the latest release, ${tag}, is older than ${current.tag}, which the site shows: pass the tag to go back`);
    }
  }

  const title = parseTitle(gh.name ?? "");
  const version = title.version ?? tag.slice(1);
  if (`v${version}` !== tag) throw new Error(`release title "${gh.name}" says ${version}, but its tag is ${tag}`);

  // The commit the tag points to (an annotated tag resolves to its commit too).
  const commit = await getJson<{ sha: string; commit: { committer: { date: string } } }>(`${API}/commits/${tag}`);
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) throw new Error(`unexpected commit ${commit.sha} for ${tag}`);
  const commitDate = commit.commit.committer.date.slice(0, 10);
  const raw = (path: string): Promise<string> =>
    get(`https://raw.githubusercontent.com/${OWNER_REPO}/${commit.sha}/${path}`, "text/plain", `${path} is not in ${tag}`);

  let firefox = title.firefox;
  if (!firefox) {
    const surfer = JSON.parse(await raw("surfer.json")) as { version?: { version?: unknown } };
    if (typeof surfer.version?.version !== "string") throw new Error(`surfer.json at ${tag} names no Firefox version`);
    firefox = surfer.version.version;
  }

  const release = validateRelease({
    repo: REPO_URL,
    tag,
    version,
    firefox,
    commit: commit.sha,
    published: gh.published_at.slice(0, 10),
    url: gh.html_url,
    assets: pickAssets(gh.assets.map((a) => a.name), version),
  } satisfies Release);

  const docs = await Promise.all(DOCS.map((f) => raw(`docs/${f}`)));
  const bindings = validateBindings(JSON.parse(await raw("docs/bindings.json")));

  // Everything is fetched and checked: write it.
  const write = (path: string, text: string): void => writeFileSync(resolve(opts.root, path), text);
  const asJson = (v: unknown): string => JSON.stringify(v, null, 2) + "\n";
  mkdirSync(resolve(opts.root, "data/docs"), { recursive: true });
  DOCS.forEach((f, i) => write(`data/docs/${f}`, docs[i] ?? ""));
  write("data/docs/source.json", asJson({ repo: REPO_URL, ref: tag, commit: commit.sha.slice(0, 7), date: commitDate }));
  write("data/bindings.json", asJson(bindings));
  const bindingsSource: BindingsSource = { repo: REPO_URL, path: "docs/bindings.json", commit: commit.sha, date: commitDate };
  write("data/bindings-source.json", asJson(bindingsSource));
  write(RELEASE_FILE, asJson(release));

  const n = bindings.groups.reduce((sum, g) => sum + g.actions.length, 0);
  log(`synced ${tag} (Vimma ${version}, Firefox ${firefox}) at ${commit.sha.slice(0, 7)}: ${DOCS.join(", ")} and ${n} bindings`);
  return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncRelease({ root: resolve(import.meta.dirname, "../.."), fetch: httpFetch, ...(process.argv[2] ? { tag: process.argv[2] } : {}) });
}
