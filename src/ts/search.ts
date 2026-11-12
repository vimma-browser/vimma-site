// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The docs search's scoring, shared by the site's script (site.ts imports it when the search is
// first used) and the build's tests (scripts/docs.test.ts), so both rank results the same way.

/** One entry of the docs search index, as scripts/docs.ts builds it. */
export interface SearchEntry {
  /** page title */
  p: string;
  /** section heading ("" for the page itself) */
  h: string;
  /** URL from the docs root (docs/), to keep the index small */
  u: string;
  /** a short snippet */
  s: string;
  /** the section's distinct words, lower case, space-separated, minus those in p, h and s and
   * those inside a longer word of the list */
  w: string;
}

/** How the index splits text into words; the snippet is split the same way when it is scored. */
export const WORD_SPLIT = /[\s,;()"“”'’!?]+|\.(?=\s|$)/;

/** An entry's score for the search terms (lower case): 0 unless every term is in it. */
export function score(e: SearchEntry, terms: string[]): number {
  let n = 0;
  // the index leaves the title's, heading's and snippet's words out of w (docs.ts), so they are
  // matched here
  const snippet = e.s.replace(/…$/, "").toLowerCase().split(WORD_SPLIT).join(" ");
  const head = `${e.p} ${e.h}`.toLowerCase();
  for (const t of terms) {
    const inHead = head.includes(t);
    if (!inHead && !e.w.includes(t) && !snippet.includes(t)) return 0;
    n += 1;
    if (inHead) n += 4;
    if (` ${e.w} ${snippet} ${head} `.includes(` ${t} `)) n += 1;
  }
  return n;
}
