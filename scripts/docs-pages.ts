// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The docs section: which pages exist, in what order, and what each is made of. Only the intros
// (src/docs/<slug>.html), "Start here" and "Why Vimma" are written by hand;
// everything else is cut from the synced copies of Vimma's guide.md, limits.md and bindings.json
// at build time. Every heading, table row and paragraph named here must exist upstream, or the
// build fails: that is the drift alarm. `npm run release:sync` copies them from the latest
// release; when it fails the build, fix this file.

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
  /** The <title> and link-preview title, when the heading alone says too little in a search result. */
  headTitle?: string;
  group: string;
  description: string;
  /**
   * The page's blocks. The hand-written guide (src/docs/<slug>.html) comes first; then the keys
   * table; then the guide.md blocks under one "Details" heading; then the limits links.
   */
  blocks: Block[];
  /** Written for this site only, nothing from guide.md: no "built from" source line. */
  handWritten?: boolean;
}

/**
 * The agent workspace's tool subsections, on a page of their own: with them, the agent workspace
 * page is over the page-weight budget, and the tools are a reference an agent's user looks up
 * apart from setting the workspace up.
 */
const AGENT_TOOL_SECTIONS = [
  "Moving around a page",
  "Listing a page's buttons and fields",
  "Clicking on a page",
  "Filling in a form",
  "Seeing a page",
  "Reading a page's errors",
  "Showing you a page",
  "Timeouts in agent tools",
];

/** limits.md sections shown on the Known limits page, in this order. */
export const LIMIT_SECTIONS = [
  "Features",
  "PDF viewer",
  "Copy mode",
  "Tabs and window",
  "Workspaces (by design)",
  "Bookmarks",
  "Add-ons",
  "Panes",
  "Privacy, security and services",
  "Compatibility and versions",
  "Platforms and packaging",
];

/**
 * limits.md bullets left out of the site because the guide (the same commit) contradicts them,
 * matched by their opening words. Each one is reported at build time. Empty while limits.md and
 * the guide agree.
 */
export const STALE_LIMITS: string[] = [
  // Pending notarisation and no macOS update notices: the guide says otherwise since 0.1.11.
  "A macOS release is signed with Vimma's Developer ID and notarised only once",
];

/** limits.md bullet prefixes that are out of date upstream and are dropped from the text. */
export const STALE_PREFIXES: string[] = [];

/**
 * Rewrites of guide.md text before it is parsed: internal names (milestones, specs, the
 * project's code names) that mean nothing to a reader. Each is [pattern, replacement]; one that
 * no longer matches is reported at build time, so the list can shrink as upstream changes. Empty
 * while the guide names none.
 */
export const GUIDE_REWRITES: [RegExp, string][] = [];

