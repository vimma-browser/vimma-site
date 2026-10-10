// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The docs section: which pages exist, in what order, and what each is made of. Only the intros
// (src/docs/<slug>.html) and "Start here" are written by hand; everything else is cut from the
// synced copies of Vimma's guide.md, limits.md and bindings.json at build time. Every heading,
// table row and paragraph named here must exist upstream, or the build fails: that is the
// drift alarm. Run `npm run docs:sync`, then fix this file.

export type Block =
  /** A guide.md section by its heading, with its subsections unless `only` or `exclude`. */
  | { guide: string; exclude?: string[]; only?: boolean }
  /** Top-level paragraphs of a guide.md section, by the text they start with, under a heading. */
  | { guideParas: { section: string; startsWith: string[] }; title: string; id: string }
  /** Sections of bindings.md, as key tables under one "Default keys" heading. */
  | { keys: string[] }
  /** Links to the matching sections of the Known limits page. */
  | { limits: string[] };

export interface DocPage {
  slug: string;
  title: string;
  /** Shorter title for the sidebar, if different. */
  nav?: string;
  group: string;
  description: string;
  /**
   * The page's blocks. The hand-written guide (src/docs/<slug>.html) comes first; then the keys
   * table; then the guide.md blocks under one "Details" heading; then the limits links.
   */
  blocks: Block[];
  /** Render the guide.md blocks as the page's main content, not as "Details" (the FAQ). */
  noDetails?: boolean;
}

/** limits.md sections shown on the Known limits page, in this order. */
export const LIMIT_SECTIONS = [
  "Features",
  "Find",
  "Copy mode",
  "Tabs and window",
  "Workspaces (M3, by design)",
  "Bookmarks",
  "Panes",
  "Privacy, security and services",
  "Compatibility and versions",
  "Files and profiles",
  "Branding",
  "Platforms and packaging",
];

/**
 * limits.md bullets left out of the site because the guide (the same commit) contradicts them:
 * they predate M4's split panes. Matched by their opening words. Each one is reported at build
 * time, so the list empties itself as upstream fixes limits.md.
 */
export const STALE_LIMITS = [
  "No split panes yet:",
  "`:q` and `ctrl+b x` close the tab: with no split panes yet",
];

/** limits.md bullet prefixes that are out of date upstream and are dropped from the text. */
export const STALE_PREFIXES = ["Planned for M4: "];

/**
 * Rewrites of guide.md text before it is parsed: internal names (milestones, specs, the
 * project's code names) that mean nothing to a reader. Each is [pattern, replacement]; one that
 * no longer matches is reported at build time, so the list can shrink as upstream changes.
 */
export const GUIDE_REWRITES: [RegExp, string][] = [
  [/\s+Spec:\s+\[[^\]]+\]\([^)]+\)(,\s+protocol:\s*\[[^\]]+\]\([^)]+\))?\./g, ""],
  [/For workspaces\s+\(\[m3-workspaces\]\([^)]+\)\); each/g, "For workspaces; each"],
  [/every key,\s+its type and default are in \[[^\]]+\]\([^)]+\)\s+and \[[^\]]+\]\([^)]+\), and\s+/g, ""],
  [/(\s)planned for M6\./g, "$1planned."],
  [/\*\*Planned for M6; no release has these files yet\.\*\*/g, "**Planned; no release has these files yet.**"],
];

