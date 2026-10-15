// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The site's text, its Markdown and its code comments are written for readers who were not part
// of the work: they state what something is and why, never who asked for it, when, quoted chat
// or agent notes. This check (`npm run wording`, and CI) fails on wording that only makes sense
// as a record of that process. It is a port of Vimma's tools/md-wording checks, with the same
// patterns, so both repositories hold their text to one rule.
//
// Prose: the tracked Markdown files and the page sources (src/**/*.html, comments included),
// read a paragraph (a run of non-blank lines) at a time, so a phrase may break across lines. The
// copies of Vimma's guide and limits in data/docs/ are left out: Vimma's own check reads them.
// Comments: `//` and `/* */` (TypeScript, CSS) and `#` (shell, YAML), found by a line scan that
// does not parse strings; a comment block is a run of lines that carry a comment.
//
// A paragraph or comment block that has to name the phrases carries `process-wording: <reason>`
// (in Markdown and HTML as `<!-- process-wording: <reason> -->`). A marker without a reason
// exempts nothing.
//
//   npm run wording                                   every tracked file in scope
//   node .build/scripts/wording.js FILE...            only these

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");

export interface Finding {
  line: number;
  phrase: string;
}

// Each pattern is a plain alternation (no nested quantifiers), matched case-insensitively against
// a paragraph whose lines are joined with a space. They target who asked or decided, the people
// running the work, and session leftovers; the person using Vimma ("waits for the user's
// answer"), Firefox's session and Claude Code as an agent client are product wording and do not
// match.
export const PATTERNS: RegExp[] = [
  // the person who asked for the work, as the source of a decision
  /\buser(?:'s)?\s+(?:request|decision|decided|report|asked|said|wants|wanted|chose|approved|confirmed|words)\b/gi,
  /\bmaintainer(?:'s)?\s+(?:request|decision|decided|asked|said|wants|wanted|chose|approved|confirmed)\b/gi,
  /\b(?:flagged\s+for|asking|not\s+asked\s+of)\s+the\s+user\b/gi,
  /\byou\s+asked\s+for\b/gi,
  // attributions and dates of answers: "(user, 2026-10-11)", "(the maintainer)", "Answered 2026-"
  // (process-wording: quotes what the pattern matches)
  /(?<![\w$])\((?:the\s+)?(?:user|maintainer)(?:[,:)])/gi,
  /\banswered\s+20\d\d-/gi,
  // the agents and sessions that did the work
  /\bcoordinator\b/gi,
  /\bhand-?over\b/gi,
  /\bfirst\s+draft\b(?!\s+release)/gi,
  /claude\.ai\/code\/session/gi,
];

const CODE_PATTERNS: RegExp[] = [
  ...PATTERNS,
  // a review as the source of a reason: "security review of #182", "review, finding 2"
  // (process-wording: quotes what the pattern matches)
  /\b(?:security\s+)?review(?:\s+of\s+(?:PR\s+)?#\d+|,\s+(?:finding\s+\d+|PR\s+#\d+))/gi,
  // a dated answer: "the user (2026-10-12): ..."
  // (process-wording: quotes what the pattern matches)
  /\buser\s+\(20\d\d-/gi,
  // a quoted answer: user: "the keys should ..."
  // (process-wording: quotes what the pattern matches)
  /\buser:\s*["'“‘]/gi,
  // the instructions file for coding agents, not a reason a reader can check
  /\bCLAUDE\.md\b/gi,
];

const PROSE_MARKER = /<!--\s*process-wording:\s*\S[^>]*-->/;
const CODE_MARKER = /\bprocess-wording:\s*\S/;

/**
 * Every match of `patterns` in a paragraph whose lines are joined with a space, reported on the
 * line where it starts.
 */
function matchPatterns(lines: string[], first: number, patterns: RegExp[]): Finding[] {
  const text = lines.join(" ");
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  const lineOf = (index: number): number => {
    let i = 0;
    while (i + 1 < offsets.length && (offsets[i + 1] ?? Infinity) <= index) i++;
    return first + i;
  };
  const hits: { index: number; line: number; phrase: string }[] = [];
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      hits.push({ index: m.index, line: lineOf(m.index), phrase: m[0].replace(/\s+/g, " ") });
    }
  }
  return hits.sort((a, b) => a.index - b.index).map(({ line, phrase }) => ({ line, phrase }));
}

/** Process wording in Markdown or HTML, outside paragraphs exempted by a marker with a reason. */
export function findProcessWording(text: string): Finding[] {
  const found: Finding[] = [];
  const lines = text.split("\n");
  let start = 0;
  while (start < lines.length) {
    let end = start;
    while (end < lines.length && (lines[end] ?? "").trim() !== "") end++;
    const para = lines.slice(start, end);
    if (end > start && !PROSE_MARKER.test(para.join(" "))) found.push(...matchPatterns(para, start + 1, PATTERNS));
    start = end + 1;
  }
  return found;
}

/** How a file writes its comments, by extension; null for a file without comments to read. */
export function commentStyle(path: string): "slash" | "hash" | null {
  if (/\.(?:[cm]?[jt]s|css)$/.test(path)) return "slash";
  if (/\.(?:sh|bash|ya?ml|toml)$/.test(path)) return "hash";
  return null;
}

/** The comment text on each line (null where the line carries none). */
function commentText(src: string, style: "slash" | "hash"): (string | null)[] {
  const lines = src.split("\n");
  if (style === "hash") {
    return lines.map((line) => {
      const m = /(?:^|(?<=\s))#/.exec(line);
      return m ? line.slice(m.index).replace(/^[#!]*/, "") : null;
    });
  }
  let inBlock = false;
  return lines.map((line) => {
    const parts: string[] = [];
    let pos = 0;
    let any = false;
    while (pos <= line.length) {
      if (inBlock) {
        any = true;
        const end = line.indexOf("*/", pos);
        parts.push(line.slice(pos, end < 0 ? line.length : end).replace(/^\s*\*+/, ""));
        if (end < 0) break;
        inBlock = false;
        pos = end + 2;
        continue;
      }
      // a comment starts a line or follows whitespace, so `https://` and `src/**` are not one
      const start = /(?:^|(?<=\s))\/[/*]/g;
      start.lastIndex = pos;
      const m = start.exec(line);
      if (!m) break;
      any = true;
      if (line[m.index + 1] === "/") {
        parts.push(line.slice(m.index + 2).replace(/^[/!]*/, ""));
        break;
      }
      inBlock = true;
      pos = m.index + 2;
    }
    return any ? parts.join(" ") : null;
  });
}

/** Process wording in a source file's comments, outside blocks exempted by a marker with a reason. */
export function findCommentWording(src: string, style: "slash" | "hash"): Finding[] {
  const texts = commentText(src, style);
  const found: Finding[] = [];
  let start = 0;
  while (start < texts.length) {
    if (texts[start] === null) {
      start++;
      continue;
    }
    let end = start;
    while (end < texts.length && texts[end] !== null) end++;
    const block = texts.slice(start, end) as string[];
    if (!CODE_MARKER.test(block.join(" "))) found.push(...matchPatterns(block, start + 1, CODE_PATTERNS));
    start = end;
  }
  return found;
}

/** Synced copies of Vimma's docs, and this check's tests, whose strings quote the phrases. */
const OUT_OF_SCOPE = [/^data\//, /^scripts\/wording\.test\.ts$/];

const isProse = (path: string): boolean => /\.md$/.test(path) || /^src\/.*\.html$/.test(path);

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\0")
    .filter((p) => p && !OUT_OF_SCOPE.some((re) => re.test(p)) && (isProse(p) || commentStyle(p) !== null));
}

function main(): void {
  const args = process.argv.slice(2);
  const paths = args.length > 0 ? args : trackedFiles();
  let problems = 0;
  for (const path of paths) {
    const text = readFileSync(resolve(ROOT, path), "utf8");
    const style = commentStyle(path);
    const found = isProse(path) ? findProcessWording(text) : style ? findCommentWording(text, style) : [];
    for (const { line, phrase } of found) {
      console.error(`${path}:${line}: process wording "${phrase}"`);
      problems++;
    }
  }
  if (problems > 0) {
    console.error(
      `${problems} process wording problem(s). State the decision and its reason instead; see ` +
        "scripts/wording.ts for the marker that exempts a paragraph or comment block.",
    );
    process.exit(1);
  }
  console.log(`✓ wording: ${paths.length} files clean`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
