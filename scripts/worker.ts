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

import { type Env, respond } from "./respond.js";

export default {
  fetch: (request: Request, env: Env): Promise<Response> => respond(request, env),
};
