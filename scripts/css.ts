// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The stylesheet is loaded by every page and counts towards each page's weight budget (README,
// "npm run check"), so the build ships it without comments and without the whitespace around
// `{`, `}` and `;`. Nothing else is rewritten: spaces elsewhere can be a descendant combinator
// (`.a :is(b)`), and strings keep every character. The source in assets/css/ stays readable, and
// `npm run check` reads the palettes from it.

/** A string literal, or a comment, in CSS source. */
const TOKEN = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g;

export function minifyCss(css: string): string {
  const squeeze = (s: string): string => s.replace(/\s+/g, " ").replace(/\s*([{};])\s*/g, "$1");
  let out = "";
  let code = "";
  let at = 0;
  for (const m of css.matchAll(TOKEN)) {
    code += css.slice(at, m.index);
    at = m.index + m[0].length;
    if (m[1] === undefined) {
      // a comment between two words still separates them
      code += " ";
      continue;
    }
    out += squeeze(code) + m[1];
    code = "";
  }
  return (out + squeeze(code + css.slice(at))).trim();
}
