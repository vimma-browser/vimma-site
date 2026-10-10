// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The home page's "terminal session": a Vimma window drawn in box-drawing characters, one frame
// per key. Pure data and string building, no DOM: the build renders the static frame into the
// HTML (the no-JS and reduced-motion fallback) and the site script animates the rest.

/** A run of text and the class that colours it. */
export type Seg = readonly [text: string, cls?: string];
export type Row = readonly Seg[];

export interface Step {
  /** The keys pressed to reach this frame, as chords ("ctrl+b", "v"). Empty for the first. */
  keys: readonly string[];
  /** What the keys did, one short line (also the accessible description of the frame). */
  label: string;
  rows: readonly Row[];
}

/** Columns of the whole screen, borders included. */
export const COLS = 54;
const BODY = 7;

const len = (row: Row): number => row.reduce((n, [t]) => n + [...t].length, 0);

/** Pads (or, defensively, clips) a row to `w` columns. */
function fit(row: Row, w: number): Row {
  const n = len(row);
  if (n === w) return row;
  if (n < w) return [...row, [" ".repeat(w - n)]];
  const out: Seg[] = [];
  let left = w;
  for (const [t, c] of row) {
    if (left <= 0) break;
    const chars = [...t].slice(0, left).join("");
    out.push(c === undefined ? [chars] : [chars, c]);
    left -= [...chars].length;
  }
  return out;
}

const plain = (t: string): Row => [[t]];

/** `┌─ title ───┐` in `w` columns; `cls` colours the border (the focused pane). */
function top(title: string, w: number, cls = "frame"): Row {
  const rest = w - [...title].length - 5;
  // the title is text, so it gets a readable colour; the line itself is decoration
  return [
    ["┌─ ", cls],
    [title, cls === "acc" ? "acc" : "dim"],
    [" " + "─".repeat(Math.max(0, rest)) + "┐", cls],
  ];
}

function bottom(w: number, cls = "frame"): Row {
  return [["└" + "─".repeat(w - 2) + "┘", cls]];
}

/** One pane: a bordered box `w` wide with the body rows inside. */
function pane(title: string, body: readonly Row[], w: number, focused: boolean): Row[] {
  const cls = focused ? "acc" : "frame";
  const rows: Row[] = [top(title, w, cls)];
  if (len(rows[0] ?? []) !== w) throw new Error(`pane "${title}": top row is not ${w} wide`);
  for (let i = 0; i < BODY; i++) {
    rows.push([["│", cls], ...fit(body[i] ?? [], w - 2), ["│", cls]]);
  }
  rows.push(bottom(w, cls));
  return rows;
}

function sideBySide(a: Row[], b: Row[]): Row[] {
  return a.map((row, i) => [...row, ...(b[i] ?? [])]);
}

interface Status {
  mode: string;
  pending?: string;
  ws: string;
  where: string;
  right: string;
}

function status(s: Status): Row {
  const left: Seg[] = [[` ${s.mode.toUpperCase()} `, `badge badge-${s.mode}`]];
  if (s.pending) left.push([" "], [` ${s.pending} `, "badge badge-prefix"]);
  left.push([" ● ", "acc"], [s.ws, "fg"]);
  const right: Seg[] = [[`${s.right} `, "dim"]];
  // the title gives way first, as in Vimma's bar
  const room = COLS - len(left) - len(right) - 1;
  let where = `  ${s.where}`;
  if ([...where].length > room) where = [...where].slice(0, room - 1).join("") + "…";
  left.push([where]);
  const gap = COLS - len(left) - len(right);
  return [...left, [" ".repeat(Math.max(1, gap))], ...right];
}

function screen(panes: Row[], s: Status, overlay?: readonly Row[]): Row[] {
  const rows = panes.map((r) => fit(r, COLS));
  if (overlay) {
    // Drawn over the body, centred, as the ctrl+b ? overlay is.
    const w = len(overlay[0] ?? []);
    const x = Math.floor((COLS - w) / 2);
    overlay.forEach((o, i) => {
      const y = 1 + i;
      const base = rows[y];
      if (!base) return;
      rows[y] = [...slice(base, 0, x), ...o, ...slice(base, x + w, COLS)];
    });
  }
  rows.push(status(s));
  return rows;
}

/** Columns [from, to) of a row, keeping each segment's class. */
function slice(row: Row, from: number, to: number): Seg[] {
  const out: Seg[] = [];
  let at = 0;
  for (const [t, c] of row) {
    const chars = [...t];
    const a = Math.max(from, at);
    const b = Math.min(to, at + chars.length);
    if (a < b) {
      const text = chars.slice(a - at, b - at).join("");
      out.push(c === undefined ? [text] : [text, c]);
    }
    at += chars.length;
  }
  return out;
}

// --- page contents -------------------------------------------------------------------------

const LINKS = [
  "Show: a browser you drive with hjkl",
  "Modal editing, thirty years on",
  "Notes on tmux muscle memory",
  "Containers, explained",
];
const HINTS = ["a", "s", "d", "f"];

function front(hints: boolean): Row[] {
  const link = (t: string, i: number): Row =>
    hints
      ? [[" "], [HINTS[i] ?? "", "hint"], [" "], [t, "link"]]
      : [[" "], ["▸", "dim"], [" "], [t, "link"]];
  return [[[" Front page", "fg"]], [], ...LINKS.map(link), [[" "], ["more ›", "dim"]]];
}

