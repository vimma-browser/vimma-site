// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/** Vimma's source repository, public since 2026-10-10. */
export const VIMMA_REPO = "https://github.com/JRanne/vimma";

/**
 * The shape of data/bindings.json: Vimma's docs/bindings.json as `npm run gen-docs` writes it
 * there (version 1), copied unchanged by `npm run keys:sync`.
 */
export interface VimmaBindings {
  version: 1;
  generated: string;
  /** The prefix as pressed, e.g. "ctrl+b". */
  prefix: string;
  legend: string;
  modes: string[];
  /** In the order of Vimma's own `ctrl+b ?` overlay. */
  groups: { name: string; actions: { name: string; description: string; keys: VimmaKey[] }[] }[];
}

export interface VimmaKey {
  /** As pressed, e.g. "ctrl+b shift+t". */
  keys: string;
  /** `keys` split into what is pressed one after the other: ["ctrl+b", "shift+t"]. */
  chords: string[];
  /** The mode the binding is limited to, if any (help, resize, visual, …). */
  mode?: string;
}

/** data/bindings-source.json: where and when data/bindings.json was fetched from. */
export interface BindingsSource {
  repo: string;
  path: string;
  /** The full commit hash the file was fetched at. */
  commit: string;
  /** The commit's date, YYYY-MM-DD. */
  date: string;
}

/** What the build renders from: the keys page, the docs pages' key tables and the ? overlay. */

export interface Binding {
  /** As pressed, e.g. `ctrl+b shift+t`. */
  keys: string;
  /** Keys pressed one after the other, e.g. ["ctrl+b", "shift+t"]. */
  chords: string[];
  /** The mode the binding is limited to, if any (help, resize, visual, …). */
  mode?: string;
}

export interface Row {
  action: string;
  /** The action's name in config.toml and on the `:` command line. */
  name: string;
  bindings: Binding[];
}

export interface Section {
  title: string;
  rows: Row[];
}

export interface BindingsFile {
  /** The short commit, for display. */
  commit: string;
  commitFull: string;
  date: string;
  sections: Section[];
}
