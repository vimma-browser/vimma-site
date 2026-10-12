// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copies Vimma's user docs (guide, limits) from the main repository's origin/main into
// data/docs/ and records the commit. The bindings come separately, from the public repository's
// docs/bindings.json (`npm run keys:sync`, scripts/gen-keys.ts). The docs pages are built
// from these copies, so the site builds without the main repository and never drifts silently:
// a heading or table row the docs config names that disappears upstream fails the build.
//
//   npm run docs:sync -- ../vimma      (the path to a vimma checkout; default ../vimma; ref: origin/main)
//
// It runs `git fetch` and `git show` in that repository and changes nothing else there.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";


const ROOT = resolve(import.meta.dirname, "../..");
const repo = resolve(process.argv[2] ?? "../vimma");
const ref = process.env["VIMMA_REF"] ?? "origin/main";
const FILES = ["guide.md", "limits.md"];

interface DocsSource {
  repo: string;
  ref: string;
  commit: string;
  date: string;
}

const git = (...args: string[]): string =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 16 << 20 });

if (ref.startsWith("origin/")) git("fetch", "--quiet", "origin");
const commit = git("rev-parse", "--short", ref).trim();
const date = git("log", "-1", "--format=%cs", ref).trim();

const dir = resolve(ROOT, "data/docs");
mkdirSync(dir, { recursive: true });
for (const f of FILES) writeFileSync(resolve(dir, f), git("show", `${ref}:docs/${f}`));
const source: DocsSource = { repo: "https://github.com/JRanne/vimma", ref, commit, date };
writeFileSync(resolve(dir, "source.json"), JSON.stringify(source, null, 2) + "\n");
console.log(`synced ${FILES.join(", ")} from ${ref} at ${commit} (${date}); run npm run keys:sync for the bindings`);
