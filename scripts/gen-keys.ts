// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Vimma's default bindings, for the keys page, the docs pages' key tables and the ? overlay.
//
// Vimma's `npm run gen-docs` writes docs/bindings.json from the same keymap as its default
// config.toml and its own `ctrl+b ?` overlay. `npm run release:sync` (scripts/sync-release.ts)
// copies that file, unchanged, from the commit of the latest release's tag into
// data/bindings.json, and records the commit in data/bindings-source.json. Both are committed,
// so the site builds offline and without Vimma's repository. The build reads them with
// readBindings().

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BindingsFile, BindingsSource, Section, VimmaBindings } from "./bindings-types.js";

const ROOT = resolve(import.meta.dirname, "../..");
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
