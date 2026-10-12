// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// `npm run check` (after `npm run build`): checks dist/ with no dependencies.
//
//   html       doctype, lang, one <title> and <h1>, viewport, CSP, balanced tags, unique ids,
//              alt on every <img>, no inline scripts, styles or event handlers
//   links      every internal href/src/srcset resolves to a file, and every #fragment to an id
//   external   nothing loads from another origin: no remote src/href on resource elements,
//              no remote url()/@import in CSS, no network calls in JS
//   contrast   every text colour pair in both palettes passes WCAG AA (4.5:1)
//   weight     each page's HTML, CSS and JS stays under the budget (images excluded), and the
//              ? overlay's list of Vimma keys (loaded when it first opens) under its own
//   seo        one canonical URL per page (none and noindex on 404), Open Graph and Twitter tags,
//              unique titles and descriptions, JSON-LD that parses (a VideoObject with its
//              fields and built files), og:video naming a built file, and sitemap.xml,
//              robots.txt and llms.txt naming only pages that exist
//
// No local HTML validator (vnu, tidy) is assumed: the html checks are a structural subset.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST = join(ROOT, "dist");
const BUDGET = 150 * 1024;
/** assets/js/vimma-keys.js: every page imports it when the ? overlay first opens. */
const OVERLAY_KEYS = "assets/js/vimma-keys.js";
const OVERLAY_BUDGET = 32 * 1024;

const errors: string[] = [];
const fail = (where: string, msg: string): void => {
  errors.push(`${where}: ${msg}`);
};

if (!existsSync(DIST)) {
  console.error("dist/ is missing: run `npm run build` first");
  process.exit(1);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST);
// static/ is copied to dist/ as it is (verification files); its HTML is not the site's
const STATIC = existsSync(join(ROOT, "static")) ? readdirSync(join(ROOT, "static")).map((f) => join(DIST, f)) : [];
const isStatic = (f: string): boolean => STATIC.some((s) => f === s || f.startsWith(`${s}/`));
const htmlFiles = files.filter((f) => f.endsWith(".html") && !isStatic(f));
const cssFiles = files.filter((f) => f.endsWith(".css"));
const jsFiles = files.filter((f) => f.endsWith(".js"));
const rel = (f: string): string => relative(DIST, f);

// --- a small HTML tokenizer -------------------------------------------------------------------

interface Tag {
  name: string;
  close: boolean;
  attrs: Map<string, string>;
  line: number;
}

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

function tags(html: string): Tag[] {
  const out: Tag[] = [];
  const noComments = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  for (const m of noComments.matchAll(re)) {
    const attrs = new Map<string, string>();
    for (const a of (m[3] ?? "").matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs.set((a[1] ?? "").toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
    }
    const line = noComments.slice(0, m.index).split("\n").length;
    out.push({ name: (m[2] ?? "").toLowerCase(), close: m[1] === "/", attrs, line });
  }
  return out;
}

const decode = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const isRemote = (url: string): boolean => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url.trim());

// --- per page ---------------------------------------------------------------------------------

const idsByFile = new Map<string, Set<string>>();
const linkRefs: { from: string; url: string; line: number }[] = [];

