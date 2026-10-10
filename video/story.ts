// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The promo's storyboard: which segments, in which order, and what is drawn on each (the
// titles, the dusty mouse, the captions and the key chips). render.ts turns each segment into
// video with ffmpeg; the footage comes from Vimma's tools/promo/record.mjs.

import { Script, TOKYO, alpha, circle, colour, escapeText, roundedRect } from "./ass.js";

/** One recorded shot, as tools/promo/record.mjs writes it in manifest.json. */
export interface Shot {
  name: string;
  file: string;
  duration: number;
  keys: { t: number; keys: string }[];
  marks: { t: number; name: string }[];
  /** screen points of interest in the footage, device pixels (e.g. the hinted link) */
  points?: Record<string, { x: number; y: number }>;
}

export interface Manifest {
  geometry: { width: number; height: number };
  fps: number;
  shots: Shot[];
}

/** A rectangle on the canvas. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where things go on one canvas size. */
interface Layout {
  width: number;
  height: number;
  /** the footage, scaled into this box */
  footage: Box;
  /** caption baseline (centre of the line) and size */
  captionY: number;
  captionSize: number;
  /** key chips: centre line and text size */
  keysY: number;
  keySize: number;
  /** the big terminal-style title cards */
  titleSize: number;
}

export const LANDSCAPE: Layout = {
  width: 1920,
  height: 1080,
  footage: { x: 160, y: 88, w: 1600, h: 900 },
  captionY: 44,
  captionSize: 36,
  keysY: 1035,
  keySize: 34,
  titleSize: 54,
};

export const PORTRAIT: Layout = {
  width: 1080,
  height: 1920,
  footage: { x: 108, y: 190, w: 864, h: 1536 },
  captionY: 95,
  captionSize: 36,
  keysY: 1822,
  keySize: 44,
  titleSize: 50,
};

/**
 * A zoom keyframe on the footage, in segment time: magnification `z` centred on (`x`, `y`) in
 * source pixels. render.ts eases between keyframes.
 */
export interface Zoom {
  t: number;
  z: number;
  x: number;
  y: number;
}

/** A segment of the finished video. */
export interface Segment {
  name: string;
  duration: number;
  /** background colour */
  bg: string;
  /** recorded footage, trimmed and scaled into the layout's footage box */
  footage?: { file: string; start: number; box: Box; source: { width: number; height: number }; zoom?: Zoom[] };
  /** a still image (the logo), scaled to `box` */
  image?: { file: string; box: Box; fadeIn: number };
  script: Script;
}

export interface StoryOptions {
  font: string;
  /** horizontal advance of one monospace character per unit of font size */
  advance: number;
  /** the vimma checkout, for the logo */
  vimma: string;
  footageDir: string;
  manifest: Manifest;
}

const FADE = 0.35;
const OUTRO_BG = "#020308"; // the logo's own background

/** The width of `text` in the monospace font at `size`. */
function textWidth(o: StoryOptions, text: string, size: number): number {
  return [...text].length * o.advance * size;
}

function shot(manifest: Manifest, name: string): Shot {
  const s = manifest.shots.find((x) => x.name === name);
  if (!s) throw new Error(`the footage has no "${name}" shot; record it again`);
  return s;
}

function mark(s: Shot, name: string): number {
  const m = s.marks.find((x) => x.name === name);
  if (!m) throw new Error(`shot "${s.name}" has no "${name}" mark`);
  return m.t;
}

/** A terminal window: rounded panel, title bar with three dots and a title. */
function terminal(sc: Script, start: number, end: number, box: Box, title: string, o: StoryOptions): void {
  const bar = Math.round(box.h > 500 ? 52 : 44);
  sc.shape(start, end, box.x, box.y, roundedRect(box.w, box.h, 16), {
    fill: TOKYO.bgDark,
    line: TOKYO.border,
    lineWidth: 2,
    layer: 0,
    tags: `\\fad(${FADE * 1000},${FADE * 1000})`,
  });
  sc.shape(start, end, box.x + 2, box.y + bar, `m 0 0 l ${box.w - 4} 0 l ${box.w - 4} 2 l 0 2`, {
    fill: TOKYO.border,
    layer: 1,
  });
  [TOKYO.red, TOKYO.yellow, TOKYO.green].forEach((c, i) =>
    sc.shape(start, end, box.x + 24 + i * 30, box.y + bar / 2 - 8, circle(8), { fill: c, layer: 1 }),
  );
  const size = 24;
  sc.text(start, end, box.x + box.w / 2, box.y + bar / 2, escapeText(title), {
    size,
    colour: TOKYO.comment,
    an: 5,
  });
  void o;
}

