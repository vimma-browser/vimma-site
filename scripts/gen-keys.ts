// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Vimma's default bindings, for the keys page, the docs pages' key tables and the ? overlay.
//
// Vimma's `npm run gen-docs` writes docs/bindings.json from the same keymap as its default
// config.toml and its own `ctrl+b ?` overlay. `npm run keys:sync` copies that file, unchanged,
// from the public repository at one commit into data/bindings.json, and records the commit in
// data/bindings-source.json. Both are committed, so the site builds offline and without Vimma's
// repository. The build reads them with readBindings().
//
//   npm run keys:sync                 the latest commit on Vimma's main
//   npm run keys:sync -- <commit>     a given commit (a full or short hash, or a branch)
//
// .github/workflows/sync-keys.yml runs it when Vimma's site-dispatch workflow says the file
// changed on main, and opens a pull request.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { BindingsFile, BindingsSource, Section, VimmaBindings } from "./bindings-types.js";

const ROOT = resolve(import.meta.dirname, "../..");
const OWNER_REPO = "JRanne/vimma";
const PATH = "docs/bindings.json";
const DATA = "data/bindings.json";
const SOURCE = "data/bindings-source.json";

function fail(msg: string): never {
  throw new Error(`${DATA}: ${msg}`);
}

const isString = (v: unknown): v is string => typeof v === "string";

/** Checks the shape the site relies on, so a change upstream fails here and not in the page. */
export function validate(data: unknown): VimmaBindings {
  const d = data as Partial<VimmaBindings> | null;
  if (!d || typeof d !== "object") fail("not an object");
  if (d.version !== 1) fail(`version ${String(d.version)}, expected 1 (update scripts/gen-keys.ts)`);
  if (!isString(d.prefix)) fail("no prefix");
  if (!Array.isArray(d.groups) || d.groups.length === 0) fail("no groups");
  for (const g of d.groups) {
    if (!isString(g.name) || !Array.isArray(g.actions)) fail("a group without a name or actions");
    for (const a of g.actions) {
      if (!isString(a.name) || !isString(a.description) || !Array.isArray(a.keys)) {
        fail(`group "${g.name}": an action without a name, description or keys`);
      }
      for (const k of a.keys) {
        const ok = isString(k.keys) && Array.isArray(k.chords) && k.chords.every(isString);
        if (!ok || (k.mode !== undefined && !isString(k.mode))) fail(`action "${a.name}": a bad key`);
      }
    }
  }
  return d as VimmaBindings;
}

export function toSections(v: VimmaBindings): Section[] {
  return v.groups.map((g) => ({
    title: g.name,
    rows: g.actions.map((a) => ({
      action: a.description,
      name: a.name,
      bindings: a.keys.map((k) =>
        k.mode ? { keys: k.keys, chords: k.chords, mode: k.mode } : { keys: k.keys, chords: k.chords },
      ),
    })),
  }));
}

export function readBindings(root: string = ROOT): BindingsFile {
  const data = validate(JSON.parse(readFileSync(resolve(root, DATA), "utf8")));
  const src = JSON.parse(readFileSync(resolve(root, SOURCE), "utf8")) as BindingsSource;
  return { commit: src.commit.slice(0, 7), commitFull: src.commit, date: src.date, sections: toSections(data) };
}

// --- keys:sync --------------------------------------------------------------------------------

async function get(url: string, accept: string): Promise<string> {
  const headers: Record<string, string> = { accept, "user-agent": "vimma-site keys:sync" };
  const token = process.env["GITHUB_TOKEN"];
  if (token && url.startsWith("https://api.github.com/")) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export async function syncBindings(ref: string): Promise<void> {
  if (!/^[\w./-]+$/.test(ref)) throw new Error(`not a commit or branch: ${ref}`);
  // Resolve the ref to a full commit first, so the file and the record agree.
  const commit = JSON.parse(
    await get(`https://api.github.com/repos/${OWNER_REPO}/commits/${ref}`, "application/vnd.github+json"),
  ) as { sha: string; commit: { committer: { date: string } } };
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) throw new Error(`unexpected commit ${commit.sha}`);
  const raw = await get(`https://raw.githubusercontent.com/${OWNER_REPO}/${commit.sha}/${PATH}`, "application/json");
  const data = validate(JSON.parse(raw));
  const source: BindingsSource = {
    repo: `https://github.com/${OWNER_REPO}`,
    path: PATH,
    commit: commit.sha,
    date: commit.commit.committer.date.slice(0, 10),
  };
  writeFileSync(resolve(ROOT, DATA), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(resolve(ROOT, SOURCE), JSON.stringify(source, null, 2) + "\n");
  const n = data.groups.reduce((sum, g) => sum + g.actions.length, 0);
  console.log(`wrote ${DATA}: ${data.groups.length} groups, ${n} actions (${commit.sha.slice(0, 7)}, ${source.date})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncBindings(process.argv[2] || "main");
}
