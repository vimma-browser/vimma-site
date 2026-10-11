// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// A small Markdown reader for Vimma's own docs, and nothing else: the subset guide.md and
// limits.md use (ATX headings, paragraphs, nested lists, pipe tables, fenced code, `code`,
// **bold**, _em_, [links](…)). Zero dependencies. Unknown syntax comes out as text, escaped.

import { escapeHtml } from "../src/ts/html.js";

/** A heading and everything under it, down to the next heading of its level or higher. */
export interface MdSection {
  level: number;
  title: string;
  id: string;
  /** Lines between the heading and its first child heading. */
  body: string[];
  children: MdSection[];
}

/** GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

const FENCE = /^\s*```/;

/** Splits a document into its heading tree. Text before the first heading is the root's body. */
export function parseSections(md: string): MdSection {
  const root: MdSection = { level: 0, title: "", id: "", body: [], children: [] };
  const stack: MdSection[] = [root];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    const h = inFence ? null : /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (h?.[1] && h[2] !== undefined) {
      const level = h[1].length;
      while ((stack[stack.length - 1]?.level ?? 0) >= level) stack.pop();
      const sec: MdSection = { level, title: h[2], id: slugify(h[2]), body: [], children: [] };
      stack[stack.length - 1]?.children.push(sec);
      stack.push(sec);
      continue;
    }
    stack[stack.length - 1]?.body.push(line);
  }
  return root;
}

export function findSection(root: MdSection, title: string): MdSection | undefined {
  for (const c of root.children) {
    if (c.title === title) return c;
    const deep = findSection(c, title);
    if (deep) return deep;
  }
  return undefined;
}

// --- inline -----------------------------------------------------------------------------------

export interface RenderOptions {
  /** Turns a Markdown link target into an href, or null to keep only the link text. */
  link: (href: string) => string | null;
}

function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(“"])_([^_\s][^_]*?)_(?=[\s.,;:)!?”"]|$)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s.,;:)!?]|$)/g, "$1<em>$2</em>");
}