export const DOC_PAGES: DocPage[] = [
  {
    slug: "install",
    title: "Install and first launch",
    nav: "Install",
    group: "Get going",
    description: "Build Vimma from source on Linux x86_64 and start it with a profile of its own.",
    blocks: [
      { guide: "Install" },
      { guide: "First launch, with its own profile" },
      { guide: "The start page" },
      { guide: "Installing (planned, not yet released)" },
      { limits: ["Platforms and packaging", "Files and profiles"] },
    ],
  },
  {
    slug: "modes",
    title: "Modes",
    group: "Get going",
    description: "Normal, insert, visual, hint and command: how Vimma decides who gets a key.",
    blocks: [
      { guide: "The two layers", only: true },
      { guide: "Normal and insert mode" },
      { guide: "Status bar", exclude: ["Colours: your Omarchy theme"] },
      { guide: "The command line" },
      { keys: ["Modes"] },
      { limits: ["Features"] },
    ],
  },
  {
    slug: "moving",
    title: "Moving around pages",
    nav: "Moving around",
    group: "Get going",
    description: "Scroll, follow links with hints, find text, and go back, forward and reload.",
    blocks: [
      { guideParas: { section: "Keys", startsWith: ["`p` and `P` read"] }, title: "The clipboard keys", id: "clipboard-keys" },
      { guide: "Link hints" },
      { guide: "Find" },
      { keys: ["Navigation", "Page", "Hints", "Find"] },
      { limits: ["Find"] },
    ],
  },
  {
    slug: "tabs",
    title: "The prefix and tabs",
    nav: "Prefix and tabs",
    group: "Tabs, panes, workspaces",
    description: "ctrl+b, the tab keys, the bindings overlay, the goto picker and tab names.",
    blocks: [
      { guideParas: { section: "Keys", startsWith: ["While the overlay is open"] }, title: "The bindings overlay", id: "the-overlay" },
      { guide: "Goto picker and tab rename" },
      { keys: ["Help", "Tabs"] },
      { limits: ["Tabs and window"] },
    ],
  },
  {
    slug: "panes",
    title: "Split panes",
    group: "Tabs, panes, workspaces",
    description: "Split, move between, zoom, swap and resize panes, as in tmux.",
    blocks: [
      {
        guideParas: { section: "Keys", startsWith: ["Clicking into a pane", "A split made outside Vimma"] },
        title: "Panes and tabs",
        id: "panes-and-tabs",
      },
      { guide: "Resize mode" },
      { keys: ["Panes"] },
      { limits: ["Panes"] },
    ],
  },
  {
    slug: "workspaces",
    title: "Workspaces as containers",
    nav: "Workspaces",
    group: "Tabs, panes, workspaces",
    description: "Each workspace is a Firefox container: switch, pick, create, rename, delete, move tabs, route links.",
    blocks: [
      { guide: "Workspaces", exclude: ["Side panel"] },
      { keys: ["Workspaces"] },
      { limits: ["Workspaces (M3, by design)"] },
    ],
  },
  {
    slug: "side-panel",
    title: "The side panel",
    nav: "Side panel",
    group: "Tabs, panes, workspaces",
    description: "An on-demand list of the workspace's tabs down the left of the window.",
    blocks: [{ guide: "Side panel" }, { keys: ["Side panel"] }],
  },
  {
    slug: "bookmarks",
    title: "Bookmarks",
    group: "Tabs, panes, workspaces",
    description: "Bookmark a page with ctrl+b a and find it again in a filterable panel.",
    blocks: [
      { guide: "Bookmarks" },
      { keys: ["Bookmarks"] },
      { limits: ["Bookmarks"] },
    ],
  },
  {
    slug: "copy-mode",
    title: "Copy mode",
    group: "Tabs, panes, workspaces",
    description: "A caret on the page, Vim motions, a selection and y to copy it.",
    blocks: [{ guide: "Copy mode" }, { keys: ["Copy mode"] }, { limits: ["Copy mode"] }],
  },
  {
    slug: "config",
    title: "config.toml",
    group: "Make it yours",
    description: "Options, key bindings and workspaces in one TOML file, reloaded as you save.",
    blocks: [
      { guide: "config.toml" },
      { guide: "Settings (about:config)" },
      { guide: "about:vimma" },
      { keys: ["Config"] },
      { limits: ["Features"] },
    ],
  },
  {
    slug: "theming",
    title: "Theming",
    group: "Make it yours",
    description: "Tokyo Night by default, your own colours in config.toml, or your Omarchy theme, live.",
    blocks: [{ guide: "Colours: your Omarchy theme" }, { limits: ["Features"] }],
  },
  {
    slug: "privacy",
    title: "Privacy defaults",
    group: "Make it yours",
    description: "What Vimma turns off compared with Firefox, what it keeps, and how to change it.",
    blocks: [
      { guide: "Privacy defaults" },
      { guide: "Firefox behaviour Vimma changes" },
      { limits: ["Privacy, security and services", "Compatibility and versions"] },
    ],
  },
  {
    slug: "vimma-ctl",
    title: "Scripting with vimma-ctl",
    nav: "vimma-ctl",
    group: "Make it yours",
    description: "Drive a running Vimma from a shell or a window-manager binding, over a local socket.",
    blocks: [{ guide: "Scripting with vimma-ctl" }],
  },
  {
    slug: "troubleshooting",
    title: "FAQ and troubleshooting",
    nav: "Troubleshooting",
    group: "Reference",
    description: "Answers to the questions people run into first.",
    blocks: [{ guide: "FAQ and troubleshooting" }],
    noDetails: true,
  },
  {
    slug: "limits",
    title: "Known limits",
    group: "Reference",
    description: "Every known gap in Vimma today, one line each.",
    blocks: [],
  },
];
