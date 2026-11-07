// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The vimma-site Worker script. wrangler.jsonc runs it first for /support/* only; every other
// request is served from dist/ by Cloudflare's static assets without it. It answers Firefox's help
// links (scripts/support.ts) and hands everything else under /support/ to the assets.
//
// A script rather than a _redirects file, because Cloudflare applied the file's placeholder rules
// in production in an order other than the file's: every topic went to the catch-all forward to
// support.mozilla.org, while `wrangler dev` applied the same file top to bottom.

import { resolveSupport } from "./support.js";

interface Env {
  /** The static assets in dist/, as wrangler.jsonc binds them. */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // url.pathname keeps the request's percent-encoding, so %2F stays inside one segment
    const to = resolveSupport(url.pathname);
    if (to === null) return env.ASSETS.fetch(request);
    // the query goes along, before a fragment, as Cloudflare's own redirects carry it
    const [path = "", hash] = to.split("#");
    const location = path + url.search + (hash === undefined ? "" : `#${hash}`);
    // 302, not 301: a browser keeps a 301 for good, so a topic that gets a Vimma page later would
    // still open Mozilla's article for anyone who followed it once
    return new Response(null, { status: 302, headers: { Location: location } });
  },
};
