// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Regenerates data/bindings.json from Vimma's docs/bindings.md (itself generated from
// actions.mjs in the main repo). The JSON is committed, so the site builds without Vimma's repo.
//
//   npm run keys:sync -- ../VimHerdr        (default: ../VimHerdr)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Binding, BindingsFile, Row, Section } from "./bindings-types.js";

const repo = resolve(process.argv[2] ?? "../VimHerdr");
const source = resolve(repo, "docs/bindings.md");
const out = resolve(import.meta.dirname, "../../data/bindings.json");

/** Special keys in Vim notation, as people write them on a keycap. */
const NAMED: Record<string, string> = {
  "<Esc>": "Esc",
  "<CR>": "Enter",
  "<Left>": "Left",
  "<Right>": "Right",
  "<Up>": "Up",
  "<Down>": "Down",
  "<lt>": "<",
  minus: "-",
};

/** `prefix+shift+t [help]` → chords ["ctrl+b", "shift+t"], mode "help". */
export function parseBinding(raw: string): Binding {
  const m = /^(.*?)(?: \[(\w+)\])?$/.exec(raw);
  let rest = m?.[1] ?? raw;
  const mode = m?.[2];
  const chords: string[] = [];
  const lead: [RegExp, string][] = [
    [/^prefix\+/, "ctrl+b"],
    [/^<C-w>/, "ctrl+w"],
    [/^<leader>/, "space"],
  ];
  for (const [re, chord] of lead) {
    if (re.test(rest)) {
      chords.push(chord);
      rest = rest.replace(re, "");
    }
  }
  chords.push(NAMED[rest] ?? rest);
  return mode ? { raw, chords, mode } : { raw, chords };
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseBindingsMd(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  for (const line of md.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h?.[1]) {
      current = { title: h[1], rows: [] };
      sections.push(current);
      continue;
    }
    if (!current || !line.startsWith("|")) continue;
    const [action, name, keys] = cells(line);
    if (!action || !name || keys === undefined) continue;
    if (action === "Action" || /^-+$/.test(action)) continue;
    const row: Row = {
      action,
      name: name.replace(/`/g, ""),
      bindings: [...keys.matchAll(/`([^`]+)`/g)].map((k) => parseBinding(k[1] ?? "")),
    };
    current.rows.push(row);
  }
  return sections.filter((s) => s.rows.length > 0);
}

function main(): void {
  const md = readFileSync(source, "utf8");
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    // not a git checkout: keep "unknown"
  }
  const data: BindingsFile = {
    source: "docs/bindings.md",
    commit,
    sections: parseBindingsMd(md),
  };
  writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  const n = data.sections.reduce((sum, s) => sum + s.rows.length, 0);
  console.log(`wrote ${out}: ${data.sections.length} sections, ${n} actions (from ${commit})`);
}

main();
