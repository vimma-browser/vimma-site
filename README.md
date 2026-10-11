# vimma-site

The website for Vimma, a keyboard-first Firefox fork with a Neovim-style modal layer and a
tmux-style `ctrl+b` prefix. It looks like a terminal in Vimma's own colours, the mint and near-black of its logo, a
light variant for light systems, monospace throughout, a prompt header with the page position, and Vim
keys on the site itself (press `?`).

**Deployed** on Cloudflare Workers at [vimma.dev](https://vimma.dev), behind a Cloudflare Access
login until Vimma is published. A push to `main` goes live in a minute or two. See
[Deploying](#deploying).

## Pages

| Path       | Source                   | What                                                               |
| ---------- | ------------------------ | ------------------------------------------------------------------ |
| `/`        | `src/pages/index.html`   | Logo, pitch, the session (real screenshots), features, name, status |
| `/docs/`   | `src/docs/`, `data/docs/`| Start here, Why Vimma, Vimma compared, then pages from the guide   |
| `/keys/`   | `src/pages/keys.html`    | Every default binding, filterable, from `data/bindings.json`       |
| `/install/`| `src/pages/install.html` | Build from source; Linux x86_64 only; no binaries yet              |
| `/about/`  | `src/pages/about.html`   | Why another browser, privacy defaults, Firefox base, licence, FAQ  |
| `404.html` | `src/pages/404.html`     | Not found (links are root-absolute: it assumes the site is at `/`) |

The build also writes, for search engines and AI tools, `sitemap.xml`, `robots.txt`, `llms.txt`
and `llms-full.txt` at the root (see [Search engines and link previews](#search-engines-and-link-previews)),
and copies whatever is in `static/` there as it is.

## Commands

Node 22 or later.

```sh
npm ci
npm run build       # tsc, then .build/build.js: dist/
npm run serve       # dist/ at http://127.0.0.1:8080/ (PORT=… to change)
npm run check       # tsc --noEmit (both projects), then the dist/ checks below
npm run docs:sync -- ../vimma      # copy guide/bindings/limits.md from its origin/main, regen keys
npm run keys:sync                  # regenerate data/bindings.json from data/docs/bindings.md only
npm run shots -- ../vimma          # retake the home page's screenshots from that checkout's build
```

`npm run check` runs on the built `dist/`:

- **html**: doctype, `lang`, one `<title>`, `<h1>` and `<main>`, viewport and CSP metas, balanced
  tags, unique ids, `alt` on images, no inline scripts, styles or handlers. No HTML validator is
  installed on the dev machine or in CI, so this is a structural subset, not full validation.
- **links**: every internal `href`, `src` and `srcset` resolves to a file, and each `#fragment`
  to an id.
- **external**: nothing loads from another origin (resource elements, CSS `url()`/`@import`, and
  network calls or URLs in the shipped JS). Plain `<a>` links to other sites are allowed.
- **contrast**: each text/background token pair, in both palettes, is at least 4.5:1 (WCAG AA).
- **weight**: what each page loads (HTML, stylesheet, scripts and their imports, and the docs
  search index on docs pages) stays under 150 KB. The heaviest is the known-limits page, just
  under the budget, under half of it the search index loaded on first search. The index
  leaves out common words (a stop list), words already in a section's page title, heading or
  snippet, and words inside a longer word of the same section (the search matches substrings);
  if a sync pushes a page over, slim the index or the page, not the budget.
- **seo**: one `<link rel="canonical">` per page with its `https://vimma.dev/` address (none, and
  `noindex`, on the 404 page), the Open Graph and `twitter:card` tags, titles and descriptions
  unique across pages, JSON-LD that parses, a well-formed `sitemap.xml` that lists every page but
  404 and only built ones, a `Sitemap:` line in `robots.txt`, and `llms.txt` links that resolve.

## How it is built

- `src/layout.html` is the shared shell (prompt header with the page position and the `?` hint, footer, `?` overlay);
  `src/pages/*.html` are page bodies with a one-line JSON meta comment on top.
  `build.ts` fills `{{placeholders}}`; an unknown one fails the build.
- `src/ts/site.ts` is the one browser script (an ES module): the keys (`j k d u gg G / ? [ ]
  g h g d g k g i g a`), the overlay, the keys filter,
  the docs search and the hero animation. Every page works without it.
- `src/ts/hero.ts` lists the hero's steps: the keys, what they do, and a screenshot of a real
  Vimma window after them (`assets/img/shots/`, AVIF and WebP). The build renders the split
  step into the HTML as the no-JS and reduced-motion fallback; the script steps through the
  rest, with a pause button, and stops when the hero is off screen.
- `npm run shots` (`scripts/shots.ts`) retakes those screenshots: it serves the fictional demo
  sites in `shots/pages/` (news.example, mail.example) as an HTTP proxy on 127.0.0.1:8139 and
  runs `shots/scenarios/m5-site-hero.json` with the browser repository's own end-to-end harness
  (`npm run e2e` there, under Xvfb), which presses the keys and captures the window. It needs
  that checkout's build and `vimma-ctl`, Xvfb, ImageMagick and avifenc; the images are committed,
  so building the site needs none of them. Retake them when Vimma's look changes.
- `data/bindings.json` is generated from Vimma's `docs/bindings.md` by `scripts/gen-keys.ts` and
  committed, so the site builds without Vimma's repository. It records the source commit.

## The docs

`/docs/` is modelled on a classic docs site: a sidebar of pages, an "on this page" list, a search
box, previous/next links (`[` and `]`). Each page has two tiers:

1. **A hand-written guide** (`src/docs/<slug>.html`, and "Start here" in `src/docs/start-here.html`):
   task first ("to do X, press Y"), plain words, the common keys only. Keep its keys and facts in
   line with the synced guide below; nothing checks that automatically.
2. **The reference**, cut at build time: the page's keys table from `bindings.md`, then the
   matching `guide.md` sections under one "Details" heading, then links to the known limits.
   They come from copies of Vimma's `docs/guide.md`, `docs/limits.md` and `docs/bindings.md` in
   `data/docs/`, taken from the main repository's `origin/main` by `npm run docs:sync` (which runs
   only `git fetch` and `git show` there) and committed with the commit they came from.

"Why Vimma" (`src/docs/why.html`, `handWritten` in `docs-pages.ts`) has only the first tier: why a
browser and not an extension, the long version of the home page's block. Its claims are checked
by hand against Vimma's guide and source, like the other hand-written text.

"Vimma compared" (`src/docs/compared.html`, `handWritten` too) sets Vimma beside Vimium,
Tridactyl, qutebrowser and Zen Browser (and Nyxt and Vieb briefly): one table row per dimension,
then what each does well and where Vimma differs. Every claim about another project comes from
its own site, docs or repository, listed at the foot of the page with the date they were
checked; recheck them and update that date when you edit the page. Keep the tone fair: no
project is put down.

- `scripts/docs-pages.ts` lists the pages and what each is made of: guide sections by heading,
  rows of the guide's keys table by their first cell, paragraphs by their opening words,
  bindings sections, and links to the known-limits sections. If upstream renames or drops any
  of them, the build fails and names it: re-sync, then update that file. `GUIDE_REWRITES` there
  strips internal names (milestones, spec links, code names) from the guide's text; a rewrite
  that no longer matches is reported at build time.
- `scripts/md.ts` is a small Markdown reader for the subset the guide uses. Links to other
  guide headings are pointed at whichever docs page renders them; links to specs, ADRs and the
  runbook point at the file in the public repository on GitHub.
- The known-limits page leaves out the `limits.md` lines the same commit's guide contradicts
  (listed in `STALE_LIMITS`, reported at build time), so they disappear when upstream fixes them.
- Search: the build writes `assets/js/docs-index.js` (each section's heading, a snippet and its
  distinct words; no full URLs, only paths under `docs/`), which the docs pages import on first use. No server, no third party.
- `assets/img/` holds the logo (with its tagline) as AVIF, WebP and PNG at 256 and 512 px, and
  the window+V mark as 16/32/48 px favicons and the 180 px apple-touch-icon, made by
  `scripts/optimize-logo.sh` (ImageMagick, avifenc) from the main repository's
  `docs/assets/vimma-logo-square.png` and `vimma-mark.png`, and committed.
- Fonts: the system's monospace stack (`ui-monospace`, JetBrains Mono, Cascadia, SF Mono, Menlo,
  DejaVu Sans Mono, …). No font is downloaded.
- Search engines and link previews: see [below](#search-engines-and-link-previews).
- Privacy: no cookies, no analytics, no third-party requests. A CSP meta (`default-src 'none'`,
  `'self'` for scripts, styles and images) backs that up in the browser. The keys toggle is the
  only stored state, in `localStorage`.

## Search engines and link previews

`scripts/seo.ts` holds what crawlers and link previews read; `build.ts` uses it for every page:

- **Head tags.** A canonical URL on `https://vimma.dev`, the `<title>` and meta description from
  the page's meta line (docs pages: `headTitle`, else `title`, and `description` in
  `docs-pages.ts`), Open Graph tags and `twitter:card` `summary_large_image`. The 404 page gets
  `noindex` and no canonical, since it is served at any missing address.
- **The preview image**, `assets/img/og-image.png` (1200×630): the logo, the tagline and the
  site's colours, made by `scripts/og-image.sh` (ImageMagick 7 and JetBrains Mono) from the main
  repository's `docs/assets/vimma-logo-square.png` and committed. Rerun it if the logo changes.
- **JSON-LD** on the home page: a `SoftwareApplication` (free, Linux, MPL-2.0, the GitHub
  repository) and a `WebSite`. It is a data `<script>`, never run, so the CSP is unchanged; the
  check allows inline scripts of type `application/ld+json` only. There is no `SearchAction`: the
  docs search takes no query from the URL.
- **`sitemap.xml`**: every page but 404, with `lastmod` from the last commit that touched the
  page's source (`src/pages/…`, `src/docs/…`, and the synced guide or limits for the docs pages
  built from them); in a shallow clone, or without git, the build date.
- **`robots.txt`**: everything allowed, the sitemap, and Cloudflare's content signals
  `search=yes, ai-input=yes, ai-train=yes`: the owner allows search, AI answers and training.
- **`llms.txt`** ([llmstxt.org](https://llmstxt.org) format): the summary and a link with a line
  for each page; **`llms-full.txt`**: the synced `guide.md` and `limits.md` as one Markdown file,
  with the same rewrites as the docs and every link made absolute, so it follows each docs sync.

## Accessibility

Semantic landmarks and headings, a skip link, visible focus, AA contrast in both schemes, and a
layout that works down to 320 px. Nothing is fixed to the foot of the viewport: viewed in Vimma,
a second status bar under Vimma's own was confusing, so the page position and the `?` hint sit
in the header. The site's single-key shortcuts never fire while typing in a field or with a modifier
held, and can be turned off in the `?` overlay (WCAG 2.1.4); `?` keeps working so they can be
turned back on. The blinking cursor and the hero animation stop under `prefers-reduced-motion`.
Each hero screenshot has alternative text, and its numbered list of keys says the same thing.

## Deploying

Cloudflare's Workers Builds (the `vimma-site` Worker) builds the repository and serves `dist/` at
**vimma.dev**:

- **Production** is `main`. Each push to it builds and deploys; the new version is live a minute
  or so later. A failed build leaves the previous version live. The build and deploy commands are
  set in the Cloudflare dashboard (Workers → `vimma-site` → Settings → Build); the repository has
  no `wrangler` config.
- **Other branches** also get a Workers Builds run, which shows as a check on pull requests.
- **Access:** vimma.dev sits behind Cloudflare Access, so only signed-in people can see it
  while Vimma is unpublished. Remove the Access application to open the site.
- **CI** (`.github/workflows/ci.yml`) builds and runs `npm run check` on every push and pull
  request. It does not deploy, and Cloudflare does not wait for it, so a red CI run can still go
  live: check it before merging.

**Search engines.** While Cloudflare Access is in front of the site, nothing can index it. With
the site open:

- **Google Search Console / Bing Webmaster Tools.** Add `https://vimma.dev` as a property. For
  the HTML tag method, put the token they give you in `VERIFICATION_META` in `scripts/seo.ts`
  (`{ name: "google-site-verification", content: "…" }`, `{ name: "msvalidate.01", content: "…" }`);
  every page then carries it. For the file method, put the file (`google….html`,
  `BingSiteAuth.xml`) in `static/`: the build copies it to the root of `dist/` as it is, and the
  checks skip it. Deploy, verify, then submit `https://vimma.dev/sitemap.xml` in both. A DNS TXT
  record works too and needs no change here. Keep the token or file afterwards: they check again.
- **robots.txt.** The built `robots.txt` is a file in `dist/`, so the Worker serves it. Cloudflare's
  managed `robots.txt` (Security → Settings, bot traffic: "Manage your robots.txt" / AI Crawl
  Control) does not replace it but prepends its own block to it: today only the comments that
  explain content signals; with its AI-crawler option on, `Disallow` rules for AI crawlers too,
  which would contradict the content signals. Either turn the managed file off, so ours is served as it
  is, or keep it with only the comments. Keep "Block AI bots" off either way. Check the result with
  `curl https://vimma.dev/robots.txt`.

Keep the site's guarantees on Cloudflare: Web Analytics and other injected scripts stay off, no
CDN fonts, and the CSP should become a real response header (`frame-ancestors 'none'` too, which a
meta tag cannot set), for example in a `_headers` file copied into `dist/`.

## Licence

[MPL-2.0](LICENSE), like Vimma and Firefox, for the code. Vimma's repository names no separate
licence for its text or logo, so the site's text and the Vimma logo are MPL-2.0 here too.

Dependencies (development only, nothing ships to the browser): `typescript` (Apache-2.0; its
platform binary package `@typescript/typescript-linux-x64` is Apache-2.0 too) compiles the site
script and the build tools; `@types/node` (MIT, with `undici-types`, MIT) types the Node scripts.
Plain `tsc` and no bundler: the browser loads two small ES modules.