/**
 * Type `text` out a character at a time from `start`, at `cps` characters a second, with a
 * block cursor that blinks once typing is done. `prefix` (a prompt) shows at once.
 */
function typed(
  sc: Script,
  o: StoryOptions,
  x: number,
  y: number,
  start: number,
  end: number,
  prefix: { text: string; colour: string }[],
  text: string,
  opt: { size: number; colour: string; cps?: number; cursor?: boolean; an?: number },
): number {
  const cps = opt.cps ?? 18;
  const chars = [...text];
  const pre = prefix.map((p) => `{\\c${colour(p.colour)}}${escapeText(p.text)}`).join("");
  const cursor = `{\\c${colour(TOKYO.fg)}}█`;
  const line = (n: number, withCursor: boolean) =>
    `${pre}{\\c${colour(opt.colour)}}${escapeText(chars.slice(0, n).join(""))}${withCursor ? cursor : ""}`;
  const done = start + chars.length / cps;
  for (let n = 0; n <= chars.length; n++) {
    const t0 = start + n / cps;
    const t1 = n === chars.length ? done : start + (n + 1) / cps;
    if (n < chars.length) sc.text(t0, t1, x, y, line(n, opt.cursor !== false), { size: opt.size, an: opt.an ?? 4 });
  }
  // after typing: blink the cursor at 2 Hz until the end
  let t = done;
  let on = true;
  while (t < end) {
    const next = Math.min(end, t + 0.5);
    sc.text(t, next, x, y, line(chars.length, opt.cursor !== false && on), { size: opt.size, an: opt.an ?? 4 });
    on = !on;
    t = next;
  }
  void o;
  return done;
}

/** A prompt-style caption over the footage: `~/ $ keys   # what they do`. */
function caption(sc: Script, L: Layout, start: number, end: number, keys: string, comment: string): void {
  const x = L.width === 1920 ? L.footage.x : L.width / 2;
  const an = L.width === 1920 ? 4 : 5;
  const parts =
    `{\\c${colour(TOKYO.green)}}~/ ${"$"} {\\c${colour(TOKYO.fg)}}${escapeText(keys)}` +
    (comment ? `{\\c${colour(TOKYO.comment)}}  # ${escapeText(comment)}` : "");
  if (L.width === 1920) {
    sc.text(start, end, x, L.captionY, parts, { size: L.captionSize, an, tags: "\\fad(250,200)" });
  } else {
    // portrait: the keys on one line, the comment under it
    sc.text(start, end, x, L.captionY - 26, `{\\c${colour(TOKYO.green)}}~/ $ {\\c${colour(TOKYO.fg)}}${escapeText(keys)}`, {
      size: L.captionSize + 4,
      an,
      tags: "\\fad(250,200)",
    });
    if (comment) {
      sc.text(start, end, x, L.captionY + 30, `{\\c${colour(TOKYO.comment)}}# ${escapeText(comment)}`, {
        size: L.captionSize - 4,
        an,
        tags: "\\fad(250,200)",
      });
    }
  }
}

/** How a key is shown on its chip. */
function keyLabel(keys: string): string {
  if (keys === "g g") return "gg";
  if (keys === "enter") return "↵ enter";
  if (keys === "space") return "space";
  return keys;
}

/**
 * The key chips: each keystroke appears as a keycap at its time; keys that follow within
 * `gap` seconds join the same row, and a row clears `hold` seconds after its last key. Each
 * row is laid out once, centred, so chips never move after they appear.
 */
