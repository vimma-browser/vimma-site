// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Pages the site no longer builds, each with the page that now holds its content. The Worker
// script (scripts/worker.ts) answers them with a 301, so old links, bookmarks and search results
// keep landing; wrangler.jsonc runs the script first for exactly these paths (workerFirstPaths).
// `npm run check` fails if a target is not a built page with its fragment, or if a retired page is
// still built, since the static asset would then never be served.
//
// A 301, unlike the help links' 302: a retired address never comes back, and a 301 lets browsers
// and search engines move to the new one for good. A target without a fragment keeps the
// reader's own (a browser carries it across a redirect whose Location has none), so an old link
// to a heading lands on that heading when the new page keeps its id.

/** Retired page → its new home, both root-relative with the trailing slash. */
export type Redirects = Readonly<Record<string, string>>;

export const REDIRECTS: Redirects = {
  // "Vimma compared" is the second half of "Why Vimma"
  "/docs/compared/": "/docs/why/#compared",
  // Accessibility is a section of About, with a link to the guide's full section
  "/docs/accessibility/": "/about/#accessibility",
  // the first checks and the guide's FAQ are on the help page
  "/docs/troubleshooting/": "/support/#first-checks",
};

/** The address a request path is redirected to, or null when it is not a retired page. */
export function resolveRedirect(path: string, redirects: Redirects = REDIRECTS): string | null {
  const page = path.endsWith("/index.html") ? path.slice(0, -"index.html".length) : path.endsWith("/") ? path : `${path}/`;
  return Object.hasOwn(redirects, page) ? (redirects[page] ?? null) : null;
}

/** wrangler.jsonc's run_worker_first entries for the redirects: each page's three spellings. */
export function workerFirstPaths(redirects: Redirects = REDIRECTS): string[] {
  return Object.keys(redirects).flatMap((from) => [from.slice(0, -1), from, `${from}index.html`]);
}
