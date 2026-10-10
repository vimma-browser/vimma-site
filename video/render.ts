// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The promo video, from scratch: records fresh footage of a real Vimma build with that
// checkout's tools/promo/record.mjs (Xvfb, vimma-ctl, ffmpeg x11grab), then composites it with
// ffmpeg and libass: titles, captions, key chips and the outro, as story.ts lays them out.
//
//   npm run video -- ../vimma                    # record and render both cuts
//   npm run video -- ../vimma --audio song.mp3   # mix in music, faded out at the end
//   npm run video -- ../vimma --reuse-footage    # render again from the last recording
//   npm run video -- ../vimma --pace 800         # slower keys (ms per beat; default 700)
//
// Writes video/out/vimma-promo-1080p.mp4 (16:9) and video/out/vimma-promo-vertical.mp4 (9:16),
// and copies them to ~/Videos/vimma/ (--copy-to DIR, or --copy-to "" for none). Needs the
// checkout's build and vimma-ctl, Xvfb, ffmpeg (x11grab, libx264, libass), fontconfig and
// ImageMagick. No npm dependencies.

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FADE_SECONDS, type Manifest, type Segment, type Zoom, landscape, portrait } from "./story.js";

const ROOT = resolve(import.meta.dirname, "../..");
const VIDEO = join(ROOT, "video");
const FPS = 30;
/** Monospace fonts to try, best first; the first one fontconfig has is used. */
const FONTS = ["JetBrains Mono", "JetBrainsMono Nerd Font", "DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono"];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    audio: { type: "string" },
    "reuse-footage": { type: "boolean", default: false },
    pace: { type: "string", default: "700" },
    out: { type: "string", default: join(VIDEO, "out") },
    "copy-to": { type: "string", default: join(homedir(), "Videos/vimma") },
    only: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

function usage(message: string): never {
  console.error(`video: ${message}\nusage: npm run video -- path/to/vimma [--audio song.mp3] [--reuse-footage] [--pace ms]`);
  process.exit(2);
}

function run(cmd: string, args: string[], opts: { cwd?: string; quiet?: boolean } = {}): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? ROOT,
      stdio: ["ignore", "pipe", opts.quiet === false ? "inherit" : "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => {
      out += d;
      if (opts.quiet === false) process.stdout.write(d);
    });
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0 ? done(out) : fail(new Error(`${cmd} ${args.slice(0, 3).join(" ")}… failed (${code}): ${err.trim().slice(-2000)}`)),
    );
  });
}

async function pickFont(): Promise<string> {
  const families = (await run("fc-list", [":", "family"])).split("\n").flatMap((l) => l.split(","));
  const font = FONTS.find((f) => families.includes(f));
  if (!font) throw new Error(`none of these fonts is installed: ${FONTS.join(", ")}`);
  return font;
}

/**
 * The font's advance per unit of ASS font size, measured with libass itself: render 10 and 30
 * zeros, the difference in inked width over 20 characters.
 */