function keyChips(
  sc: Script,
  o: StoryOptions,
  L: Layout,
  keys: { t: number; keys: string }[],
  end: number,
  breaks: number[] = [],
): void {
  const gap = 2.0;
  const hold = 1.4;
  const size = L.keySize;
  const padX = Math.round(size * 0.55);
  const h = Math.round(size * 1.6);
  const space = Math.round(size * 0.4);
  const chipWidth = (k: { keys: string }) => Math.round(textWidth(o, keyLabel(k.keys), size) + 2 * padX);
  const rowWidth = (r: { keys: string }[]) => r.reduce((a, k) => a + chipWidth(k) + space, -space);
  const rows: { t: number; keys: string }[][] = [];
  for (const k of keys) {
    const row = rows[rows.length - 1];
    const last = row?.[row.length - 1];
    const marked = last !== undefined && breaks.some((b) => b > last.t && b <= k.t);
    const fits = row !== undefined && rowWidth([...row, k]) <= L.width * 0.86;
    if (row && last && k.t - last.t <= gap && fits && !marked) row.push(k);
    else rows.push([k]);
  }
  rows.forEach((row, i) => {
    const lastT = row[row.length - 1]?.t ?? 0;
    const nextRow = rows[i + 1]?.[0]?.t ?? Infinity;
    const rowEnd = Math.min(end, lastT + hold, nextRow);
    const widths = row.map(chipWidth);
    const total = widths.reduce((a, b) => a + b, 0) + space * (row.length - 1);
    let x = Math.round(L.width / 2 - total / 2);
    row.forEach((k, j) => {
      const w = widths[j] ?? 0;
      const y = Math.round(L.keysY - h / 2);
      const fade = `\\fad(80,${rowEnd >= end ? 0 : 200})`;
      // the newest key is lit, then settles
      sc.shape(k.t, rowEnd, x, y + 4, roundedRect(w, h, 10), { fill: TOKYO.bgDarker, layer: 3, tags: fade });
      sc.shape(k.t, rowEnd, x, y, roundedRect(w, h, 10), {
        fill: TOKYO.panel,
        line: TOKYO.blue,
        lineWidth: 2,
        layer: 4,
        tags: `${fade}\\3c${colour(TOKYO.orange)}\\t(0,450,\\3c${colour(TOKYO.blue)})`,
      });
      sc.text(k.t, rowEnd, x + w / 2, y + h / 2, escapeText(keyLabel(k.keys)), {
        size,
        colour: TOKYO.fg,
        an: 5,
        layer: 5,
        tags: fade,
        bold: true,
      });
      x += w + space;
    });
  });
}

/** A footage segment: the clip from `from` to `to` (clip time), captions and key chips. */
function footageSegment(
  o: StoryOptions,
  L: Layout,
  s: Shot,
  from: number,
  to: number,
  captions: { t: number; keys: string; comment: string }[],
  zoom: Zoom[] = [],
): Segment {
  const duration = to - from;
  const sc = new Script(L.width, L.height, o.font);
  const f = L.footage;
  // a frame around the footage
  sc.shape(0, duration, f.x - 3, f.y - 3, roundedRect(f.w + 6, f.h + 6, 6), {
    fill: TOKYO.border,
    fillAlpha: 1,
    line: TOKYO.border,
    lineWidth: 2,
    layer: 0,
  });
  const visible = captions.filter((c) => c.t < to);
  visible.forEach((c, i) => {
    const t0 = Math.max(0, c.t - from);
    const t1 = Math.min(duration, (visible[i + 1]?.t ?? to) - from);
    if (t1 > t0 + 0.2) caption(sc, L, t0, t1, c.keys, c.comment);
  });
  const keys = s.keys.filter((k) => k.t >= from && k.t < to).map((k) => ({ t: k.t - from, keys: k.keys }));
  const breaks = s.marks.filter((m) => m.t >= from && m.t < to).map((m) => m.t - from);
  keyChips(sc, o, L, keys, duration, breaks);
  return {
    name: s.name,
    duration,
    bg: TOKYO.bg,
    footage: {
      file: `${o.footageDir}/${s.file}`,
      start: from,
      box: f,
      source: o.manifest.geometry,
      ...(zoom.length ? { zoom: zoom.map((z) => ({ ...z, t: z.t - from })) } : {}),
    },
    script: sc,
  };
}

/** The time of the key `k` that follows a `ctrl+b`, or of the first plain `k`. */
function keyAt(s: Shot, k: string, afterPrefix = false, from = 0): number | undefined {
  return s.keys.find((x, i) => x.t >= from && x.keys === k && (!afterPrefix || s.keys[i - 1]?.keys === "ctrl+b"))?.t;
}