const INLINE = /(`+)([\s\S]*?)\1|\[((?:[^\]`]|`[^`]*`)+)\]\(([^)\s]+)\)/g;

export function inline(text: string, opts: RenderOptions): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += emphasis(escapeHtml(text.slice(last, m.index)));
    if (m[1] !== undefined) {
      out += `<code>${escapeHtml((m[2] ?? "").trim())}</code>`;
    } else {
      const label = inline(m[3] ?? "", opts);
      const href = opts.link(m[4] ?? "");
      out +=
        href === null
          ? `<span class="ref" title="not on this site">${label}</span>`
          : `<a href="${escapeHtml(href)}">${label}</a>`;
    }
    last = (m.index ?? 0) + m[0].length;
  }
  return out + emphasis(escapeHtml(text.slice(last)));
}

// --- blocks -----------------------------------------------------------------------------------

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+/;
const isTableLine = (l: string): boolean => /^\s*\|/.test(l);
const isSeparator = (l: string): boolean => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
const indentOf = (l: string): number => /^\s*/.exec(l)?.[0].length ?? 0;

function cells(line: string): string[] {
  // split on | outside code spans (a cell may hold `a | b`)
  const out: string[] = [];
  let cur = "";
  let inCode = false;
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (const ch of body) {
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function renderTable(lines: string[], opts: RenderOptions): string {
  const [first, second] = lines;
  const hasHead = second !== undefined && isSeparator(second);
  const head = hasHead && first ? cells(first) : null;
  const rows = (hasHead ? lines.slice(2) : lines).filter((l) => !isSeparator(l)).map(cells);
  const th = head ? `<thead><tr>${head.map((c) => `<th scope="col">${inline(c, opts)}</th>`).join("")}</tr></thead>` : "";
  const tb = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, opts)}</td>`).join("")}</tr>`).join("\n");
  return `<div class="table-wrap"><table class="plain">${th}<tbody>\n${tb}\n</tbody></table></div>`;
}

/** Renders block Markdown. `shift` is added to heading levels. */
export function renderBlocks(lines: string[], opts: RenderOptions, shift = 0): string {
  const out: string[] = [];
  let i = 0;
  const at = (k: number): string => lines[k] ?? "";
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      const pad = indentOf(line);
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(at(i))) code.push(at(i++).slice(pad));
      i++;
      const cls = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
      out.push(`<pre class="code"${cls}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (h?.[1] && h[2] !== undefined) {
      const lvl = Math.min(6, h[1].length + shift);
      out.push(`<h${lvl} id="${slugify(h[2])}">${inline(h[2], opts)}</h${lvl}>`);
      i++;
      continue;
    }
    if (isTableLine(line)) {
      const tbl: string[] = [];
      while (i < lines.length && isTableLine(at(i))) tbl.push(at(i++));
      // Rows after one blank line, without a header of their own, continue the table.
      while (at(i).trim() === "" && isTableLine(at(i + 1)) && !isSeparator(at(i + 2))) {
        i++;
        while (i < lines.length && isTableLine(at(i))) tbl.push(at(i++));
      }
      out.push(renderTable(tbl, opts));
      continue;
    }
    const li = LIST_ITEM.exec(line);
    if (li) {
      const base = (li[1] ?? "").length;
      const ordered = /\d/.test(li[2] ?? "");
      const items: string[][] = [];
      let loose = false;
      while (i < lines.length) {
        const m = LIST_ITEM.exec(at(i));
        if (!m || (m[1] ?? "").length !== base) break;
        const contentIndent = m[0].length;
        const item = [at(i).slice(contentIndent)];
        i++;
        while (i < lines.length) {
          const l = at(i);
          if (l.trim() === "") {
            // a blank line continues the item only if indented content follows
            if (indentOf(at(i + 1)) >= contentIndent && at(i + 1).trim() !== "") {
              item.push("");
              loose = true;
              i++;
              continue;
            }
            break;
          }
          const mm = LIST_ITEM.exec(l);
          if (mm && (mm[1] ?? "").length <= base) break;
          if (indentOf(l) < base + 1 && (FENCE.test(l) || isTableLine(l) || /^#/.test(l))) break;
          item.push(indentOf(l) >= contentIndent ? l.slice(contentIndent) : l.trimStart());
          i++;
        }
        items.push(item);
      }
      const tag = ordered ? "ol" : "ul";
      const body = items
        .map((it) => {
          const simple = !loose && !it.some((l) => LIST_ITEM.test(l) || FENCE.test(l));
          return `<li>${simple ? inline(it.join(" ").trim(), opts) : renderBlocks(it, opts, shift)}</li>`;
        })
        .join("\n");
      out.push(`<${tag}>\n${body}\n</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = at(i);
      if (l.trim() === "" || FENCE.test(l) || isTableLine(l) || /^#{1,6}\s/.test(l) || LIST_ITEM.test(l)) break;
      para.push(l.trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "), opts)}</p>`);
  }
  return out.join("\n");
}

/** Splits body lines into top-level blocks (paragraphs, lists, tables, code) as raw lines. */
export function rawBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let cur: string[] = [];
  let inFence = false;
  for (const l of lines) {
    if (FENCE.test(l)) inFence = !inFence;
    if (!inFence && l.trim() === "") {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** Renders a section with its children, its heading at level `top`, skipping excluded titles. */
export function renderSection(
  sec: MdSection,
  opts: RenderOptions,
  top: number,
  exclude: readonly string[] = [],
  withChildren = true,
): string {
  const shift = top - sec.level;
  const head = `<h${top} id="${sec.id}">${inline(sec.title, opts)}</h${top}>`;
  const kids = withChildren
    ? sec.children
        .filter((c) => !exclude.includes(c.title))
        .map((c) => renderSection(c, opts, c.level + shift, exclude))
    : [];
  return [head, renderBlocks(sec.body, opts, shift), ...kids].join("\n");
}

/** Every heading id a section renders, children included. */
export function sectionIds(sec: MdSection, exclude: readonly string[] = [], withChildren = true): string[] {
  if (!withChildren) return [sec.id];
  return [sec.id, ...sec.children.filter((c) => !exclude.includes(c.title)).flatMap((c) => sectionIds(c, exclude))];
}