for (const file of htmlFiles) {
  const where = rel(file);
  const html = readFileSync(file, "utf8");
  const ts = tags(html);

  if (!/^<!doctype html>/i.test(html)) fail(where, "missing <!doctype html>");
  const htmlTag = ts.find((t) => t.name === "html" && !t.close);
  if (!htmlTag?.attrs.get("lang")) fail(where, "<html> without lang");
  const count = (n: string): number => ts.filter((t) => t.name === n && !t.close).length;
  if (count("title") !== 1) fail(where, `${count("title")} <title> elements`);
  if (count("h1") !== 1) fail(where, `${count("h1")} <h1> elements`);
  if (count("main") !== 1) fail(where, `${count("main")} <main> elements`);
  const metas = ts.filter((t) => t.name === "meta");
  if (!metas.some((t) => t.attrs.get("name") === "viewport")) fail(where, "no viewport meta");
  const csp = metas.find((t) => t.attrs.get("http-equiv")?.toLowerCase() === "content-security-policy");
  if (!csp?.attrs.get("content")?.includes("default-src 'none'")) {
    fail(where, "no Content-Security-Policy meta with default-src 'none'");
  }

  // balanced tags
  const stack: Tag[] = [];
  for (const t of ts) {
    if (VOID.has(t.name)) {
      if (t.close) fail(where, `line ${t.line}: </${t.name}> on a void element`);
      continue;
    }
    if (!t.close) {
      stack.push(t);
      continue;
    }
    const open = stack.pop();
    if (open?.name !== t.name) {
      fail(where, `line ${t.line}: </${t.name}> closes <${open?.name ?? "nothing"}> (line ${open?.line ?? "?"})`);
      break;
    }
  }
  if (stack.length) fail(where, `unclosed <${stack.map((t) => t.name).join(">, <")}>`);

  const ids = new Set<string>();
  for (const t of ts) {
    if (t.close) continue;
    const id = t.attrs.get("id");
    if (id !== undefined) {
      if (ids.has(id)) fail(where, `line ${t.line}: duplicate id "${id}"`);
      ids.add(id);
    }
    if (t.name === "img" && !t.attrs.has("alt")) fail(where, `line ${t.line}: <img> without alt`);
    if (t.attrs.has("style")) fail(where, `line ${t.line}: inline style (blocked by the CSP)`);
    for (const name of t.attrs.keys()) {
      if (name.startsWith("on")) fail(where, `line ${t.line}: inline handler ${name}`);
    }
    const data = t.name === "script" && t.attrs.get("type") === "application/ld+json";
    if (t.name === "script" && !t.attrs.get("src") && !data) fail(where, `line ${t.line}: inline <script>`);
    if (t.name === "style") fail(where, `line ${t.line}: <style> element (blocked by the CSP)`);
    if (t.name === "a" && t.attrs.get("target") === "_blank" && !t.attrs.get("rel")?.includes("noopener")) {
      fail(where, `line ${t.line}: target=_blank without rel=noopener`);
    }

    // external resources: anything that loads, as opposed to a link the reader follows
    const loads: [string, string][] = [];
    const src = t.attrs.get("src");
    if (src !== undefined) loads.push(["src", src]);
    for (const s of (t.attrs.get("srcset") ?? "").split(",")) {
      const u = s.trim().split(/\s+/)[0];
      if (u) loads.push(["srcset", u]);
    }
    const href = t.attrs.get("href");
    // a canonical link names this page's address; nothing loads it
    if (t.name === "link" && href !== undefined && t.attrs.get("rel") !== "canonical") loads.push(["href", href]);
    for (const a of ["data", "poster", "action", "formaction", "background"]) {
      const v = t.attrs.get(a);
      if (v !== undefined) loads.push([a, v]);
    }
    for (const [attr, url] of loads) {
      if (isRemote(url)) fail(where, `line ${t.line}: <${t.name} ${attr}="${url}"> loads from another origin`);
      else linkRefs.push({ from: file, url: decode(url), line: t.line });
    }
    if (["iframe", "frame", "object", "embed", "audio"].includes(t.name)) {
      fail(where, `line ${t.line}: <${t.name}> element`);
    }
    // the promo video: local files (checked above), the user's to start, and no layout shift
    if (t.name === "video") {
      for (const a of ["controls", "muted", "playsinline", "poster", "width", "height"]) {
        if (!t.attrs.has(a)) fail(where, `line ${t.line}: <video> without ${a}`);
      }
      if (t.attrs.has("autoplay")) fail(where, `line ${t.line}: <video autoplay>`);
      if (!["none", "metadata"].includes(t.attrs.get("preload") ?? "")) {
        fail(where, `line ${t.line}: <video> without preload="none" or "metadata"`);
      }
    }
    if (t.name === "a" && href !== undefined && !isRemote(href) && !/^(mailto|tel):/.test(href)) {
      linkRefs.push({ from: file, url: decode(href), line: t.line });
    }
  }
  idsByFile.set(file, ids);
}

