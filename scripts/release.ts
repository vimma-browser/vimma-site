// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The Vimma release the site describes, and the build's {{placeholders}} filled from it.
//
// data/release.json is written by `npm run release:sync` (scripts/sync-release.ts) and committed,
// so the build never calls GitHub: it works offline, and Cloudflare's builders, which share
// GitHub's unauthenticated rate limit, cannot fail it. Pages say {{version}}, {{firefox}},
// {{deb}} and so on instead of typing a version, so a sync updates every page at once.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const RELEASE_FILE = "data/release.json";

/** data/release.json. */
export interface Release {
  repo: string;
  /** The release's tag, e.g. v0.1.2. */
  tag: string;
  /** Vimma's version, e.g. 0.1.2. */
  version: string;
  /** The Firefox release it is built on, e.g. 158.0. */
  firefox: string;
  /** The full hash of the commit the tag points to; the docs and keys are copied from it. */
  commit: string;
  /** The day the release was published, YYYY-MM-DD. */
  published: string;
  /** The release's page on GitHub. */
  url: string;
  /** The package file names in the release. */
  assets: { deb: string; appimage: string; tarball: string };
}

/**
 * The Arch Linux install and update command. It builds in a fixed cache directory, so it runs
 * from anywhere, the same line installs and updates, and the directory can be deleted at any time.
 */
export const ARCH_INSTALL =
  "mkdir -p ~/.cache/vimma-build && cd ~/.cache/vimma-build && curl -fLO https://github.com/vimma-browser/vimma/releases/latest/download/PKGBUILD && makepkg -si";

/** "Vimma 0.1.2 · Firefox 158.0": the title Vimma's release workflow gives each release. */
export function parseTitle(title: string): { version?: string; firefox?: string } {
  const m = /^Vimma (\d+\.\d+\.\d+(?:-[\w.]+)?)(?:\s+·\s+Firefox (\d+(?:\.\d+)*))?$/.exec(title.trim());
  if (!m?.[1]) return {};
  return m[2] ? { version: m[1], firefox: m[2] } : { version: m[1] };
}

const PACKAGES: [keyof Release["assets"], string, (name: string, v: string) => boolean][] = [
  ["deb", ".deb", (n, v) => n === `vimma_${v}_amd64.deb`],
  ["appimage", "AppImage", (n, v) => n === `vimma-${v}-x86_64.AppImage`],
  ["tarball", "tarball", (n, v) => /^vimma-(.+)-linux-x86_64\.tar\.(xz|gz|zst)$/.exec(n)?.[1] === v],
];

/** The .deb, AppImage and tarball of `version` among a release's asset names. */
export function pickAssets(names: string[], version: string): Release["assets"] {
  const out: Partial<Release["assets"]> = {};
  for (const [key, label, match] of PACKAGES) {
    const found = names.filter((n) => match(n, version));
    if (found.length !== 1) {
      throw new Error(`release ${version}: ${found.length ? `more than one ${label}` : `no ${label}`} among ${names.join(", ")}`);
    }
    out[key] = found[0] as string;
  }
  return out as Release["assets"];
}

const isString = (v: unknown): v is string => typeof v === "string" && v !== "";

/** Checks the shape the build relies on, so a bad file fails here and not in a page. */
export function validateRelease(data: unknown): Release {
  const fail = (msg: string): never => {
    throw new Error(`${RELEASE_FILE}: ${msg} (run npm run release:sync)`);
  };
  const r = data as Partial<Release> | null;
  if (!r || typeof r !== "object") fail("not an object");
  for (const k of ["repo", "tag", "version", "firefox", "commit", "published", "url"] as const) {
    if (!isString(r?.[k])) fail(`no ${k}`);
  }
  const a = r?.assets;
  if (!a || !isString(a.deb) || !isString(a.appimage) || !isString(a.tarball)) fail("no assets");
  if (!/^[0-9a-f]{40}$/.test(r?.commit ?? "")) fail("commit is not a full hash");
  return r as Release;
}

export function readRelease(root: string): Release {
  const file = resolve(root, RELEASE_FILE);
  if (!existsSync(file)) throw new Error(`${RELEASE_FILE} is missing: run npm run release:sync and commit it`);
  return validateRelease(JSON.parse(readFileSync(file, "utf8")));
}

/** The page placeholders that come from the release. */
export function releaseVars(r: Release): Record<string, string> {
  return {
    version: r.version,
    firefox: r.firefox,
    firefox_major: r.firefox.split(".")[0] ?? r.firefox,
    release_tag: r.tag,
    deb: r.assets.deb,
    appimage: r.assets.appimage,
    tarball: r.assets.tarball,
  };
}

/** Replaces {{name}} with vars[name]; an unknown name is an error, not an empty string. */
export function fill(template: string, vars: Record<string, string>, where: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`${where}: no value for {{${name}}}`);
    return v;
  });
}
