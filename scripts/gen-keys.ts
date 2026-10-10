// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Regenerates data/bindings.json from the synced copy of Vimma's docs/bindings.md in data/docs/
// (itself generated from actions.mjs in the main repo). `npm run docs:sync` refreshes that copy
// and then runs this; `npm run keys:sync` runs this alone. Both outputs are committed, so the site
// builds without Vimma's repository.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Binding, BindingsFile, Row, Section } from "./bindings-types.js";

const ROOT = resolve(import.meta.dirname, "../..");

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

export interface DocsSource {
  repo: string;
  ref: string;
  commit: string;
  date: string;
}

export function writeBindingsJson(): void {
  const md = readFileSync(resolve(ROOT, "data/docs/bindings.md"), "utf8");
  const src = JSON.parse(readFileSync(resolve(ROOT, "data/docs/source.json"), "utf8")) as DocsSource;
  const data: BindingsFile = {
    source: "docs/bindings.md",
    commit: src.commit,
    sections: parseBindingsMd(md),
  };
  const out = resolve(ROOT, "data/bindings.json");
  writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  const n = data.sections.reduce((sum, s) => sum + s.rows.length, 0);
  console.log(`wrote data/bindings.json: ${data.sections.length} sections, ${n} actions (${src.commit})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeBindingsJson();