// --- internal links ---------------------------------------------------------------------------

function target(from: string, url: string): string {
  const path = url.split("#")[0]?.split("?")[0] ?? "";
  if (path === "") return from;
  const base = path.startsWith("/") ? join(DIST, path) : join(dirname(from), path);
  if (existsSync(base) && statSync(base).isDirectory()) return join(base, "index.html");
  return base;
}

for (const { from, url, line } of linkRefs) {
  const where = `${rel(from)} line ${line}`;
  const file = target(from, url);
  if (!file.startsWith(DIST)) {
    fail(where, `"${url}" points outside dist/`);
    continue;
  }
  if (!existsSync(file)) {
    fail(where, `"${url}" is broken (no ${rel(file)})`);
    continue;
  }
  const hash = url.split("#")[1];
  if (hash && file.endsWith(".html")) {
    let ids = idsByFile.get(file);
    if (!ids) {
      ids = new Set(tags(readFileSync(file, "utf8")).flatMap((t) => t.attrs.get("id") ?? []));
    }
    if (!ids.has(decodeURIComponent(hash))) fail(where, `"${url}": no id "${hash}" in ${rel(file)}`);
  }
}

// --- CSS and JS: nothing remote ---------------------------------------------------------------

for (const file of cssFiles) {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const u = m[2] ?? "";
    if (isRemote(u)) fail(rel(file), `url(${u}) loads from another origin`);
    else if (!u.startsWith("data:") && !existsSync(join(dirname(file), u))) {
      fail(rel(file), `url(${u}) is broken`);
    }
  }
  if (/@import/.test(css)) fail(rel(file), "@import (keep one stylesheet, local)");
}

