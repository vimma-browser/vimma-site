// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The home page's session: a real Vimma window, one screenshot per key. The screenshots come from
// a real build (`npm run shots`, scripts/shots.ts, shots/scenarios/m5-site-hero.json). The build
// renders the static step into the HTML (the no-JS and reduced-motion fallback); the site script
// steps through the rest.

export interface Step {
  /** The keys pressed to reach this screenshot, as chords ("ctrl+b", "v"). Empty for the first. */
  keys: readonly string[];
  /** What the keys did, one short line, read after the keys. */
  label: string;
  /** assets/img/shots/<shot>.avif and .webp */
  shot: string;
  /** The screenshot's alternative text. */
  alt: string;
}

export const STEPS: readonly Step[] = [
  {
    keys: [],
    label: "A page in normal mode. Your keys drive it; the mouse can rest.",
    shot: "hero-normal",
    alt: "Vimma showing a news site's front page, with the status bar at the bottom reading NORMAL, 1:main, tab 2/2.",
  },
  {
    keys: ["f"],
    label: "puts a short label on every link you can see.",
    shot: "hero-hints",
    alt: "The same page with a yellow letter label on every link, and the status bar reading HINT.",
  },
  {
    keys: ["f"],
    label: "is the first link's label: type it and the link opens.",
    shot: "hero-follow",
    alt: "The linked article, open in the same tab.",
  },
  {
    keys: ["ctrl+b"],
    label: "is the prefix, as in tmux: the next key acts on the window.",
    shot: "hero-prefix",
    alt: "The article, with the status bar showing a red prefix badge after NORMAL.",
  },
  {
    keys: ["v"],
    label: "splits right: two pages side by side.",
    shot: "hero-split",
    alt: "The window split in two: the article on the left, Vimma's start page on the right, and the status bar reading pane 2/2.",
  },
  {
    keys: ["ctrl+b", ")"],
    label: "goes to the next workspace, with cookies and logins of its own.",
    shot: "hero-workspace",
    alt: "A mail inbox in the work workspace, signed in; the status bar reads 2:work.",
  },
  {
    keys: ["ctrl+b", "?"],
    label: "shows every binding; / filters them.",
    shot: "hero-help",
    alt: "The key bindings overlay over the page, listing tab and pane keys, with a filter box.",
  },
];

/** The step shown without JavaScript or with reduced motion: the split, which shows most. */
export const STATIC_STEP = 4;

/** Width and height of the screenshots (the harness's window). */
export const SHOT_SIZE = { width: 1280, height: 800 } as const;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c] ?? c);

/** A step's screenshot as a <picture>, AVIF first. `root` is the path to the site root. */
export function shotHtml(step: Step, root: string): string {
  const base = `${root}assets/img/shots/${step.shot}`;
  return `<picture>
<source type="image/avif" srcset="${base}.avif">
<img src="${base}.webp" width="${SHOT_SIZE.width}" height="${SHOT_SIZE.height}" alt="${escapeHtml(step.alt)}">
</picture>`;
}
