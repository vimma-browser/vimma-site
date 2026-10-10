// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/** The shape of data/bindings.json. */

export interface Binding {
  /** As written in bindings.md, e.g. `prefix+shift+t` or `<Esc> [help]`. */
  raw: string;
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
  source: string;
  commit: string;
  sections: Section[];
}