const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|https?:\/\//;
for (const file of jsFiles) {
  if (file.endsWith("docs-index.js") || file.endsWith("vimma-keys.js")) {
    // data, not code: it must be `export default <JSON>` and hold no scheme-qualified URL
    const body = readFileSync(file, "utf8").replace(/^\/\/.*\n/gm, "");
    const m = /^export default ([\s\S]*);\s*$/.exec(body);
    try {
      if (!m) throw new Error("not `export default <JSON>;`");
      JSON.parse(m[1] ?? "");
    } catch (e) {
      fail(rel(file), `not a plain data module: ${(e as Error).message}`);
    }
    if (/[a-z]+:\/\//i.test(body)) fail(rel(file), "contains a URL");
    continue;
  }
  // comments may name URLs (the licence header); code may not
  const js = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
  js.split("\n").forEach((l, i) => {
    if (NETWORK.test(l)) fail(`${rel(file)} line ${i + 1}`, `network call or URL: ${l.trim().slice(0, 120)}`);
  });
}

// --- contrast ---------------------------------------------------------------------------------

function palette(css: string, name: string): Record<string, string> {
  const start = css.indexOf(`/* palette:${name}`);
  if (start < 0) {
    fail("site.css", `no /* palette:${name} */ block`);
    return {};
  }
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const ch = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Text token on background token, as the stylesheet uses them. */
const PAIRS: [string, string][] = [
  ...["--fg", "--fg-muted", "--fg-bright", "--accent", "--accent-2", "--green", "--yellow", "--red"].flatMap(
    (t): [string, string][] => [
      [t, "--bg"],
      [t, "--bg-dark"],
      [t, "--bg-darker"],
    ],
  ),
  ["--fg", "--bg-light"],
  ["--fg-muted", "--bg-light"],
  ["--accent", "--bg-light"],
  ["--fg-bright", "--bg-light"],
  ["--fg", "--selection"],
  ["--fg-bright", "--selection"],
  ["--badge-fg", "--accent"],
  ["--badge-fg", "--green"],
  ["--badge-fg", "--red"],
  ["--hint-fg", "--yellow"],
];

const cssText = readFileSync(join(ROOT, "assets/css/site.css"), "utf8");
const dark = palette(cssText, "dark");
const light = { ...dark, ...palette(cssText, "light") };
let worst = Infinity;
for (const [name, pal] of [["dark", dark], ["light", light]] as const) {
  for (const [fg, bg] of PAIRS) {
    const a = pal[fg];
    const b = pal[bg];
    if (!a || !b) {
      fail("contrast", `${name}: ${fg} or ${bg} missing`);
      continue;
    }
    const r = contrast(a, b);
    worst = Math.min(worst, r);
    if (r < 4.5) fail("contrast", `${name}: ${fg} ${a} on ${bg} ${b} is ${r.toFixed(2)}:1, under 4.5`);
  }
}

// --- weight -----------------------------------------------------------------------------------

const size = (f: string): number => statSync(f).size;

/** A JS file and everything it imports statically. */
function withImports(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || !existsSync(file)) return seen;
  seen.add(file);
  const js = readFileSync(file, "utf8");
  for (const m of js.matchAll(/\bfrom\s*["'](\.[^"']+)["']|^\s*import\s*["'](\.[^"']+)["']/gm)) {
    withImports(join(dirname(file), m[1] ?? m[2] ?? ""), seen);
  }
  return seen;
}

/** What a page loads: itself, its stylesheets and scripts with their imports, and the docs
 * search index on pages with the docs search (imported on first use, counted anyway). */
function pageWeight(file: string): number {
  const html = readFileSync(file, "utf8");
  const files = new Set<string>([file]);
  for (const t of tags(html)) {
    if (t.close) continue;
    const href = t.name === "link" && t.attrs.get("rel") === "stylesheet" ? t.attrs.get("href") : undefined;
    const src = t.name === "script" ? t.attrs.get("src") : undefined;
    const url = href ?? src;
    if (!url) continue;
    const path = target(file, decode(url));
    if (src) for (const f of withImports(path)) files.add(f);
    else files.add(path);
  }
  if (html.includes('id="docsearch"')) files.add(join(DIST, "assets/js/docs-index.js"));
  return [...files].reduce((n, f) => n + (existsSync(f) ? size(f) : 0), 0);
}

const weights = htmlFiles.map((f) => [rel(f), pageWeight(f)] as const);
const overlayKeys = join(DIST, OVERLAY_KEYS);
const overlayWeight = existsSync(overlayKeys) ? size(overlayKeys) : 0;
if (!overlayWeight) fail(OVERLAY_KEYS, "missing (build.ts writes it)");
if (overlayWeight > OVERLAY_BUDGET) {
  fail(OVERLAY_KEYS, `${(overlayWeight / 1024).toFixed(1)} KB, over ${OVERLAY_BUDGET / 1024} KB`);
}
for (const [page, w] of weights) {
  if (w > BUDGET) fail(page, `${(w / 1024).toFixed(1)} KB of HTML, CSS and JS, over ${BUDGET / 1024} KB`);
}

// --- seo --------------------------------------------------------------------------------------

const SITE = "https://vimma.dev/";
/** The address a built file is served at. */
const urlOf = (f: string): string => SITE + rel(f).replace(/(^|\/)index\.html$/, "$1");
const OG = ["og:type", "og:site_name", "og:title", "og:description", "og:image", "og:image:width", "og:image:height", "og:image:alt"];
const seen = { title: new Map<string, string>(), description: new Map<string, string>() };
let jsonLd = 0;
let videoTags = 0;
let videos = 0;

/** Every VideoObject in a JSON-LD value, at any depth (the home page's sits under `video`). */
function videoObjects(x: unknown): Record<string, unknown>[] {
  if (Array.isArray(x)) return x.flatMap(videoObjects);
  if (!x || typeof x !== "object") return [];
  const o = x as Record<string, unknown>;
  return [...(o["@type"] === "VideoObject" ? [o] : []), ...Object.values(o).flatMap(videoObjects)];
}

/** What Google needs of a VideoObject (name, description, thumbnailUrl, uploadDate), plus
 * a contentUrl and thumbnail that are built files and an ISO 8601 duration. */
function checkVideoObject(where: string, v: Record<string, unknown>): void {
  videos++;
  const str = (k: string): string => (typeof v[k] === "string" ? (v[k] as string) : "");
  for (const k of ["name", "description", "thumbnailUrl", "uploadDate", "contentUrl", "duration"]) {
    if (!str(k)) fail(where, `JSON-LD VideoObject: no ${k}`);
  }
  for (const k of ["thumbnailUrl", "contentUrl"]) {
    if (str(k) && !builtFile(str(k))) fail(where, `JSON-LD VideoObject: ${k} ${str(k)} is not a built file`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str("uploadDate"))) fail(where, `JSON-LD VideoObject: uploadDate "${str("uploadDate")}"`);
  if (!/^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/.test(str("duration")) || str("duration") === "PT") {
    fail(where, `JSON-LD VideoObject: duration "${str("duration")}" is not ISO 8601 (PT1M5S)`);
  }
}
for (const file of htmlFiles) {
  const where = rel(file);
  const html = readFileSync(file, "utf8");
  const ts = tags(html);
  const metaOf = (key: string): string[] =>
    ts.filter((t) => t.name === "meta" && (t.attrs.get("property") ?? t.attrs.get("name")) === key).map((t) => decode(t.attrs.get("content") ?? ""));
  const canon = ts.filter((t) => t.name === "link" && t.attrs.get("rel") === "canonical").map((t) => t.attrs.get("href"));
  const notFound = where === "404.html";
  if (notFound) {
    if (canon.length) fail(where, "the 404 page has a canonical URL");
    if (!metaOf("robots").includes("noindex")) fail(where, "the 404 page is not noindex");
  } else {
    if (canon.length !== 1) fail(where, `${canon.length} canonical links`);
    else if (canon[0] !== urlOf(file)) fail(where, `canonical ${canon[0]} is not ${urlOf(file)}`);
    if (metaOf("og:url")[0] !== urlOf(file)) fail(where, "og:url is not the page's address");
  }
  for (const k of [...OG, "twitter:card"]) if (metaOf(k).length !== 1) fail(where, `${metaOf(k).length} ${k} tags`);
  const image = metaOf("og:image")[0] ?? "";
  if (!image.startsWith(SITE) || !existsSync(join(DIST, image.slice(SITE.length)))) fail(where, `og:image ${image} is not a built file`);
  for (const v of metaOf("og:video")) {
    videoTags++;
    if (!builtFile(v)) fail(where, `og:video ${v} is not a built file`);
    for (const k of ["og:video:type", "og:video:width", "og:video:height"]) {
      if (metaOf(k).length !== 1) fail(where, `og:video without one ${k}`);
    }
  }
  if (!notFound) {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
    const description = metaOf("description")[0] ?? "";
    for (const [kind, value] of [["title", title], ["description", description]] as const) {
      const other = seen[kind].get(value);
      if (other) fail(where, `same ${kind} as ${other}: "${value}"`);
      seen[kind].set(value, where);
    }
    if (description.length < 50) fail(where, `description under 50 characters: "${description}"`);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    jsonLd++;
    try {
      const d = JSON.parse(m[1] ?? "") as { "@context"?: string }[];
      if (!Array.isArray(d) || d.some((x) => x["@context"] !== "https://schema.org")) throw new Error("not a list of schema.org items");
      for (const v of videoObjects(d)) checkVideoObject(where, v);
    } catch (e) {
      fail(where, `JSON-LD: ${(e as Error).message}`);
    }
  }
}

/** A URL on this site, as the file that serves it, or null. */
function builtFile(url: string): string | null {
  if (!url.startsWith(SITE)) return null;
  const path = join(DIST, url.slice(SITE.length).split("#")[0] ?? "");
  const file = url.endsWith("/") ? join(path, "index.html") : path;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

const sitemapFile = join(DIST, "sitemap.xml");
const locs: string[] = [];
if (!existsSync(sitemapFile)) fail("sitemap.xml", "missing");
else {
  const xml = readFileSync(sitemapFile, "utf8");
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')) fail("sitemap.xml", "no XML declaration");
  // well-formed: balanced tags, nothing but <urlset> at the top, only the sitemap's elements
  const stack: Tag[] = [];
  for (const t of tags(xml.replace(/^<\?xml[^>]*\?>/, ""))) {
    if (!["urlset", "url", "loc", "lastmod"].includes(t.name)) fail("sitemap.xml", `line ${t.line}: <${t.name}>`);
    if (!t.close) stack.push(t);
    else if (stack.pop()?.name !== t.name) fail("sitemap.xml", `line ${t.line}: </${t.name}> is unbalanced`);
  }
  if (stack.length) fail("sitemap.xml", "unclosed elements");
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml)) fail("sitemap.xml", "an unescaped &");
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g)) {
    const [loc = "", lastmod = ""] = [m[1], m[2]];
    locs.push(loc);
    if (!builtFile(loc)) fail("sitemap.xml", `${loc} is not a built page`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) fail("sitemap.xml", `${loc}: lastmod "${lastmod}"`);
  }
  if (locs.length !== (xml.match(/<url>/g) ?? []).length) fail("sitemap.xml", "a <url> without exactly <loc> then <lastmod>");
  const missing = htmlFiles.filter((f) => rel(f) !== "404.html" && !locs.includes(urlOf(f)));
  if (missing.length) fail("sitemap.xml", `leaves out ${missing.map(rel).join(", ")}`);
  if (locs.includes(`${SITE}404.html`)) fail("sitemap.xml", "lists the 404 page");
}

