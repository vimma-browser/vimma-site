# vimma-site

The website for Vimma, a keyboard-first Firefox fork with a Neovim-style modal layer and a
tmux-style `ctrl+b` prefix. It looks like a terminal in Vimma's own colours, the mint and near-black of its logo, a
light variant for light systems, monospace throughout, a prompt header with tmux-style tabs, and Vim
keys on the site itself (press `?`). The home page is a run of full-width bands split by hairlines:
a large headline with the logo, the install command with a copy button, four facts, the video,
six feature cells and a closing band; the other pages keep a reading column under the same header.

**Deployed** on Cloudflare Workers at [vimma.dev](https://vimma.dev). A push to `main` goes live
in a minute or two. See [Deploying](#deploying).

## Pages

| Path       | Source                   | What                                                               |
| ---------- | ------------------------ | ------------------------------------------------------------------ |
| `/`        | `src/pages/index.html`   | Headline, install, facts, the promo video, features, closing band |
| `/docs/`   | `src/docs/`, `data/docs/`| Start here, Why Vimma, Vimma compared, then pages from the guide   |
| `/keys/`   | `src/pages/keys.html`    | Every default binding, filterable, from `data/bindings.json`       |
| `/install/`| `src/pages/install.html` | Arch Linux command, release packages, build from source            |
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
npm test            # unit tests of the build scripts (node:test)
npm run wording     # no process wording in the Markdown, the pages or code comments (below)
npm run release:sync               # copy the latest Vimma release's facts, docs and keys (network)
npm run release:sync -- v0.1.2     # … of a given release tag
```

`npm run check` runs on the built `dist/`:

- **html**: doctype, `lang`, one `<title>`, `<h1>` and `<main>`, viewport and CSP metas, balanced
  tags, unique ids, `alt` on images, no inline scripts, styles or handlers, no frames, objects
  or audio; a `<video>` only with `controls`, `muted`, `playsinline`, a poster, width and height,
  `preload` `none` or `metadata`, and no `autoplay`. No HTML validator is
  installed on the dev machine or in CI, so this is a structural subset, not full validation.
- **links**: every internal `href`, `src` and `srcset` resolves to a file, and each `#fragment`
  to an id.
- **external**: nothing loads from another origin (resource elements, CSS `url()`/`@import`, and
  network calls or URLs in the shipped JS). Plain `<a>` links to other sites are allowed.
- **contrast**: each text/background token pair, in both palettes, is at least 4.5:1 (WCAG AA).
- **weight**: what each page loads (HTML, stylesheets, scripts and their imports, and the docs
  search index on docs pages) stays under 150 KB. The heaviest is the known-limits page, about
  148 KB, close to half of it the search index loaded on first search. The home page's bands have
  their own stylesheet (`assets/css/home.css`), so the docs pages do not load them. The build ships the
  stylesheets without comments or the whitespace around braces (`scripts/css.ts`). The index
  leaves out common words (a stop list) and verb forms nearly every section has, words already
  in a section's page title, heading or snippet, and words inside a longer word of the same
  section (the search matches substrings), and names each page's title and path once; if a sync
  pushes a page over, slim the index or the page, not the budget. The `?` overlay's list of
  Vimma keys (`assets/js/vimma-keys.js`) loads only when the overlay first opens, on any page,
  so it has its own budget, 32 KB (about 20 KB today).
- **seo**: one `<link rel="canonical">` per page with its `https://vimma.dev/` address (none, and
  `noindex`, on the 404 page), the Open Graph and `twitter:card` tags, titles and descriptions
  unique across pages, JSON-LD that parses, each `VideoObject` in it with a name, description,
  `thumbnailUrl`, `uploadDate`, `contentUrl` (both built files) and an ISO 8601 duration,
  `og:video` naming a built file with its type and size, a well-formed `sitemap.xml` that lists every page but
  404 and only built ones, a `Sitemap:` line in `robots.txt`, and `llms.txt` links that resolve.

## How it is built

- `src/layout.html` is the shared shell (prompt header with the tabs and the `?` hint, footer, `?` overlay);
  `src/pages/*.html` are page bodies with a one-line JSON meta comment on top.
  `build.ts` fills `{{placeholders}}`; an unknown one fails the build. No page types a version:
  `{{version}}`, `{{firefox}}` (`158.0`), `{{firefox_major}}` (`158`), `{{release_tag}}`, `{{deb}}`,
  `{{appimage}}` and `{{tarball}}` come from `data/release.json` (see [Keeping up with
  releases](#keeping-up-with-releases)), and `{{arch_install}}` is the Arch Linux command
  (`ARCH_INSTALL` in `scripts/release.ts`), so the home page, the install page and the docs show
  the same line.
- `src/ts/site.ts` is the one browser script (an ES module): the keys (`j k d u gg G / ? [ ]
  g h g d g k g i g a`), the overlay, the keys filter,
  the docs search and the install command's copy button (hidden where the clipboard API is missing).
  Every page works without it.
- **The promo video** (`assets/video/`): one 65-second 16:9 cut, no sound, H.264 with the
  `moov` atom first (`+faststart`), with a WebP poster. Every screen, phones included, gets the
  same `<video>`, scaled to the column's width. With `preload="none"` it downloads nothing until
  it is played (the poster does, 45 KB). No autoplay. A caption under it lists what it shows, since the video has captions in the picture
  but no audio description. `og:video` and a `VideoObject` in the JSON-LD (`PROMO_VIDEO` in
  `scripts/seo.ts`) name the 16:9 cut. About 8 MB of binaries in git; Workers static assets
  take files up to 25 MiB.

  To replace the cut (same name, same size), run `scripts/video.sh` on the new file. It copies
  it in with `+faststart` (a remux, no re-encode) and remakes the poster from a fixed frame
  (`WIDE_AT`, in seconds; the current cut uses 61.8, the live grep preview); it needs ffmpeg with libwebp:

  ```sh
  scripts/video.sh ~/Videos/vimma/v2/vimma-promo-1080p.mp4
  ```

  If the length changes, update `duration` in `PROMO_VIDEO` and the duration in the page's
  fallback link; update `uploadDate` with a new cut.
- **The keys** come from Vimma's `docs/bindings.json`, which Vimma's `npm run gen-docs` writes from
  the same keymap as its default `config.toml` and its own `ctrl+b ?` overlay. `npm run release:sync`
  copies it unchanged from the latest release's tag into `data/bindings.json`, and records the
  commit in `data/bindings-source.json`. Both are committed, so the build works offline and
  without Vimma's repository. The keys page, the docs pages' key tables and the `?` overlay are all
  built from it, and the build fails if its shape is not the one `gen-keys.ts` expects.
- **The `?` overlay** has two parts: "This site" (the site's keys and the shortcuts toggle), then
  "In Vimma", every default binding grouped as Vimma's `ctrl+b ?` groups them, with a `/`
  filter. The build writes the Vimma part as the data module `assets/js/vimma-keys.js`, which
  the overlay imports when it first opens. In the overlay, `q`, `?` and `Esc` close it, `/`
  filters, and `j k d u gg G` scroll it; in the filter, `Esc` clears it, then closes the overlay.

## Keeping up with releases

The site describes Vimma's latest published release, not its `main`: the version on every page,
the package names, the docs and the keys all come from the commit the release's tag points to,
so they match what a visitor downloads.

- `npm run release:sync` (`scripts/sync-release.ts`) reads the latest published release from
  GitHub (or the tag given), takes the Vimma and Firefox versions from its title (`Vimma 0.1.2 ·
  Firefox 158.0`; Firefox from `surfer.json` at the tag if the title has none), the `.deb`,
  AppImage and tarball names from its assets, and copies `docs/guide.md`, `docs/limits.md` and
  `docs/bindings.json` at the tag's commit. It writes `data/release.json`, `data/docs/` and
  `data/bindings.json` with their source files, and only once everything is fetched and checked.
  It uses `GITHUB_TOKEN` when set, for the API's higher rate limit. Every value it records must
  have its expected form (a version number, a full commit hash, a release URL), since the pages
  print them as they are. A scheduled run refuses a "latest" release older than the one the site
  shows; going back takes the tag, by hand.
- The build reads only those committed files and never calls GitHub, so it works offline and
  Cloudflare's builders, which share GitHub's unauthenticated rate limit, cannot fail it. It
  fails if `data/release.json` is missing or malformed.
- `.github/workflows/release-sync.yml` runs the sync when Vimma publishes a release (Vimma's
  `site-dispatch.yml` sends a `repository_dispatch`, `vimma-release`, which needs its
  `SITE_DISPATCH_TOKEN` secret), every hour as a fallback, and by hand (Actions → release-sync →
  Run workflow, with an optional tag). When `data/` changes, a read-only job builds
  and checks the site, and a second job, which holds the write token and runs no npm code, opens
  or updates the pull request `release-sync/<tag>`. A pull request opened
  with the workflow's own token starts no `pull_request` workflows, so it starts `ci.yml` on the
  branch itself (`workflow_dispatch`), and turns on auto-merge (squash), so the pull request
  merges once the required `build` check passes, and Cloudflare deploys it.
- When the new release renames or drops a guide heading, paragraph or limits section that
  `scripts/docs-pages.ts` names, the build fails on purpose. The pull request then says which
  one, is not set to merge, and stays red: fix `scripts/docs-pages.ts` on its branch and merge
  it by hand. The next run keeps those commits and adds its own on top. A sync for an older
  release that never merged is closed when a newer one opens; its branch is kept, with any fix on
  it. A `release-sync/<tag>` branch left without an open pull request stops the sync for that
  tag, with an error saying so, until it is deleted.
- It needs two repository settings: "Allow GitHub Actions to create and approve pull requests"
  (Settings → Actions → General) and "Allow auto-merge" (Settings → General).

## The docs

`/docs/` is modelled on a classic docs site: a sidebar of pages, an "on this page" list, a search
box, previous/next links (`[` and `]`). Each page has two tiers:

1. **A hand-written guide** (`src/docs/<slug>.html`, and "Start here" in `src/docs/start-here.html`):
   task first ("to do X, press Y"), plain words, the common keys only. Keep its keys and facts in
   line with the synced guide below; nothing checks that automatically.
2. **The reference**, cut at build time: the page's keys table from `bindings.json`, then the
   matching `guide.md` sections under one "Details" heading, then links to the known limits.
   They come from copies of Vimma's `docs/guide.md` and `docs/limits.md` in
   `data/docs/`, taken from the latest release's tag by `npm run release:sync` and committed with
   the commit they came from.

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
  of them, the build fails and names it: update that file to match the synced copy. `GUIDE_REWRITES` there
  strips internal names (milestones, spec links, code names) from the guide's text; a rewrite
  that no longer matches is reported at build time.
- `scripts/md.ts` is a small Markdown reader for the subset the guide uses. Links to other
  guide headings are pointed at whichever docs page renders them; links to specs, ADRs and the
  runbook point at the file in the public repository on GitHub, at the release tag the copies
  came from.
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
  `'self'` for scripts, styles, images and media) backs that up in the browser. The keys toggle is the
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
  repository, its promo video as a `VideoObject`) and a `WebSite`. It is a data `<script>`, never run, so the CSP is unchanged; the
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
a second status bar under Vimma's own was confusing, so the tabs (the current one
highlighted, its position also given to screen readers) and the `?` hint sit in the header. The site's single-key shortcuts never fire while typing in a field or with a modifier
held, and can be turned off in the `?` overlay (WCAG 2.1.4); `?` keeps working so they can be
turned back on. The blinking cursor stops under `prefers-reduced-motion`.
The promo video never plays by itself, has no sound, and has a text summary under it.

## Writing

The pages, the Markdown and the code comments are written for readers outside the project: they
say what something is and why, never who asked for it, when, quoted chat or notes from the work.
`npm run wording` (`scripts/wording.ts`, run in CI) fails on wording that only makes sense as such
a record. It is a port of Vimma's `tools/md-wording` checks, with the same patterns, and leaves
out the copies of Vimma's docs in `data/docs/`, which Vimma checks. A paragraph that has to name
one of the phrases carries `<!-- process-wording: <reason> -->`; a comment block,
`process-wording: <reason>`.

## Deploying

Cloudflare's Workers Builds (the `vimma-site` Worker) builds the repository and serves `dist/` at
**vimma.dev**:

- **Production** is `main`. Each push to it builds and deploys; the new version is live a minute
  or so later. A failed build leaves the previous version live. The build and deploy commands are
  set in the Cloudflare dashboard (Workers → `vimma-site` → Settings → Build); the repository has
  no `wrangler` config.
- **Other branches** also get a Workers Builds run, which shows as a check on pull requests.
- **Access:** vimma.dev is public: no Cloudflare Access application or other login is in front
  of it.
- **CI** (`.github/workflows/ci.yml`) runs `npm test` and `npm run wording`, builds, and runs
  `npm run check` on every push and pull request. It does not deploy, and Cloudflare does not wait for it, so a red CI run can still go
  live: check it before merging.

**Search engines.** Search engines can index the site, which is public:

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