/** Zoom to `z` on a point from `t0` (eased over `ease` s), hold, and back out by `t1`. */
function punchIn(t0: number, t1: number, z: number, x: number, y: number, ease = 0.6): Zoom[] {
  return [
    { t: t0, z: 1, x, y },
    { t: t0 + ease, z, x, y },
    { t: t1 - ease, z, x, y },
    { t: t1, z: 1, x, y },
  ];
}

/** The hints moment of the keys shot: from `f` until the followed page has loaded. */
function hintZoom(s: Shot, z: number): Zoom[] {
  const target = s.points?.["target"];
  const f = keyAt(s, "f");
  const find = s.marks.find((m) => m.name === "find")?.t;
  if (!target || f === undefined || find === undefined) return [];
  // out again shortly after the label's last key: the followed page loads at full size
  const lastLabelKey = s.keys.filter((k) => k.t > f && k.t < find).pop()?.t ?? find;
  return punchIn(f + 0.15, Math.min(find - 0.1, lastLabelKey + 1.0), z, target.x, target.y);
}

/** Lead-in kept before a shot's first event, and the clip's own end. */
function span(s: Shot, lead = 0.9): [number, number] {
  const first = Math.min(...s.keys.map((k) => k.t), ...s.marks.map((m) => m.t));
  return [Math.max(0, first - lead), s.duration];
}

function title1(o: StoryOptions, L: Layout): Segment {
  const d = 5;
  const sc = new Script(L.width, L.height, o.font);
  const box = { x: 260, y: 250, w: 1400, h: 580 };
  terminal(sc, 0, d, box, "zsh — ~", o);
  const size = L.titleSize;
  const x = box.x + 60;
  const done = typed(
    sc,
    o,
    x,
    box.y + 140,
    0.5,
    d,
    [{ text: "~/ $ ", colour: TOKYO.green }],
    "your hands live on the keyboard",
    { size, colour: TOKYO.fg, cps: 17 },
  );
  const rows: [string, string][] = [
    ["nvim", "modal editing"],
    ["tmux", "a prefix for everything"],
    ["hyprland", "tiling, no dragging"],
  ];
  rows.forEach(([tool, what], i) => {
    const t = done + 0.3 + i * 0.35;
    sc.text(t, d, x + 20, box.y + 250 + i * 72, `{\\c${colour(TOKYO.green)}}✓ {\\c${colour(TOKYO.blue)}}${tool.padEnd(10)}{\\c${colour(TOKYO.comment)}}${escapeText(what)}`, {
      size: 40,
      an: 4,
      tags: "\\fad(150,0)",
    });
  });
  return { name: "title", duration: d, bg: TOKYO.bg, script: sc };
}

type Pt = [number, number];
type Seg = { to: Pt; c?: [Pt, Pt] };

/**
 * An open path as an ASS drawing: libass closes every path it strokes, so the path is drawn
 * out and back along itself, which leaves just the line.
 */
function openPath(from: Pt, segs: Seg[]): string {
  const p = (q: Pt) => `${Math.round(q[0])} ${Math.round(q[1])}`;
  const out = [`m ${p(from)}`];
  for (const s of segs) out.push(s.c ? `b ${p(s.c[0])} ${p(s.c[1])} ${p(s.to)}` : `l ${p(s.to)}`);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i] as Seg;
    const back = i === 0 ? from : (segs[i - 1] as Seg).to;
    out.push(s.c ? `b ${p(s.c[1])} ${p(s.c[0])} ${p(back)}` : `l ${p(back)}`);
  }
  return out.join(" ");
}

/** A stroked path (no fill) in canvas coordinates. */
function stroke(sc: Script, start: number, end: number, path: string, c: string, width: number, tags = "", layer = 1): void {
  sc.add({
    start,
    end,
    layer,
    text: `{\\an7\\pos(0,0)\\1a&HFF&\\3c${colour(c)}\\bord${width}\\shad0${tags}\\p1}${path}{\\p0}`,
  });
}