const robots = existsSync(join(DIST, "robots.txt")) ? readFileSync(join(DIST, "robots.txt"), "utf8") : "";
if (!robots.includes(`\nSitemap: ${SITE}sitemap.xml\n`)) fail("robots.txt", "no Sitemap line");
if (/^Disallow:\s*\/\s*$/m.test(robots)) fail("robots.txt", "disallows the whole site");

let llmsLinks = 0;
for (const f of ["llms.txt", "llms-full.txt"]) {
  if (!existsSync(join(DIST, f))) fail(f, "missing");
}
const llms = existsSync(join(DIST, "llms.txt")) ? readFileSync(join(DIST, "llms.txt"), "utf8") : "";
if (!/^# .+\n\n> .+\n/.test(llms)) fail("llms.txt", "does not start with an H1 and a blockquote summary");
for (const m of llms.matchAll(/\]\((https:\/\/vimma\.dev\/[^)]*)\)|(https:\/\/vimma\.dev\/\S+)/g)) {
  llmsLinks++;
  if (!builtFile(m[1] ?? m[2] ?? "")) fail("llms.txt", `${m[1] ?? m[2]} is not a built file`);
}
const full = existsSync(join(DIST, "llms-full.txt")) ? readFileSync(join(DIST, "llms-full.txt"), "utf8") : "";
for (const m of full.matchAll(/\]\((https:\/\/vimma\.dev\/[^)#]*)/g)) {
  if (!builtFile(m[1] ?? "")) fail("llms-full.txt", `${m[1]} is not a built file`);
}

// --- report -----------------------------------------------------------------------------------

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  console.error(`\n${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`✓ html: ${htmlFiles.length} pages, structure, ids, alt text, CSP`);
console.log(`✓ links: ${linkRefs.length} internal references resolve`);
console.log(`✓ external: nothing loads from another origin`);
console.log(`✓ seo: ${locs.length} sitemap URLs, canonical and preview tags on each page, ${jsonLd} JSON-LD block(s) with ${videos} VideoObject(s), ${videoTags} og:video, ${llmsLinks} llms.txt links`);
console.log(`✓ contrast: ${PAIRS.length * 2} pairs, lowest ${worst.toFixed(2)}:1`);
const heaviest = weights.reduce((a, b) => (b[1] > a[1] ? b : a));
console.log(`✓ weight: heaviest page ${heaviest[0]} ${(heaviest[1] / 1024).toFixed(1)} KB without images (budget ${BUDGET / 1024} KB)`);
console.log(`✓ weight: the ? overlay's Vimma keys ${(overlayWeight / 1024).toFixed(1)} KB, loaded on first open (budget ${OVERLAY_BUDGET / 1024} KB)`);
