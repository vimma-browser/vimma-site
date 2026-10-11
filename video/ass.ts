// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// A tiny writer for ASS subtitle scripts, which ffmpeg's `ass` filter (libass) draws onto the
// video: every title, caption, key chip and the mouse drawing in the promo is one of these
// events. Colours are vimma.dev's, sampled from the logo (assets/css/site.css, dark).

export const PALETTE = {
  bg: "#0a0f12",
  bgDark: "#070b0d",
  bgDarker: "#040708",
  bgLight: "#111a1b",
  selection: "#163327",
  border: "#2a3d36",
  fg: "#c4cec8",
  fgMuted: "#849690",
  fgBright: "#fcfbf7",
  mint: "#1bf587",
  mintShade: "#2ba564",
  green: "#8eeeb8",
  yellow: "#f2c94c",
  red: "#ff6b6b",
} as const;

/** `#rrggbb` → ASS `&HBBGGRR&` (ASS colours are blue-green-red). */
export function colour(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return `&H${m[3]}${m[2]}${m[1]}&`.toUpperCase();
}

/** Seconds → ASS time, H:MM:SS.cc. */
export function time(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

/** Text for an ASS event: braces would start an override block, backslashes an escape. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, "⧵").replace(/\{/g, "｛").replace(/\}/g, "｝");
}

/** A rounded rectangle as an ASS drawing (`\p1`), origin at its top left. */
export function roundedRect(w: number, h: number, r: number): string {
  const k = Math.round(r * 0.4477); // control-point offset for a quarter circle
  const R = Math.round;
  return [
    `m ${R(r)} 0 l ${R(w - r)} 0`,
    `b ${R(w - r + (r - k))} 0 ${R(w)} ${R(k)} ${R(w)} ${R(r)}`,
    `l ${R(w)} ${R(h - r)}`,
    `b ${R(w)} ${R(h - k)} ${R(w - k)} ${R(h)} ${R(w - r)} ${R(h)}`,
    `l ${R(r)} ${R(h)}`,
    `b ${R(k)} ${R(h)} 0 ${R(h - k)} 0 ${R(h - r)}`,
    `l 0 ${R(r)}`,
    `b 0 ${R(k)} ${R(k)} 0 ${R(r)} 0`,
  ].join(" ");
}

/** A circle of radius `r` as an ASS drawing, centred on (r, r). */
export function circle(r: number): string {
  return roundedRect(2 * r, 2 * r, r);
}

export interface Event {
  start: number;
  end: number;
  layer?: number;
  /** override tags and text, already escaped where needed */
  text: string;
}

/** An ASS script: the canvas size, one monospace style, and events. */
export class Script {
  readonly events: Event[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly font: string,
  ) {}

  add(event: Event): this {
    if (event.end > event.start) this.events.push(event);
    return this;
  }

  /**
   * Text at a point. `an` is the numpad alignment of the point (7 top left, 5 centre).
   * `tags` are extra override tags, e.g. `\\fad(200,200)`.
   */
  text(
    start: number,
    end: number,
    x: number,
    y: number,
    text: string,
    o: { size?: number; colour?: string; an?: number; tags?: string; layer?: number; bold?: boolean } = {},
  ): this {
    const tags = [
      `\\an${o.an ?? 7}`,
      `\\pos(${Math.round(x)},${Math.round(y)})`,
      `\\fs${o.size ?? 40}`,
      `\\c${colour(o.colour ?? PALETTE.fg)}`,
      o.bold ? "\\b1" : "",
      o.tags ?? "",
    ].join("");
    return this.add({ start, end, layer: o.layer ?? 2, text: `{${tags}}${text}` });
  }

  /** A filled shape (an ASS drawing) with its top left at (x, y); optional outline. */
  shape(
    start: number,
    end: number,
    x: number,
    y: number,
    drawing: string,
    o: { fill?: string; fillAlpha?: number; line?: string; lineWidth?: number; tags?: string; layer?: number } = {},
  ): this {
    const tags = [
      "\\an7",
      `\\pos(${Math.round(x)},${Math.round(y)})`,
      `\\1c${colour(o.fill ?? PALETTE.bgLight)}`,
      `\\1a&H${alpha(o.fillAlpha ?? 0)}&`,
      `\\3c${colour(o.line ?? PALETTE.border)}`,
      `\\bord${o.lineWidth ?? 0}`,
      "\\shad0",
      o.tags ?? "",
      "\\p1",
    ].join("");
    return this.add({ start, end, layer: o.layer ?? 1, text: `{${tags}}${drawing}{\\p0}` });
  }

  toString(): string {
    const lines = [
      "[Script Info]",
      "ScriptType: v4.00+",
      `PlayResX: ${this.width}`,
      `PlayResY: ${this.height}`,
      "WrapStyle: 2",
      "ScaledBorderAndShadow: yes",
      "YCbCr Matrix: TV.709",
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      `Style: Mono,${this.font},40,&H00C8CEC4,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      ...[...this.events]
        .sort((a, b) => a.start - b.start)
        .map((e) => `Dialogue: ${e.layer ?? 0},${time(e.start)},${time(e.end)},Mono,,0,0,0,,${e.text}`),
    ];
    return `${lines.join("\n")}\n`;
  }
}

/** 0 (opaque) to 1 (transparent) → an ASS alpha byte. */
export function alpha(transparency: number): string {
  return Math.round(Math.min(1, Math.max(0, transparency)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}