/** The dusty mouse: line art in the same palette, a cobweb to its cable, dust drifting off. */
function mouse(sc: Script, start: number, end: number, cx: number, cy: number, scale: number): void {
  const S = (v: number) => Math.round(v * scale);
  const w = S(230);
  const h = S(340);
  const x = cx - w / 2;
  const y = cy - h / 2;
  const top = -170; // the body's top, relative to the centre
  const dust = TOKYO.comment;
  const fade = "\\fad(300,0)";
  const Q = (dx: number, dy: number): Pt => [cx + dx * scale, cy + dy * scale];
  // the cable: up from the top centre, a lazy curve out of the picture
  const cable = openPath(Q(0, top), [
    { c: [Q(0, top - 60), Q(-60, top - 70)], to: Q(-60, top - 130) },
    { c: [Q(-60, top - 170), Q(-20, top - 190)], to: Q(-20, top - 230) },
  ]);
  stroke(sc, start, end, cable, dust, S(5), fade);
  sc.shape(start, end, x, y, roundedRect(w, h, S(110)), { fill: TOKYO.panel, line: dust, lineWidth: S(5), layer: 2, tags: fade });
  // the buttons' seams and the wheel
  sc.shape(start, end, cx - S(2), y, `m 0 0 l ${S(4)} 0 l ${S(4)} ${S(120)} l 0 ${S(120)}`, { fill: dust, layer: 3, tags: fade });
  sc.shape(start, end, x, y + S(118), `m 0 0 l ${w} 0 l ${w} ${S(4)} l 0 ${S(4)}`, { fill: dust, layer: 3, tags: fade });
  sc.shape(start, end, cx - S(14), y + S(36), roundedRect(S(28), S(56), S(14)), { fill: TOKYO.bgDark, line: dust, lineWidth: S(4), layer: 4, tags: fade });
  // a cobweb in the corner between the cable and the left shoulder: threads from a hub to
  // the cable, the body's top and its side, and sagging rings across them
  const hub = [-105, top - 35];
  const anchors = [[-60, top - 125], [-25, top + 2], [-112, top + 70]];
  const at = (a: number[], f: number) => [hub[0]! + ((a[0] ?? 0) - hub[0]!) * f, hub[1]! + ((a[1] ?? 0) - hub[1]!) * f];
  const threads = anchors.map((a) => openPath(Q(hub[0]!, hub[1]!), [{ to: Q(a[0]!, a[1]!) }]));
  const rings: string[] = [];
  for (const f of [0.3, 0.58, 0.85]) {
    for (let i = 0; i < anchors.length - 1; i++) {
      const p0 = at(anchors[i]!, f);
      const p1 = at(anchors[i + 1]!, f);
      const mid = [(p0[0]! + p1[0]!) / 2, (p0[1]! + p1[1]!) / 2];
      const sag = Q(mid[0]! + (hub[0]! - mid[0]!) * 0.25, mid[1]! + (hub[1]! - mid[1]!) * 0.25);
      rings.push(openPath(Q(p0[0]!, p0[1]!), [{ c: [sag, sag], to: Q(p1[0]!, p1[1]!) }]));
    }
  }
  stroke(sc, start + 0.5, end, [...threads, ...rings].join(" "), TOKYO.fgDim, S(1.6), `\\fad(700,0)\\3a&H${alpha(0.45)}&`, 5);
  // dust specks on the body
  const specks: [number, number, number][] = [
    [0.3, 0.25, 4], [0.62, 0.3, 3], [0.45, 0.55, 5], [0.7, 0.62, 3], [0.25, 0.7, 4],
    [0.55, 0.8, 3], [0.38, 0.42, 2], [0.8, 0.45, 3], [0.2, 0.5, 2], [0.6, 0.18, 2],
  ];
  for (const [fx, fy, r] of specks) {
    sc.shape(start + 0.3, end, x + fx * w, y + fy * h, circle(S(r)), {
      fill: TOKYO.fgDim,
      layer: 4,
      tags: `\\fad(400,0)\\1a&H${alpha(0.45)}&`,
    });
  }
  // dust drifting up off it
  for (let i = 0; i < 14; i++) {
    const t0 = start + 0.8 + (i % 7) * 0.45;
    const t1 = Math.min(end, t0 + 2.2);
    const px = x + (((i * 37) % 100) / 100) * w;
    const py = y + (0.15 + ((i * 53) % 60) / 100) * h;
    const dx = ((i % 3) - 1) * S(30);
    sc.add({
      start: t0,
      end: t1,
      layer: 6,
      text: `{\\an7\\move(${Math.round(px)},${Math.round(py)},${Math.round(px + dx)},${Math.round(py - S(160))})\\1c${colour(TOKYO.fgDim)}\\bord0\\shad0\\fad(300,700)\\1a&H${alpha(0.35)}&\\p1}${circle(S(3 + (i % 3)))}{\\p0}`,
    });
  }
}

