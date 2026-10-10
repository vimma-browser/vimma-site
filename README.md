# vimma-site

The website for Vimma, a keyboard-first Firefox fork with a Neovim-style modal layer and a
tmux-style `ctrl+b` prefix. It looks like a terminal: Tokyo Night (Vimma's built-in theme), a
light variant for light systems, monospace throughout, a prompt header, a status bar, and Vim
keys on the site itself (press `?`).

**Not deployed.** Vimma is not published until its owner has daily-driven it. See
[Deploying later](#deploying-later).

## Pages

| Path       | Source                   | What                                                               |
| ---------- | ------------------------ | ------------------------------------------------------------------ |
| `/`        | `src/pages/index.html`   | Logo, pitch, the animated session, features, the name, status      |
| `/docs/`   | `src/docs/`, `data/docs/`| Start here, then 14 pages built from Vimma's guide (see below)     |
| `/keys/`   | `src/pages/keys.html`    | Every default binding, filterable, from `data/bindings.json`       |
| `/install/`| `src/pages/install.html` | Build from source; Linux x86_64 only; no binaries yet              |
| `/about/`  | `src/pages/about.html`   | Why another browser, privacy defaults, Firefox base, licence, FAQ  |
| `404.html` | `src/pages/404.html`     | Not found (links are root-absolute: it assumes the site is at `/`) |

## Commands

Node 22 or later.

```sh
npm ci
npm run build       # tsc, then .build/build.js: dist/
npm run serve       # dist/ at http://127.0.0.1:8080/ (PORT=… to change)
npm run check       # tsc --noEmit (both projects), then the dist/ checks below
npm run docs:sync -- ../VimHerdr   # copy guide/bindings/limits.md from its origin/main, regen keys
npm run keys:sync                  # regenerate data/bindings.json from data/docs/bindings.md only
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
  search index on docs pages) stays under 150 KB. The heaviest today is the known-limits page,
  about 133 KB, most of it the 55 KB search index loaded on first search.

## How it is built

- `src/layout.html` is the shared shell (prompt header, footer, status bar, `?` overlay);
  `src/pages/*.html` are page bodies with a one-line JSON meta comment on top.
  `build.ts` fills `{{placeholders}}`; an unknown one fails the build.
- `src/ts/site.ts` is the one browser script (an ES module): the keys (`j k d u gg G / ? [ ]
  g h g d g k g i g a`), the overlay, the status bar's mode and scroll position, the keys filter,
  the docs search and the hero animation. Every page works without it.
- `src/ts/hero-frames.ts` draws the hero's frames in box-drawing characters. The build renders
  the split-pane frame into the HTML as the no-JS and reduced-motion fallback; the script
  animates the rest, with a pause button, and stops when the hero is off screen.
- `data/bindings.json` is generated from Vimma's `docs/bindings.md` by `scripts/gen-keys.ts` and
  committed, so the site builds without Vimma's repository. It records the source commit.

## The docs

`/docs/` is modelled on a classic docs site: a sidebar of pages, an "on this page" list, a search
box, previous/next links (`[` and `]`). Only "Start here" (`src/docs/start-here.html`) and each
page's intro (`src/docs/<slug>.html`) are written by hand. The rest is cut at build time from
copies of Vimma's `docs/guide.md`, `docs/limits.md` and `docs/bindings.md` in `data/docs/`,
taken from the main repository's `origin/main` by `npm run docs:sync` (which runs only
`git fetch` and `git show` there) and committed with the commit they came from.

- `scripts/docs-pages.ts` lists the pages and what each is made of: guide sections by heading,
  rows of the guide's keys table by their first cell, paragraphs by their opening words,
  bindings sections, and links to the known-limits sections. If upstream renames or drops any
  of them, the build fails and names it: re-sync, then update that file.
- `scripts/md.ts` is a small Markdown reader for the subset the guide uses. Links to other
  guide headings are pointed at whichever docs page renders them; links to specs, ADRs and the
  runbook stay as plain text, since that repository is not public yet.
- The known-limits page leaves out the `limits.md` lines the same commit's guide contradicts
  (listed in `STALE_LIMITS`, reported at build time), so they disappear when upstream fixes them.
- Search: the build writes `assets/js/docs-index.js` (each section's heading, a snippet and its
  distinct words; no URLs), which the docs pages import on first use. No server, no third party.
- Not documented yet, on purpose: features still in flight in the browser repository
  (bookmarks, workspace routing by domain or app). They get pages once merged.
- `assets/img/` holds the logo as AVIF, WebP and PNG at 256 and 512 px, made by
  `scripts/optimize-logo.sh` (ImageMagick, avifenc) and committed.
- Fonts: the system's monospace stack (`ui-monospace`, JetBrains Mono, Cascadia, SF Mono, Menlo,
  DejaVu Sans Mono, …). No font is downloaded.
- Privacy: no cookies, no analytics, no third-party requests. A CSP meta (`default-src 'none'`,
  `'self'` for scripts, styles and images) backs that up in the browser. The keys toggle is the
  only stored state, in `localStorage`.

## Accessibility

Semantic landmarks and headings, a skip link, visible focus, AA contrast in both schemes, and a
layout that works down to 320 px. The status bar is fixed at the foot and the page reserves room
for it. The site's single-key shortcuts never fire while typing in a field or with a modifier
held, and can be turned off in the `?` overlay (WCAG 2.1.4); `?` keeps working so they can be
turned back on. The blinking cursor and the hero animation stop under `prefers-reduced-motion`.
The hero's text screen is `aria-hidden`; its numbered list of keys says the same thing.

## Deploying later

Not now: publishing waits until Vimma has been daily-driven, and GitHub Pages is not free for a
private repository. The domain idea is **vimma.dev** (not bought yet). `dist/` is a plain static
site, so either host works:

- **GitHub Pages** (needs a public repository or a paid plan): add a `deploy` job after `check`
  using `actions/upload-pages-artifact` and `actions/deploy-pages` (pinned by SHA), with
  `pages: write` and `id-token: write` on that job only, and set Settings → Pages → Source to
  "GitHub Actions". Add `dist/CNAME` containing `vimma.dev` from the build. Without a custom
  domain the site lives under `/vimma-site/`; pages link relatively, but `404.html` uses
  root-absolute links and would need the base path.
- **Cloudflare Pages**: connect the repository, build command `npm ci && npm run build`, output
  directory `dist`, Node 22. Add `vimma.dev` as a custom domain. Cloudflare's Web Analytics must
  stay off.

On either host, keep the guarantees: no analytics snippet, no CDN fonts, and add the CSP as a
real response header (`frame-ancestors 'none'` too, which a meta tag cannot set).

## Licence

[MPL-2.0](LICENSE), like Vimma and Firefox, for the code. Vimma's repository names no separate
licence for its text or logo, so the site's text and the Vimma logo are MPL-2.0 here too.

Dependencies (development only, nothing ships to the browser): `typescript` (Apache-2.0; its
platform binary package `@typescript/typescript-linux-x64` is Apache-2.0 too) compiles the site
script and the build tools; `@types/node` (MIT, with `undici-types`, MIT) types the Node scripts.
Plain `tsc` and no bundler: the browser loads two small ES modules.