export const DOC_PAGES: DocPage[] = [
  {
    slug: "why",
    title: "Why Vimma",
    headTitle: "Why Vimma, compared with Vimium, Tridactyl, qutebrowser and Zen Browser",
    group: "Get started",
    description: "A browser, not an extension: what that changes for your keys, and Vimma side by side with Vimium, Tridactyl, qutebrowser and Zen Browser.",
    blocks: [],
    handWritten: true,
  },
  {
    slug: "install",
    title: "Install and first launch",
    group: "Get started",
    description: "Install Vimma on Linux x86_64 from a release, on Arch Linux with one command, or on a Mac with Homebrew, and start it with a profile of its own.",
    blocks: [
      { guide: "Installing" },
      { guide: "First launch, with its own profile" },
      { guide: "The start page" },
      { limits: ["Platforms and packaging"] },
    ],
  },
  {
    slug: "modes",
    title: "Modes and moving",
    headTitle: "Modes and moving: normal and insert mode, link hints, find and copy mode",
    group: "Browse with the keyboard",
    description: "How Vimma decides whether a key is a command or text, and how to scroll, follow links with hints, find text and copy it with Vim motions.",
    blocks: [
      { guide: "The two layers", only: true },
      { guide: "Normal and insert mode" },
      { guideParas: { section: "Keys", startsWith: ["`p` and `P` read"] }, title: "The clipboard keys", id: "clipboard-keys" },
      { guide: "Link hints" },
      { guide: "Copying a paragraph (element focus)" },
      { guide: "Find" },
      { guide: "Live grep" },
      { guide: "Copy mode" },
      { guide: "The command line" },
      { keys: ["Modes", "Navigation", "Page", "Hints", "Element focus", "Find", "Copy mode"] },
      { limits: ["Features", "Copy mode"] },
    ],
  },
  {
    slug: "bookmarks",
    title: "Bookmarks",
    headTitle: "Bookmarks from the keyboard",
    group: "Browse with the keyboard",
    description: "Bookmark a page with ctrl+b a and find it again in a filterable panel.",
    blocks: [
      { guide: "Bookmarks" },
      { keys: ["Bookmarks"] },
      { limits: ["Bookmarks"] },
    ],
  },
  {
    slug: "pdf",
    title: "PDF viewer",
    headTitle: "The PDF viewer: Vimma's keys in Firefox's pdf.js",
    group: "Browse with the keyboard",
    description: "PDFs in Firefox's own viewer with Vimma's keys: pages, zoom, an outline panel, marks and jumps.",
    blocks: [{ guide: "PDF viewer" }, { keys: ["PDF viewer", "PDF outline"] }, { limits: ["PDF viewer"] }],
  },
  {
    slug: "tabs",
    title: "Tabs and the window",
    headTitle: "Tabs, the side panel and the status bar",
    group: "Organise tabs and windows",
    description: "The ctrl+b prefix, the tab keys, tab search and names, the side panel, the bindings overlay and what the status bar shows.",
    blocks: [
      { guideParas: { section: "Keys", startsWith: ["While the overlay is open"] }, title: "The bindings overlay", id: "the-overlay" },
      { guide: "Tab search and tab rename" },
      { guide: "Side panel" },
      { guide: "Status bar", exclude: ["Colours and themes", "Hiding the toolbar"] },
      { keys: ["Help", "Tabs", "Side panel"] },
      { limits: ["Tabs and window"] },
    ],
  },
  {
    slug: "panes",
    title: "Split panes",
    headTitle: "Split panes and tmux layouts",
    group: "Organise tabs and windows",
    description: "Split, move between, zoom, swap and resize panes, as in tmux, and keep several splits in a workspace.",
    blocks: [
      { guideParas: { section: "Keys", startsWith: ["Clicking into a pane"] }, title: "Panes and tabs", id: "panes-and-tabs" },
      {
        guideParas: {
          section: "Picking a tab during a split",
          startsWith: ["Going to a tab that is not in the split", "A new tab you open while", "A split made outside Vimma"],
        },
        title: "Picking a tab during a split",
        id: "picking-a-tab-during-a-split",
      },
      { guide: "Several splits" },
      { guide: "Resize mode" },
      { guide: "Layouts" },
      { keys: ["Panes"] },
      { limits: ["Panes"] },
    ],
  },
  {
    slug: "workspaces",
    title: "Workspaces",
    headTitle: "Workspaces, the private workspace and routing",
    group: "Organise tabs and windows",
    description: "Each workspace is a Firefox container: switch, pick, create, rename and delete them, move tabs between them, browse privately one key away, and send sites to the workspace they belong in.",
    blocks: [
      { guide: "Workspaces", exclude: ["Side panel", "Agent workspace"] },
      { keys: ["Workspaces"] },
      { limits: ["Workspaces (by design)"] },
    ],
  },
  {
    slug: "config",
    title: "config.toml",
    headTitle: "config.toml: options, key bindings, colours and Omarchy",
    group: "Make it yours",
    description: "Options, key bindings, workspaces and colours in one TOML file, reloaded as you save; your Omarchy theme, followed live.",
    blocks: [
      { guide: "config.toml" },
      { guide: "Colours and themes" },
      { guide: "Settings (about:config)" },
      { guide: "about:vimma" },
      { keys: ["Config"] },
      { limits: ["Features"] },
    ],
  },
  {
    slug: "firefox-shortcuts",
    title: "Coming from Firefox",
    headTitle: "Coming from Firefox: your bookmarks, shortcuts and add-ons in Vimma",
    group: "Make it yours",
    description: "Bring your bookmarks and passwords over, see where Firefox's shortcuts went, drive your add-ons from the keyboard, and what else Vimma changes in Firefox.",
    blocks: [
      { guide: "Moving over from Firefox or Chrome" },
      { guide: "Firefox's own shortcuts" },
      { guide: "Keyboard layouts" },
      { guide: "Add-ons" },
      { guide: "Firefox behaviour Vimma changes" },
      { keys: ["Add-ons"] },
      { limits: ["Features", "Add-ons"] },
    ],
  },
  {
    slug: "agent-workspace",
    title: "The agent workspace",
    nav: "Agent workspace",
    headTitle: "The agent workspace: local AI agents through MCP, with your consent",
    group: "Use it with AI agents",
    description: "Let a local AI agent use one workspace of its own through vimma-ctl mcp; Vimma asks you before each request.",
    blocks: [{ guide: "Agent workspace", exclude: AGENT_TOOL_SECTIONS }, { keys: ["Agents"] }],
  },
  {
    slug: "agent-tools",
    title: "What agents can do on a page",
    nav: "Agent tools",
    headTitle: "Agent tools: move around, click, fill in and see pages in the agent workspace",
    group: "Use it with AI agents",
    description: "The tools an agent uses in its workspace: move around a page, list and click its controls, fill in forms, and see the page and its errors.",
    blocks: AGENT_TOOL_SECTIONS.map((guide) => ({ guide })),
  },
  {
    slug: "vimma-ctl",
    title: "Scripting with vimma-ctl",
    nav: "vimma-ctl",
    group: "Use it with AI agents",
    description: "Drive a running Vimma from a shell or a window-manager binding, over a local socket.",
    blocks: [{ guide: "Scripting with vimma-ctl" }],
  },
  {
    slug: "privacy",
    title: "Privacy defaults",
    headTitle: "Privacy defaults: what Vimma turns off",
    group: "Trust and limits",
    description: "What Vimma turns off compared with Firefox, what it keeps, and how to change it.",
    blocks: [
      { guide: "Privacy defaults" },
      { limits: ["Privacy, security and services", "Compatibility and versions"] },
    ],
  },
  {
    slug: "limits",
    title: "Known limits",
    headTitle: "Known limits of pre-alpha Vimma",
    group: "Trust and limits",
    description: "Every known gap in Vimma today, one line each: features, panes, add-ons, privacy, compatibility and platforms.",
    blocks: [],
  },
];
