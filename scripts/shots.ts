// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Takes the front page's screenshots from a real Vimma build: serves the demo sites in
// shots/pages/ as an HTTP proxy on 127.0.0.1:8139 (so the URL bar shows news.example, not a
// port), runs shots/scenarios/ with Vimma's own end-to-end harness under Xvfb, and writes each
// screenshot to assets/img/shots/ as AVIF and WebP. The images are committed, so building the
// site needs none of this.
//
//   npm run shots -- ../vimma           # needs that checkout's build, Xvfb, ImageMagick, avifenc
//   npm run shots -- --serve            # only the proxy, to look at the pages:
//                                       # curl -x 127.0.0.1:8139 http://news.example/

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const PAGES = join(ROOT, "shots/pages");
const PORT = 8139; // also in the scenario's network.proxy.http_port
const OUT = join(ROOT, "assets/img/shots");

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css" };

/** `http://news.example/show` → shots/pages/news.example/show.html; `/style.css` is shared. */
function pageFile(rawUrl: string): string | null {
  const url = new URL(rawUrl);
  if (url.pathname === "/style.css") return join(PAGES, "style.css");
  const name = url.pathname === "/" ? "index" : url.pathname.slice(1);
  const file = normalize(join(PAGES, url.hostname, `${name}.html`));
  return file.startsWith(PAGES + "/") && existsSync(file) ? file : null;
}

const server = createServer((req, res) => {
  if (process.env.SHOTS_KEEP) console.log(`  shots: ${req.method} ${req.url}`);
  // a proxy request carries the whole URL: GET http://news.example/show
  const file = req.url?.startsWith("http://") ? pageFile(req.url) : null;
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

if (process.argv[2] === "--serve") {
  server.listen(PORT, "127.0.0.1", () => console.log(`demo sites on proxy 127.0.0.1:${PORT}; ctrl+c to stop`));
} else {
  await takeShots(resolve(process.argv[2] ?? "../vimma"));
}

async function takeShots(vimma: string): Promise<void> {
  if (!existsSync(join(vimma, "tools/e2e/e2e.mjs"))) {
    console.error(`usage: npm run shots -- path/to/vimma-checkout (no tools/e2e/e2e.mjs in ${vimma})`);
    process.exit(2);
  }

  await new Promise<void>((done) => server.listen(PORT, "127.0.0.1", done));
  const tmp = mkdtempSync(join(tmpdir(), "vimma-shots-"));
  let status = 1;
  try {
    // not spawnSync: the proxy above has to keep answering while the browser runs
    const run = spawn(
      "npm",
      [
        "run", "e2e", "--",
        "--xvfb",
        "--scenarios", join(ROOT, "shots/scenarios"),
        "--baselines", join(tmp, "raw"),
        "--out", join(tmp, "out"),
        "--update-baselines",
        ...(process.env.SHOTS_KEEP ? ["--keep"] : []),
      ],
      { cwd: vimma, stdio: "inherit" },
    );
    status = await new Promise<number>((done) => run.on("close", (code) => done(code ?? 1)));
    mkdirSync(OUT, { recursive: true });
    const raw = join(tmp, "raw");
    const shots = existsSync(raw) ? readdirSync(raw).filter((f) => f.startsWith("hero-") && f.endsWith(".png")) : [];
    for (const f of shots) {
      const name = f.replace(/\.png$/, "");
      execFileSync("magick", [join(raw, f), "-strip", "-quality", "80", join(OUT, `${name}.webp`)]);
      execFileSync("avifenc", ["-q", "60", "-s", "4", join(raw, f), join(OUT, `${name}.avif`)], { stdio: "ignore" });
      console.log(`  shots: ${name}`);
    }
    if (process.env.SHOTS_KEEP) console.log(`  shots: raw captures kept in ${raw}`);
  } finally {
    server.close();
    if (!process.env.SHOTS_KEEP) rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(status);
}