const ARTICLE: Row[] = [
  [[" Show: a browser you", "fg"]],
  [[" drive with hjkl", "fg"]],
  [[" ───────────────────", "dim"]],
  plain(" Normal mode scrolls;"),
  plain(" f labels each link;"),
  plain(" ctrl+b is the prefix"),
  plain(" for tabs and panes."),
];

const ARTICLE_WIDE: Row[] = [
  [[" Show: a browser you drive with hjkl", "fg"]],
  [[" ───────────────────────────────────", "dim"]],
  plain(" Normal mode scrolls the page and f labels"),
  plain(" every link. ctrl+b is the prefix layer for"),
  plain(" tabs, panes and workspaces, as in tmux."),
  [],
  [[" j/k scroll · gg top · G bottom", "dim"]],
];

const START: Row[] = [
  [],
  [["      vimma", "green"]],
  [],
  [[" ctrl+b ?", "acc"], ["  keys"]],
  [[" :", "acc"], ["         commands"]],
  [[" f", "acc"], ["         hints"]],
  [],
];

const INBOX: Row[] = [
  [[" Inbox (3)", "fg"]],
  [],
  [[" ● ", "acc"], ["Build finished in 39 min"]],
  [[" ● ", "acc"], ["Review: split panes"]],
  [[" ○ ", "dim"], ["Lunch on Friday?", "dim"]],
  [],
  [[" signed in here only: work container", "dim"]],
];

const HELP_W = 32;
const helpRow = (k: string, what: string): Row => [
  ["│", "cyan"],
  [` ${k.padEnd(9)}`, "acc"],
  [` ${what}`.padEnd(HELP_W - 12)],
  ["│", "cyan"],
];
const HELP: Row[] = [
  [["╭─ keys " + "─".repeat(HELP_W - 9) + "╮", "cyan"]],
  helpRow("ctrl+b c", "new tab"),
  helpRow("ctrl+b v", "split right"),
  helpRow("ctrl+b w", "pick a workspace"),
  helpRow("f", "follow a link"),
  helpRow("/", "find in page"),
  [["╰" + "─".repeat(HELP_W - 12) + " / filter ╯", "cyan"]],
];

const HALF = COLS / 2;

export const STEPS: readonly Step[] = [
  {
    keys: [],
    label: "A page in normal mode. Your keys drive it; the mouse can rest.",
    rows: screen(pane("news.example", front(false), COLS, false), {
      mode: "normal",
      ws: "1:main",
      where: "tab 1/3  Front page",
      right: "news.example",
    }),
  },
  {
    keys: ["f"],
    label: "puts a short label on every link you can see.",
    rows: screen(pane("news.example", front(true), COLS, false), {
      mode: "hint",
      ws: "1:main",
      where: "tab 1/3  Front page",
      right: "news.example",
    }),
  },
  {
    keys: ["a"],
    label: "is a label: type it and the link opens.",
    rows: screen(pane("news.example/show", ARTICLE_WIDE, COLS, false), {
      mode: "normal",
      ws: "1:main",
      where: "tab 1/3  Show: a browser…",
      right: "news.example",
    }),
  },
  {
    keys: ["ctrl+b"],
    label: "is the prefix, as in tmux: the next key acts on the window.",
    rows: screen(pane("news.example/show", ARTICLE_WIDE, COLS, false), {
      mode: "normal",
      pending: "prefix",
      ws: "1:main",
      where: "tab 1/3",
      right: "news.example",
    }),
  },
  {
    keys: ["v"],
    label: "splits right: two pages side by side.",
    rows: screen(
      sideBySide(pane("news.example", ARTICLE, HALF, false), pane("vimma", START, HALF, true)),
      { mode: "normal", ws: "1:main", where: "tab 1/3  pane 2/2", right: "start page" },
    ),
  },
  {
    keys: ["ctrl+i"],
    label: "goes to the next workspace, with cookies and logins of its own.",
    rows: screen(pane("mail.example", INBOX, COLS, false), {
      mode: "normal",
      ws: "2:work",
      where: "tab 1/2  Inbox (3)",
      right: "mail.example",
    }),
  },
  {
    keys: ["ctrl+b", "?"],
    label: "shows every binding; / filters them.",
    rows: screen(
      pane("mail.example", INBOX, COLS, false),
      { mode: "help", ws: "2:work", where: "tab 1/2", right: "esc to close" },
      HELP,
    ),
  },
];

/** The frame shown without JavaScript or with reduced motion: the split, which shows most. */
export const STATIC_STEP = 4;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c] ?? c);

/** A frame as HTML for the inside of a `<pre>`. */
export function frameHtml(step: Step): string {
  const last = step.rows.length - 1;
  return step.rows
    .map((row, i) => {
      const html = row
        .map(([t, c]) => (c ? `<span class="${c}">${escapeHtml(t)}</span>` : escapeHtml(t)))
        .join("");
      // the last row is the status bar: give it the bar's background
      return i === last ? `<span class="sbrow">${html}</span>` : html;
    })
    .join("\n");
}

/** Every row has exactly COLS columns; the build fails otherwise. */
export function checkFrames(): string[] {
  const errors: string[] = [];
  STEPS.forEach((s, i) =>
    s.rows.forEach((r, j) => {
      if (len(r) !== COLS) errors.push(`frame ${i} row ${j}: ${len(r)} columns, not ${COLS}`);
    }),
  );
  return errors;
}
