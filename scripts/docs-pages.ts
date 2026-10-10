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
  /** Rows of a guide.md table, by the exact text of their first cell, as a new table. */
  | { guideRows: { section: string; header: string; rows: string[] }; title: string; id: string }
  /** Top-level paragraphs of a guide.md section, by the text they start with. */
  | { guideParas: { section: string; startsWith: string[] } }
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
  blocks: Block[];
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

const KEYS_HEADER = "| Keys | What it does |";

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
      {
        guideRows: {
          section: "Keys",
          header: KEYS_HEADER,
          rows: [
            "`j` / `k`, `h` / `l`",
            "`d` / `u`",
            "`gg` / `G`",
            "`H` / `L`",
            "`r`",
            "`i`",
            "`gi`",
            "`yy`",
            "`p` / `P`",
            "`gu` / `gU`",
            "`gf`",
            "`f` / `F`",
            "`/` / `?`",
            "`n` / `N`",
          ],
        },
        title: "The keys",
        id: "the-keys",
      },
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
      {
        guideRows: {
          section: "Keys",
          header: KEYS_HEADER,
          rows: [
            "`ctrl+b ?`",
            "`/` (in the overlay)",
            "`Esc` or `q` (overlay)",
            "`ctrl+b c`, `t`",
            "`ctrl+b n` / `ctrl+b p`",
            "`ctrl+b 1..9`",
            "`ctrl+b shift+x`, `x`",
            "`ctrl+b g`, `b`",
            "`ctrl+b shift+t`",
            "`ctrl+b` then anything else",
            "Firefox's own keys",
          ],
        },
        title: "The keys",
        id: "the-keys",
      },
      { guideParas: { section: "Keys", startsWith: ["While the overlay is open"] } },
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
        guideRows: {
          section: "Keys",
          header: KEYS_HEADER,
          rows: [
            "`ctrl+b v` / `ctrl+b -`",
            "`ctrl+b h j k l`",
            "`ctrl+b z`, `ctrl+w o`",
            "`ctrl+b x`",
            "`ctrl+b shift+h j k l`",
            "`ctrl+b r`",
          ],
        },
        title: "The keys",
        id: "the-keys",
      },
      { guideParas: { section: "Keys", startsWith: ["Clicking into a pane", "A split made outside Vimma"] } },
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
      {
        guideRows: {
          section: "Keys",
          header: KEYS_HEADER,
          rows: ["`ctrl+b a`", "`ctrl+b shift+b`"],
        },
        title: "The keys",
        id: "the-keys",
      },
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
    title: "Omarchy theming",
    nav: "Omarchy theme",
    group: "Make it yours",
    description: "Vimma takes its colours from your Omarchy theme, and Tokyo Night without one.",
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
  },
  {
    slug: "limits",
    title: "Known limits",
    group: "Reference",
    description: "Every known gap in Vimma today, one line each.",
    blocks: [],
  },
];
