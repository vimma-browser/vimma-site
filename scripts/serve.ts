// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// A tiny static server for dist/, on 127.0.0.1 only. `npm run serve` (PORT=8080 by default).
// Directories serve their index.html; anything missing gets dist/404.html with status 404.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const DIST = resolve(import.meta.dirname, "../../dist");
const PORT = Number(process.env["PORT"] ?? 8080);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

if (!existsSync(DIST)) {
  console.error("dist/ is missing: run `npm run build` first");
  process.exit(1);
}

function resolvePath(urlPath: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return null;
  }
  const file = normalize(join(DIST, p));
  if (file !== DIST && !file.startsWith(DIST + sep)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) {
    const index = join(file, "index.html");
    return existsSync(index) ? index : null;
  }
  return existsSync(file) ? file : null;
}

createServer((req, res) => {
  const url = req.url ?? "/";
  // /keys → /keys/, so the page's relative links resolve as they will when deployed
  const asDir = join(DIST, url.split("?")[0] ?? "");
  if (!url.endsWith("/") && existsSync(asDir) && statSync(asDir).isDirectory()) {
    res.writeHead(301, { Location: url + "/" });
    res.end();
    return;
  }
  const file = resolvePath(url);
  const status = file ? 200 : 404;
  const path = file ?? join(DIST, "404.html");
  res.writeHead(status, {
    "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(path).pipe(res);
  console.log(`${status} ${req.method ?? "GET"} ${url}`);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`serving dist/ at http://127.0.0.1:${PORT}/`);
});
