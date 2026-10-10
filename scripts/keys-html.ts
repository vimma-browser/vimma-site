// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Key tables from data/bindings.json, for the keys page (filterable) and the docs pages.

import { escapeHtml } from "../src/ts/hero-frames.js";
import type { Binding, Section } from "./bindings-types.js";

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function bindingHtml(b: Binding): string {
  const keys = b.chords.map((c) => `<kbd>${escapeHtml(c)}</kbd>`).join(" ");
  const mode = b.mode ? `<span class="mode">${escapeHtml(b.mode)}</span>` : "";
  return `<span class="binding">${keys}${mode}</span>`;
}

export interface KeysOptions {
  /** Heading level of each section's title. */
  level?: number;
  /** Prefix for heading ids. */
  idPrefix?: string;
  /** Adds the data attributes the keys page's filter uses. */
  filterable?: boolean;
}

export function keysTables(sections: readonly Section[], opts: KeysOptions = {}): string {
  const { level = 2, idPrefix = "k-", filterable = true } = opts;
  return sections
    .map((s) => {
      const id = `${idPrefix}${slug(s.title)}`;
      const rows = s.rows
        .map((r) => {
          const search = [
            s.title,
            r.action,
            r.name,
            r.name.replace(/_/g, " "),
            ...r.bindings.map((b) => `${b.raw} ${b.chords.join(" ")} ${b.mode ?? ""}`),
          ]
            .join(" ")
            .toLowerCase();
          const keys = r.bindings.length
            ? r.bindings.map(bindingHtml).join("")
            : '<span class="nokey">no default key</span>';
          return (
            (filterable ? `<tr data-search="${escapeHtml(search)}">` : "<tr>") +
            `<td>${escapeHtml(r.action)}</td>` +
            `<td><span class="bindings">${keys}</span></td>` +
            `<td><code class="name">${escapeHtml(r.name)}</code></td></tr>`
          );
        })
        .join("\n");
      const attr = filterable ? " data-keys-section" : "";
      return `<section class="keys-section"${attr} aria-labelledby="${id}">
<h${level} id="${id}">${escapeHtml(s.title)} <span class="n">(${s.rows.length})</span></h${level}>
<table class="keys-table">
<thead><tr><th scope="col">Action</th><th scope="col">Keys</th><th scope="col">Name</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
    })
    .join("\n");
}
