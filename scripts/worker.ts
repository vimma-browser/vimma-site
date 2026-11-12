// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The vimma-site Worker script. wrangler.jsonc runs it first for /support/* and for the retired
// pages' addresses only; every other request is served from dist/ by Cloudflare's static assets
// without it. It answers Firefox's help links (scripts/support.ts) and the retired pages
// (scripts/redirects.ts), and hands everything else to the assets.
//
// A script rather than a _redirects file, because Cloudflare applied the file's placeholder rules
// in production in an order other than the file's: every topic went to the catch-all forward to
// support.mozilla.org, while `wrangler dev` applied the same file top to bottom.

import { REDIRECTS, type Redirects, resolveRedirect } from "./redirects.js";
import { resolveSupport } from "./support.js";

interface Env {
  /** The static assets in dist/, as wrangler.jsonc binds them. */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** A redirect to `to`, the request's query going along before `to`'s fragment. */
function redirect(to: string, search: string, status: 301 | 302): Response {
  // the query goes along, before a fragment, as Cloudflare's own redirects carry it
  const [path = "", hash] = to.split("#");
  const location = path + search + (hash === undefined ? "" : `#${hash}`);
  return new Response(null, { status, headers: { Location: location } });
}

/** The Worker's answer, with the redirects as a parameter so the tests can pass their own. */
export async function respond(request: Request, env: Env, redirects: Redirects = REDIRECTS): Promise<Response> {
  const url = new URL(request.url);
  // a retired page: 301, for good (scripts/redirects.ts)
  const moved = resolveRedirect(url.pathname, redirects);
  if (moved !== null) return redirect(moved, url.search, 301);
  // url.pathname keeps the request's percent-encoding, so %2F stays inside one segment
  const to = resolveSupport(url.pathname);
  if (to === null) return env.ASSETS.fetch(request);
  // 302, not 301: a browser keeps a 301 for good, so a topic that gets a Vimma page later would
  // still open Mozilla's article for anyone who followed it once
  return redirect(to, url.search, 302);
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => respond(request, env),
};
