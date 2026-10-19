// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The Vimma release the site describes, and the build's {{placeholders}} filled from it.
//
// data/release.json is written by `npm run release:sync` (scripts/sync-release.ts) and committed,
// so the build never calls GitHub: it works offline, and Cloudflare's builders, which share
// GitHub's unauthenticated rate limit, cannot fail it. Pages say {{version}}, {{firefox}},
// {{deb}} and so on instead of typing a version, so a sync updates every page at once.
// {{dmg}} exists only when the release has a macOS build: a page that names it then fails the
// build for a release without one, instead of printing an empty file name.

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
  /** The package file names in the release; `dmg` (macOS, Apple Silicon) only when it has one. */
  assets: { deb: string; appimage: string; tarball: string; dmg?: string };
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

/** [key, label, matches, required]: a release without a required package fails the sync. */
const PACKAGES: [keyof Release["assets"], string, (name: string, v: string) => boolean, boolean][] = [
  ["deb", ".deb", (n, v) => n === `vimma_${v}_amd64.deb`, true],
  ["appimage", "AppImage", (n, v) => n === `vimma-${v}-x86_64.AppImage`, true],
  ["tarball", "tarball", (n, v) => /^vimma-(.+)-linux-x86_64\.tar\.(xz|gz|zst)$/.exec(n)?.[1] === v, true],
  ["dmg", "macOS .dmg", (n, v) => n === `vimma-${v}-macos-aarch64.dmg`, false],
];

/** The .deb, AppImage, tarball and, if there is one, macOS .dmg of `version` among a release's asset names. */
export function pickAssets(names: string[], version: string): Release["assets"] {
  const out: Partial<Release["assets"]> = {};
  for (const [key, label, match, required] of PACKAGES) {
    const found = names.filter((n) => match(n, version));
    if (found.length === 0 && !required) continue;
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
  // The values go into pages unescaped and into the sync workflow's shell, so each must have the
  // exact form expected of it.
  const forms: [keyof Release, RegExp][] = [
    ["tag", /^v\d+\.\d+\.\d+(-[\w.]+)?$/],
    ["version", /^\d+\.\d+\.\d+(-[\w.]+)?$/],
    ["firefox", /^\d+(\.\d+)*$/],
    ["commit", /^[0-9a-f]{40}$/],
    ["published", /^\d{4}-\d{2}-\d{2}$/],
    ["url", /^https:\/\/github\.com\/vimma-browser\/vimma\/releases\/tag\/v[\w.-]+$/],
  ];
  for (const [k, re] of forms) if (!re.test(String(r?.[k]))) fail(`${k} "${String(r?.[k])}" is not in the expected form`);
  const pkg = /^[\w.+-]+$/;
  if (a && a.dmg !== undefined && !isString(a.dmg)) fail("assets.dmg is not a file name");
  if (a && ![a.deb, a.appimage, a.tarball, ...(a.dmg ? [a.dmg] : [])].every((n) => pkg.test(n))) {
    fail("an asset name has unexpected characters");
  }
  return r as Release;
}

/** Compares two X.Y.Z versions (pre-release suffixes ignored): negative when a is older. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] => v.split("-")[0]!.split(".").map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
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
    ...(r.assets.dmg ? { dmg: r.assets.dmg } : {}),
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