function title2(o: StoryOptions, L: Layout): Segment {
  const d = 5;
  const sc = new Script(L.width, L.height, o.font);
  const size = L.titleSize;
  const text = "…until the browser wants the mouse.";
  const x = L.width / 2 - textWidth(o, text, size) / 2;
  typed(sc, o, x, 170, 0.3, d, [], text, { size, colour: TOKYO.fg, cps: 20, cursor: false });
  mouse(sc, 1.2, d, L.width / 2, 650, 1.1);
  sc.text(2.4, d, L.width / 2, 900, escapeText("last moved: 1,204 days ago"), {
    size: 30,
    colour: TOKYO.comment,
    an: 5,
    tags: "\\fad(400,0)",
  });
  return { name: "mouse", duration: d, bg: TOKYO.bg, script: sc };
}

function configCard(o: StoryOptions, L: Layout): Segment {
  const d = 4;
  const sc = new Script(L.width, L.height, o.font);
  const box = { x: 260, y: 290, w: 1400, h: 520 };
  sc.text(0.2, d, L.width / 2, 170, escapeText("every key is yours"), {
    size: 64,
    colour: TOKYO.fg,
    an: 5,
    tags: "\\fad(300,0)",
    bold: true,
  });
  terminal(sc, 0, d, box, "~/.config/vimma/config.toml", o);
  const lines: [string, string, string][] = [
    ["keys.prefix", '"ctrl+a"', "the prefix, ctrl+b by default"],
    ["modal.leader", '","', "the leader, space by default"],
    ["keys.toggle_sidebar", '["prefix+b", "<leader>n"]', ""],
  ];
  lines.forEach(([k, v, comment], i) => {
    const t = 0.6 + i * 0.55;
    const y = box.y + 130 + i * 90;
    sc.text(t, d, box.x + 60, y, `{\\c${colour(TOKYO.blue)}}${escapeText(k)} {\\c${colour(TOKYO.fg)}}= {\\c${colour(TOKYO.green)}}${escapeText(v)}`, {
      size: 40,
      an: 4,
      tags: "\\fad(150,0)",
    });
    if (comment) {
      sc.text(t + 0.2, d, box.x + 60, y + 40, `{\\c${colour(TOKYO.comment)}}# ${escapeText(comment)}`, {
        size: 28,
        an: 4,
        tags: "\\fad(150,0)",
      });
    }
  });
  sc.text(2.4, d, box.x + 60, box.y + box.h - 60, `{\\c${colour(TOKYO.comment)}}# save: it applies within 2 seconds, no restart`, {
    size: 30,
    an: 4,
    tags: "\\fad(200,0)",
  });
  return { name: "config", duration: d, bg: TOKYO.bg, script: sc };
}

function outro(o: StoryOptions, L: Layout, d: number): Segment {
  const sc = new Script(L.width, L.height, o.font);
  const w = Math.round(L.width * (L.width === 1920 ? 0.62 : 0.9));
  const h = Math.round((w * 576) / 1776);
  const box = { x: Math.round((L.width - w) / 2), y: Math.round(L.height * 0.42 - h / 2), w, h };
  const below = box.y + h + (L.width === 1920 ? 90 : 110);
  sc.text(1.0, d, L.width / 2, below, `{\\c${colour(TOKYO.vimma)}}vimma.dev`, {
    size: L.width === 1920 ? 72 : 76,
    an: 5,
    bold: true,
    tags: "\\fad(400,0)",
  });
  sc.text(1.5, d, L.width / 2, below + (L.width === 1920 ? 80 : 90), escapeText("a keyboard-first browser, built on Firefox"), {
    size: L.width === 1920 ? 34 : 34,
    colour: TOKYO.comment,
    an: 5,
    tags: "\\fad(400,0)",
  });
  return {
    name: "outro",
    duration: d,
    bg: OUTRO_BG,
    image: { file: `${o.vimma}/docs/assets/vimma-logo-wide.jpg`, box, fadeIn: 0.6 },
    script: sc,
  };
}

