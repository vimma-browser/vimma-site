// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// What search engines and link previews read: the canonical URL, Open Graph and Twitter tags
// and JSON-LD in each page's <head>, and the files at the site's root that the build writes
// next to the pages (sitemap.xml, robots.txt, llms.txt). Nothing here loads anything: the tags
// are data, and the JSON-LD block is a data <script> the browser never runs.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { escapeHtml } from "../src/ts/html.js";
import { VIMMA_REPO } from "./bindings-types.js";

/** The production origin, with no trailing slash. Every canonical and sitemap URL starts with it. */
export const SITE_URL = "https://vimma.dev";
export const SITE_NAME = "Vimma";
export const TAGLINE = "A keyboard-first browser for people who live in Vim and tmux";

/** The link-preview image: made by scripts/og-image.sh and committed, like the logo. */
export const OG_IMAGE = {
  path: "assets/img/og-image.png",
  width: 1200,
  height: 630,
  alt: `The Vimma logo, a mint browser window with a V, next to the words "${TAGLINE}".`,
};

/**
 * The promo video on the home page (src/pages/index.html), put in assets/video/ by
 * scripts/video.sh. The page, link previews and the JSON-LD all use the one 16:9 cut. Update `duration` (ISO 8601) and `uploadDate` with a new cut.
 */
export const PROMO_VIDEO = {
  path: "assets/video/vimma-promo-1080p.mp4",
  poster: "assets/video/vimma-promo-1080p.webp",
  type: "video/mp4",
  width: 1920,
  height: 1080,
  duration: "PT1M20S",
  uploadDate: "2026-10-16",
  name: "Vimma in action",
  description:
    "A real Vimma window, driven from the keyboard: scrolling and link hints, workspaces and the private workspace, split panes and tmux's layouts, tabs marked into panes, tab search across every workspace, and live grep through the text of open tabs.",
};

/**
 * Search-engine ownership checks by <meta> tag, added to every page's <head>. Paste the token
 * Google Search Console or Bing Webmaster Tools gives you, for example
 * `{ name: "google-site-verification", content: "…" }` or `{ name: "msvalidate.01", content: "…" }`.
 * For checks by file (googleXXXX.html, BingSiteAuth.xml), put the file in static/ instead: it is
 * copied to the root of dist/ as it is. See the README, "Deploying".
 */
export const VERIFICATION_META: { name: string; content: string }[] = [];

export const absolute = (out: string): string => `${SITE_URL}/${out}`;

export interface HeadPage {
  title: string;
  description: string;
  /** Output path under dist/ ("" for the home page). */
  out: string;
  /** false: no canonical URL and noindex (the 404 page, served at any missing path). */
  indexable: boolean;
  type: "website" | "article";
  /** true: Open Graph video tags for the promo video (the home page). */
  video?: boolean;
}

/** The SEO and link-preview part of a page's <head>, indented to sit in layout.html. */
export function headTags(p: HeadPage): string {
  const url = absolute(p.out);
  const image = absolute(OG_IMAGE.path);
  const meta = (attr: "name" | "property", key: string, value: string): string =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
  const lines = [
    ...(p.indexable ? [`<link rel="canonical" href="${url}">`] : [meta("name", "robots", "noindex")]),
    ...VERIFICATION_META.map((v) => meta("name", v.name, v.content)),
    meta("property", "og:type", p.type),
    meta("property", "og:site_name", SITE_NAME),
    meta("property", "og:title", p.title),
    meta("property", "og:description", p.description),
    ...(p.indexable ? [meta("property", "og:url", url)] : []),
    meta("property", "og:image", image),
    meta("property", "og:image:width", String(OG_IMAGE.width)),
    meta("property", "og:image:height", String(OG_IMAGE.height)),
    meta("property", "og:image:alt", OG_IMAGE.alt),
    ...(p.video
      ? [
          meta("property", "og:video", absolute(PROMO_VIDEO.path)),
          meta("property", "og:video:type", PROMO_VIDEO.type),
          meta("property", "og:video:width", String(PROMO_VIDEO.width)),
          meta("property", "og:video:height", String(PROMO_VIDEO.height)),
        ]
      : []),
    meta("name", "twitter:card", "summary_large_image"),
  ];
  return lines.join("\n    ");
}

/**
 * The home page's structured data: the application itself with its promo video, and the site
 * (for its name in results). No SearchAction: the docs search runs in the page and takes no URL query.
 */
export function homeJsonLd(description: string): string {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      description,
      applicationCategory: "BrowserApplication",
      operatingSystem: "Linux",
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      license: "https://www.mozilla.org/en-US/MPL/2.0/",
      url: `${SITE_URL}/`,
      image: absolute(OG_IMAGE.path),
      sameAs: [VIMMA_REPO],
      video: {
        "@type": "VideoObject",
        name: PROMO_VIDEO.name,
        description: PROMO_VIDEO.description,
        thumbnailUrl: absolute(PROMO_VIDEO.poster),
        uploadDate: PROMO_VIDEO.uploadDate,
        contentUrl: absolute(PROMO_VIDEO.path),
        duration: PROMO_VIDEO.duration,
        width: PROMO_VIDEO.width,
        height: PROMO_VIDEO.height,
        encodingFormat: PROMO_VIDEO.type,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
  ];
  // `<` escaped so no string can close the <script> element
  const json = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// --- dates ------------------------------------------------------------------------------------

/**
 * The date (YYYY-MM-DD) a page's sources last changed: the newest commit that touched any of
 * them. In a shallow clone a file untouched since the cut-off shows the cut-off commit's date,
 * which is not when it changed; then, or without git, it is the build date.
 */
export function lastChanged(root: string, files: string[], buildDate: string): string {
  try {
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const shallowFile = join(root, git("rev-parse", "--git-path", "shallow"));
    const cut = new Set(existsSync(shallowFile) ? readFileSync(shallowFile, "utf8").split(/\s+/).filter(Boolean) : []);
    const [hash = "", date = ""] = git("log", "-1", "--format=%H %cs", "--", ...files).split(" ");
    if (!hash || cut.has(hash) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return buildDate;
    return date;
  } catch {
    return buildDate;
  }
}

// --- files at the root ------------------------------------------------------------------------

export interface SitemapEntry {
  out: string;
  lastmod: string;
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map(
    (e) => `  <url>\n    <loc>${escapeHtml(absolute(e.out))}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export function robotsTxt(): string {
  return `# robots.txt for ${SITE_URL}, generated by the site build (scripts/seo.ts).
# Every crawler may read every page.
User-agent: *
Allow: /

# Cloudflare content signals (https://contentsignals.org): search engines may index the site and
# show it in results (search), AI tools may read it to answer a question (ai-input), and the
# site's owner allows its use to train or fine-tune AI models (ai-train).
Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

export interface LlmsLink {
  title: string;
  out: string;
  description: string;
}

/** llms.txt in the llmstxt.org format: a name, a summary, then sections of links. */
export function llmsTxt(summary: string, details: string, sections: [string, LlmsLink[]][]): string {
  const body = sections
    .map(([name, links]) => `## ${name}\n\n${links.map((l) => `- [${l.title}](${absolute(l.out)}): ${l.description}`).join("\n")}`)
    .join("\n\n");
  return `# ${SITE_NAME}\n\n> ${summary}\n\n${details}\n\n${body}\n`;
}