async function measureAdvance(font: string, work: string): Promise<number> {
  const widths: number[] = [];
  for (const n of [10, 30]) {
    const ass = join(work, `measure-${n}.ass`);
    writeFileSync(
      ass,
      [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 4000",
        "PlayResY: 200",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        `Style: M,${font},100,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        `Dialogue: 0,0:00:00.00,0:00:01.00,M,,0,0,0,,{\\pos(20,20)}${"0".repeat(n)}`,
        "",
      ].join("\n"),
    );
    const png = join(work, `measure-${n}.png`);
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=4000x200:d=1", "-vf", `ass=${ass}`, "-frames:v", "1", png]);
    widths.push(Number(await run("magick", [png, "-trim", "-format", "%w", "info:"])));
  }
  const [a, b] = widths as [number, number];
  const advance = (b - a) / 20 / 100;
  if (!(advance > 0.3 && advance < 0.9)) throw new Error(`implausible font advance ${advance} for ${font}`);
  return advance;
}

async function record(vimma: string, dir: string, geometry: string, shots: string | null): Promise<Manifest> {
  rmSync(dir, { recursive: true, force: true });
  const args = ["tools/promo/record.mjs", "--out", dir, "--geometry", geometry, "--pace", values.pace];
  if (shots) args.push("--shots", shots);
  console.log(`video: recording ${geometry}${shots ? ` (${shots})` : ""}`);
  await run("node", args, { cwd: vimma, quiet: false });
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
}

/**
 * An ffmpeg expression in the output frame number `on` that eases (smoothstep) through the
 * keyframes' `field`, holding the first and last values outside them.
 */
function eased(keys: Zoom[], field: "z" | "x" | "y", scale = 1): string {
  const v = (k: Zoom) => (k[field] * scale).toFixed(3);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) throw new Error("no zoom keyframes");
  let expr = v(last);
  for (let i = keys.length - 2; i >= 0; i--) {
    const a = keys[i] as Zoom;
    const b = keys[i + 1] as Zoom;
    const f0 = (a.t * FPS).toFixed(2);
    const f1 = (b.t * FPS).toFixed(2);
    const u = `((on-${f0})/(${f1}-${f0}))`;
    const seg = a[field] === b[field] ? v(a) : `${v(a)}+(${v(b)}-${v(a)})*${u}*${u}*(3-2*${u})`;
    expr = `if(lt(on,${f1}),${seg},${expr})`;
  }
  return `if(lt(on,${(first.t * FPS).toFixed(2)}),${v(first)},${expr})`;
}

/** One segment → an mp4 part: background, footage or image, the ASS overlay, fades. */
async function renderSegment(seg: Segment, size: { width: number; height: number }, file: string, work: string): Promise<void> {
  const ass = `${file}.ass`;
  writeFileSync(ass, seg.script.toString());
  const d = seg.duration.toFixed(3);
  const bg = seg.bg.replace("#", "0x");
  const inputs = ["-f", "lavfi", "-i", `color=c=${bg}:s=${size.width}x${size.height}:r=${FPS}:d=${d}`];
  const filters: string[] = [];
  let last = "[0:v]";
  if (seg.footage) {
    const b = seg.footage.box;
    inputs.push("-ss", seg.footage.start.toFixed(3), "-t", d, "-i", seg.footage.file);
    const zoom = seg.footage.zoom;
    if (zoom?.length) {
      // zoompan crops whole pixels: work at twice the size so the moves stay smooth
      const k = 2;
      const src = seg.footage.source;
      const x = `clip(${eased(zoom, "x", k)}-iw/zoom/2,0,iw-iw/zoom)`;
      const y = `clip(${eased(zoom, "y", k)}-ih/zoom/2,0,ih-ih/zoom)`;
      filters.push(
        `[1:v]fps=${FPS},setpts=PTS-STARTPTS,scale=${src.width * k}:${src.height * k}:flags=bicubic,` +
          `zoompan=z='${eased(zoom, "z")}':x='${x}':y='${y}':d=1:s=${b.w}x${b.h}:fps=${FPS},setsar=1[f]`,
      );
    } else {
      filters.push(`[1:v]fps=${FPS},scale=${b.w}:${b.h}:flags=lanczos,setsar=1,setpts=PTS-STARTPTS[f]`);
    }
    filters.push(`${last}[f]overlay=${b.x}:${b.y}:eof_action=repeat[b]`);
    last = "[b]";
  } else if (seg.image) {
    const b = seg.image.box;
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", d, "-i", seg.image.file);
    filters.push(
      `[1:v]scale=${b.w}:${b.h}:flags=lanczos,setsar=1,format=yuva420p,fade=t=in:st=0.2:d=${seg.image.fadeIn}:alpha=1[i]`,
    );
    filters.push(`${last}[i]overlay=${b.x}:${b.y}[b]`);
    last = "[b]";
  }
  const escaped = ass.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const out = (seg.duration - FADE_SECONDS).toFixed(3);
  filters.push(
    `${last}ass='${escaped}',fade=t=in:st=0:d=${FADE_SECONDS}:color=${bg},fade=t=out:st=${out}:d=${FADE_SECONDS}:color=${bg},format=yuv420p[v]`,
  );
  await run("ffmpeg", [
    "-v", "error", "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    "-t", d,
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    file,
  ]);
  void work;
}

/** Concatenate the parts, add the music (if any) with a fade-out, write a YouTube-ready mp4. */
async function finish(parts: string[], file: string, work: string, name: string): Promise<number> {
  const list = join(work, `${name}-parts.txt`);
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const joined = join(work, `${name}-joined.mp4`);
  await run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  const duration = Number(
    (await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", joined])).trim(),
  );
  const args = ["-v", "error", "-y", "-i", joined];
  if (values.audio) {
    const fade = Math.min(4, duration / 4);
    args.push(
      "-i", values.audio,
      "-filter_complex", `[1:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st=${(duration - fade).toFixed(3)}:d=${fade.toFixed(3)}[a]`,
      "-map", "0:v", "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    );
  } else {
    args.push("-map", "0:v");
  }
  args.push("-c:v", "copy", "-t", duration.toFixed(3), "-movflags", "+faststart", file);
  await run("ffmpeg", args);
  return duration;
}

async function main(): Promise<void> {
  if (values.help) usage("help");
  const vimma = resolve(positionals[0] ?? "../vimma");
  if (!existsSync(join(vimma, "tools/promo/record.mjs"))) {
    usage(`no tools/promo/record.mjs in ${vimma}: pass a vimma checkout that has the promo recorder`);
  }
  if (values.audio && !existsSync(values.audio)) usage(`no audio file at ${values.audio}`);
  const cuts = values.only ? values.only.split(",") : ["landscape", "portrait"];
  const work = join(VIDEO, "work");
  const out = resolve(values.out);
  mkdirSync(work, { recursive: true });
  mkdirSync(out, { recursive: true });

  const font = await pickFont();
  const advance = await measureAdvance(font, work);
  console.log(`video: font ${font} (advance ${advance.toFixed(3)})`);

  const results: string[] = [];
  for (const cut of cuts) {
    const landscapeCut = cut === "landscape";
    if (!landscapeCut && cut !== "portrait") usage(`--only takes landscape and/or portrait, not ${cut}`);
    const footageDir = join(work, landscapeCut ? "footage-16x9" : "footage-9x16");
    const manifest =
      values["reuse-footage"] && existsSync(join(footageDir, "manifest.json"))
        ? (JSON.parse(readFileSync(join(footageDir, "manifest.json"), "utf8")) as Manifest)
        : await record(vimma, footageDir, landscapeCut ? "1920x1080" : "1080x1920", landscapeCut ? null : "keys,panes,theme");
    const story = { font, advance, vimma, footageDir, manifest };
    const segments = landscapeCut ? landscape(story) : portrait(story);
    const size = landscapeCut ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
    const partsDir = join(work, `parts-${cut}`);
    rmSync(partsDir, { recursive: true, force: true });
    mkdirSync(partsDir, { recursive: true });
    const parts: string[] = [];
    for (const [i, seg] of segments.entries()) {
      const file = join(partsDir, `${String(i).padStart(2, "0")}-${seg.name}.mp4`);
      console.log(`video: ${cut} ${seg.name} (${seg.duration.toFixed(1)} s)`);
      await renderSegment(seg, size, file, work);
      parts.push(file);
    }
    const name = landscapeCut ? "vimma-promo-1080p.mp4" : "vimma-promo-vertical.mp4";
    const duration = await finish(parts, join(out, name), work, cut);
    console.log(`video: ${join(out, name)} (${duration.toFixed(1)} s)`);
    results.push(join(out, name));
  }
  const copyTo = values["copy-to"];
  if (copyTo) {
    mkdirSync(copyTo, { recursive: true });
    for (const f of results) copyFileSync(f, join(copyTo, f.split("/").pop() ?? f));
    console.log(`video: copied to ${copyTo}`);
  }
}

main().catch((e: unknown) => {
  console.error(`video: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