/** The 16:9 video, about 70 s: the eight storyboard beats. */
export function landscape(o: StoryOptions): Segment[] {
  const L = LANDSCAPE;
  const m = o.manifest;
  const keys = shot(m, "keys");
  const panes = shot(m, "panes");
  const ws = shot(m, "workspaces");
  const theme = shot(m, "theme");
  const help = shot(m, "help");
  const [k0, k1] = span(keys);
  const [p0, p1] = span(panes);
  const [w0, w1] = span(ws, 1.2);
  const [t0, t1] = span(theme, 1.2);
  const [h0, h1] = span(help);
  const themeCaptions = theme.marks
    .filter((x) => x.name.startsWith("theme:"))
    .map((x) => ({ t: x.t, keys: `omarchy-theme-set ${x.name.slice(6)}`, comment: "Vimma recolours live" }));
  return [
    title1(o, L),
    title2(o, L),
    footageSegment(o, L, keys, k0, k1, [
      { t: k0, keys: "j  k", comment: "scroll, like a pager" },
      { t: mark(keys, "hints") - 0.2, keys: "f", comment: "a label on every link: type it to follow" },
      { t: mark(keys, "find") - 0.2, keys: "/", comment: "search as you type, with a match count" },
    ], hintZoom(keys, 1.9)),
    footageSegment(o, L, panes, p0, p1, paneCaptions(panes, p0)),
    footageSegment(o, L, ws, w0, w1, [
      { t: w0, keys: "ctrl+b )  ctrl+b (", comment: "workspaces: separate cookies, separate logins" },
    ]),
    footageSegment(o, L, theme, t0, t1, [
      { t: t0, keys: "vimma", comment: "colours from your Omarchy theme" },
      ...themeCaptions,
    ]),
    footageSegment(
      o,
      L,
      help,
      h0,
      h1,
      [{ t: h0, keys: "ctrl+b ?", comment: "every binding, one key away (filter with /)" }],
      helpZoom(help, o.manifest.geometry),
    ),
    configCard(o, L),
    outro(o, L, 5),
  ];
}

/** Into the bindings overlay's list once the filter is typed. */
function helpZoom(s: Shot, g: { width: number; height: number }): Zoom[] {
  const slash = keyAt(s, "/");
  if (slash === undefined) return [];
  return punchIn(slash - 0.1, s.duration + 1, 1.55, g.width * 0.47, g.height * 0.36);
}

function paneCaptions(s: Shot, start: number): { t: number; keys: string; comment: string }[] {
  // captions change with the prefix keys: v, h, z
  const after = (k: string) => s.keys.find((x, i) => x.keys === k && s.keys[i - 1]?.keys === "ctrl+b")?.t;
  const v = after("v") ?? start;
  const h = after("h");
  const z = after("z");
  const out = [{ t: start, keys: "ctrl+b v", comment: "split the window, as in tmux" }];
  if (h !== undefined) out.push({ t: h - 0.6, keys: "ctrl+b h  ctrl+b l", comment: "move between panes" });
  if (z !== undefined) out.push({ t: z - 0.6, keys: "ctrl+b z", comment: "zoom a pane, and back" });
  void v;
  return out;
}

/** The 9:16 cut, about 30 s: link hints and find, panes, the live theme, the outro. */
export function portrait(o: StoryOptions): Segment[] {
  const L = PORTRAIT;
  const m = o.manifest;
  const keys = shot(m, "keys");
  const panes = shot(m, "panes");
  const theme = shot(m, "theme");
  const k0 = Math.max(0, mark(keys, "hints") - 1.0);
  const [, k1] = span(keys);
  const [p0, p1] = span(panes);
  const [t0, t1] = span(theme, 1.0);
  const themeCaptions = theme.marks
    .filter((x) => x.name.startsWith("theme:"))
    .map((x) => ({ t: x.t, keys: `omarchy-theme-set ${x.name.slice(6)}`, comment: "Vimma recolours live" }));
  return [
    footageSegment(o, L, keys, k0, k1, [
      { t: k0, keys: "f", comment: "a label on every link" },
      { t: mark(keys, "find") - 0.2, keys: "/", comment: "search, with a match count" },
    ], hintZoom(keys, 1.7)),
    footageSegment(o, L, panes, p0, p1, paneCaptions(panes, p0)),
    footageSegment(o, L, theme, t0, t1, themeCaptions.length ? [{ t: t0, keys: "vimma", comment: "your Omarchy colours" }, ...themeCaptions] : []),
    outro(o, L, 4),
  ];
}

export const FADE_SECONDS = FADE;
