// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The site's one script, loaded as a module. Everything here is an enhancement: every page reads
// and works without it. It adds Vim-style keys (j k d u gg G / ? [ ] g h g d g k g i g a), the ?
// help overlay (the site's keys, then every Vimma binding, loaded on first open), the keys filter
// and the docs search. There is no status bar of its own:
// viewed in Vimma, a second one at the foot of the window would be confusing.

// It imports nothing; this keeps it a module, so its top-level names stay out of the global scope.
export {};

const root = document.documentElement;
const ROOT = root.dataset["root"] ?? "./";
const PAGES: Record<string, string> = { h: "", d: "docs/", k: "keys/", i: "install/", a: "about/" };
const KEYS_PREF = "vimma-site:keys";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

root.classList.add("js");
for (const el of document.querySelectorAll<HTMLElement>("[data-js-only]")) el.hidden = false;

// --- preferences: single-key shortcuts can be turned off (WCAG 2.1.4) --------------------------

function keysEnabled(): boolean {
  try {
    return localStorage.getItem(KEYS_PREF) !== "off";
  } catch {
    return true;
  }
}

function setKeysEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEYS_PREF);
    else localStorage.setItem(KEYS_PREF, "off");
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  root.classList.toggle("keys-off", !on);
}

root.classList.toggle("keys-off", !keysEnabled());

// --- focus -----------------------------------------------------------------------------------

const help = $<HTMLDialogElement>("#keyhelp");

function isEditable(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(
      el.type,
    );
  }
  return false;
}

// --- the keys filter: the keys page and the overlay's Vimma part --------------------------------

interface Filter {
  apply(): void;
}

/** Filters the [data-search] rows under `scope` by every word typed in `input`. Esc clears it;
 * when it is already empty, Esc leaves the field (keys page) or closes the overlay (dialog). */
function keysFilter(
  input: HTMLInputElement,
  scope: HTMLElement,
  count: HTMLElement | null,
  empty: HTMLElement | null,
  inDialog: boolean,
): Filter {
  const apply = (): void => {
    const rows = [...scope.querySelectorAll<HTMLElement>("[data-search]")];
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of rows) {
      const hit = terms.every((t) => (row.dataset["search"] ?? "").includes(t));
      row.hidden = !hit;
      if (hit) shown++;
    }
    for (const sec of scope.querySelectorAll<HTMLElement>("[data-keys-section]")) {
      sec.hidden = !sec.querySelector("[data-search]:not([hidden])");
    }
    if (count) count.textContent = terms.length ? `${shown} of ${rows.length} actions` : `${rows.length} actions`;
    if (empty) empty.hidden = shown > 0 || rows.length === 0;
  };
  input.addEventListener("input", apply);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (input.value) {
        e.preventDefault(); // in the dialog, this also keeps it open
        input.value = "";
        apply();
      } else if (!inDialog) {
        e.preventDefault();
        input.blur();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
  });
  return { apply };
}

// --- the ? overlay ----------------------------------------------------------------------------

/** assets/js/vimma-keys.js, written by build.ts from data/bindings.json: the keys page's rows.
 * `k` is the keys pressed one after the other, `m` the mode a binding is limited to. */
interface OverlayKeys {
  commit: string;
  sections: { title: string; rows: { action: string; name: string; keys: { k: string[]; m?: string }[] }[] }[];
}

const helpBody = help?.querySelector<HTMLElement>(".keyhelp-body") ?? null;
const helpFilterBox = $<HTMLInputElement>("#keyhelp-filter");
const helpList = $("#keyhelp-list");
const helpFilter =
  helpFilterBox && helpList
    ? keysFilter(helpFilterBox, helpList, $("#keyhelp-count"), $("#keyhelp-empty"), true)
    : null;
let vimmaKeys: Promise<void> | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The same rows as the keys page's tables (scripts/keys-html.ts); keep the two alike. */
function renderVimmaKeys(data: OverlayKeys, into: HTMLElement): void {
  const out: HTMLElement[] = [];
  for (const s of data.sections) {
    const id = `keyhelp-k-${slug(s.title)}`;
    const section = el("section", "keys-section");
    section.dataset["keysSection"] = "";
    section.setAttribute("aria-labelledby", id);
    const h = el("h4", undefined, `${s.title} `);
    h.id = id;
    h.append(el("span", "n", `(${s.rows.length})`));
    const head = el("tr");
    for (const t of ["Action", "Keys", "Name"]) {
      const th = el("th", undefined, t);
      th.scope = "col";
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    const body = el("tbody");
    for (const r of s.rows) {
      const tr = el("tr");
      tr.dataset["search"] = [
        s.title,
        r.action,
        r.name,
        r.name.replace(/_/g, " "),
        ...r.keys.map((b) => `${b.k.join(" ")} ${b.m ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      const keys = el("span", "bindings");
      for (const b of r.keys) {
        const binding = el("span", "binding");
        b.k.forEach((c, i) => {
          if (i) binding.append(" ");
          binding.append(el("kbd", undefined, c));
        });
        if (b.m) binding.append(el("span", "mode", b.m));
        keys.append(binding);
      }
      if (!r.keys.length) keys.append(el("span", "nokey", "no default key"));
      const keysCell = el("td");
      keysCell.append(keys);
      const nameCell = el("td");
      nameCell.append(el("code", "name", r.name));
      tr.append(el("td", undefined, r.action), keysCell, nameCell);
      body.append(tr);
    }
    const table = el("table", "keys-table");
    table.append(thead, body);
    section.append(h, table);
    out.push(section);
  }
  into.replaceChildren(...out);
}

function loadVimmaKeys(): Promise<void> {
  // relative to this module (assets/js/), not to the page
  const url = "./vimma-keys.js";
  return (vimmaKeys ??= import(url)
    .then((m: { default: OverlayKeys }) => {
      if (helpList) renderVimmaKeys(m.default, helpList);
      helpFilter?.apply();
    })
    .catch(() => {
      vimmaKeys = null; // try again on the next open
      helpList?.replaceChildren(el("p", "muted", "Could not load the list; the keys page has it."));
    }));
}

function openHelp(): void {
  if (!help || help.open) return;
  help.showModal();
  if (helpBody) helpBody.scrollTop = 0;
  void loadVimmaKeys();
}

/** A key while the overlay is open: q and ? close it, / filters, j k d u gg G scroll it. The
 * filter field types as usual. Returns whether the key was used. */
function helpKey(e: KeyboardEvent): boolean {
  if (!help || !helpBody || isEditable(e.target as Element | null)) return false;
  const key = e.key;
  if (pending === "g") {
    clearPending();
    if (key !== "g") return false;
    helpBody.scrollTo({ top: 0 });
    return true;
  }
  switch (key) {
    case "?":
    case "q":
      help.close();
      return true;
    case "/":
      helpFilterBox?.focus();
      helpFilterBox?.select();
      return true;
    case "j":
    case "k":
      helpBody.scrollBy({ top: key === "j" ? 64 : -64 });
      return true;
    case "d":
    case "u":
      helpBody.scrollBy({ top: ((key === "d" ? 1 : -1) * helpBody.clientHeight) / 2 });
      return true;
    case "G":
      helpBody.scrollTo({ top: helpBody.scrollHeight });
      return true;
    case "g":
      pending = "g";
      pendingTimer = window.setTimeout(clearPending, 1500);
      return true;
    default:
      return false;
  }
}

if (help) {
  // A click on the backdrop (outside the box) closes it, as Esc does.
  help.addEventListener("click", (e) => {
    if (e.target === help) help.close();
  });
  const toggle = help.querySelector<HTMLInputElement>("#keys-toggle");
  if (toggle) {
    toggle.checked = keysEnabled();
    toggle.addEventListener("change", () => setKeysEnabled(toggle.checked));
  }
}
for (const btn of document.querySelectorAll<HTMLElement>("[data-open-help]")) {
  btn.addEventListener("click", openHelp);
}
for (const btn of document.querySelectorAll<HTMLElement>("[data-close-help]")) {
  btn.addEventListener("click", () => help?.close());
}

// --- keys -------------------------------------------------------------------------------------

let pending = "";
let pendingTimer = 0;

function clearPending(): void {
  pending = "";
  window.clearTimeout(pendingTimer);
}

function scrollByPx(top: number, smooth: boolean): void {
  window.scrollBy({ top, behavior: smooth && !reducedMotion.matches ? "smooth" : "auto" });
}

function go(page: string): void {
  window.location.href = ROOT + page;
}

const filter = $<HTMLInputElement>("#filter");

function focusFilter(): boolean {
  const box = filter ?? $<HTMLInputElement>("#docsearch");
  if (!box) return false;
  box.focus();
  box.select();
  return true;
}

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (help?.open) {
    if (helpKey(e)) e.preventDefault();
    return;
  }
  if (isEditable(e.target as Element | null)) return;
  if (!keysEnabled()) {
    // The one key kept: ? still opens the overlay, where the keys can be turned back on.
    if (e.key === "?") {
      e.preventDefault();
      openHelp();
    }
    return;
  }

  const key = e.key;
  if (pending === "g") {
    clearPending();
    const page = PAGES[key];
    if (key === "g") scrollByPx(-root.scrollHeight, true);
    else if (page !== undefined) go(page);
    else return;
    e.preventDefault();
    return;
  }

  const line = 64;
  switch (key) {
    case "j":
      scrollByPx(line, false);
      break;
    case "k":
      scrollByPx(-line, false);
      break;
    case "d":
      scrollByPx(window.innerHeight / 2, true);
      break;
    case "u":
      scrollByPx(-window.innerHeight / 2, true);
      break;
    case "G":
      scrollByPx(root.scrollHeight, true);
      break;
    case "g":
      pending = "g";
      pendingTimer = window.setTimeout(clearPending, 1500);
      break;
    case "/":
      if (!focusFilter()) go(`${PAGES["k"]}#filter`);
      break;
    case "]":
    case "[": {
      const a = $<HTMLAnchorElement>(`.pager a[rel="${key === "]" ? "next" : "prev"}"]`);
      if (!a) return;
      window.location.href = a.href;
      break;
    }
    case "?":
      openHelp();
      break;
    case "Escape":
      clearPending();
      return;
    default:
      return;
  }
  e.preventDefault();
});

// --- keys page: the filter --------------------------------------------------------------------

const mainEl = $("main");
if (filter && mainEl) {
  // the overlay's rows sit outside <main>, so the two filters never see each other's
  keysFilter(filter, mainEl, $("#filter-count"), $("#filter-empty"), false).apply();
  if (window.location.hash === "#filter") focusFilter();
}

// --- docs: the sidebar and the search ----------------------------------------------------------

const pagesBox = $<HTMLDetailsElement>(".docs-pages");
if (window.matchMedia("(max-width: 900px)").matches) {
  // on phones the page list and the contents start folded, so the page itself comes first
  if (pagesBox) pagesBox.open = false;
  const tocBox = $<HTMLDetailsElement>(".toc details");
  if (tocBox) tocBox.open = false;
}

interface SearchEntry {
  p: string;
  h: string;
  u: string;
  s: string;
  w: string;
}

/** docs-index.js as docs.ts packs it: each page's title and path once, each entry an array. */
interface PackedIndex {
  pages: [string, string][];
  entries: [number, string, string, string, string][];
}

const search = $<HTMLInputElement>("#docsearch");
const results = $<HTMLOListElement>("#docsearch-results");
const status = $("#docsearch-status");

if (search && results && status) {
  let index: SearchEntry[] | null = null;
  let loading: Promise<void> | null = null;

  const load = (): Promise<void> =>
    (loading ??= import(`${ROOT}assets/js/docs-index.js`).then((m: { default: PackedIndex }) => {
      const { pages, entries } = m.default;
      index = entries.map(([i, h, hash, s, w]) => {
        const [p, path] = pages[i] ?? ["", ""];
        return { p, h, u: path + hash, s, w };
      });
    }));

  const score = (e: SearchEntry, terms: string[]): number => {
    let n = 0;
    // the index leaves the title's, heading's and snippet's words out of w (docs.ts), so they
    // are matched here; the snippet is split into words as docs.ts splits it
    const snippet = e.s.replace(/…$/, "").toLowerCase().split(/[\s,;()"“”'’!?]+|\.(?=\s|$)/).join(" ");
    const head = `${e.p} ${e.h}`.toLowerCase();
    for (const t of terms) {
      const inHead = head.includes(t);
      if (!inHead && !e.w.includes(t) && !snippet.includes(t)) return 0;
      n += 1;
      if (inHead) n += 4;
      if (` ${e.w} ${snippet} ${head} `.includes(` ${t} `)) n += 1;
    }
    return n;
  };

  const run = (): void => {
    const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    results.replaceChildren();
    if (!terms.length || !index) {
      results.hidden = true;
      status.textContent = "";
      return;
    }
    const hits = index
      .map((e) => [e, score(e, terms)] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    for (const [e] of hits) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `${ROOT}docs/${e.u}`;
      const where = document.createElement("span");
      where.className = "where";
      where.textContent = e.h ? `${e.p} ›` : "";
      const head = document.createElement("span");
      head.className = "head";
      head.textContent = e.h || e.p;
      const snip = document.createElement("span");
      snip.className = "snip";
      snip.textContent = e.s;
      a.append(where, head, snip);
      li.append(a);
      results.append(li);
    }
    results.hidden = hits.length === 0;
    status.textContent = hits.length ? `${hits.length}${hits.length === 12 ? "+" : ""} matches` : "no matches";
  };

  search.addEventListener("focus", () => void load().then(run));
  search.addEventListener("input", () => void load().then(run));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (search.value) {
        search.value = "";
        run();
      } else search.blur();
    } else if (e.key === "Enter") {
      const first = results.querySelector("a");
      if (first) {
        e.preventDefault();
        first.click();
      }
    } else if (e.key === "ArrowDown") {
      const first = results.querySelector("a");
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  results.addEventListener("keydown", (e) => {
    const links = [...results.querySelectorAll("a")];
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = links[i + (e.key === "ArrowDown" ? 1 : -1)];
      (next ?? search).focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      search.focus();
    }
  });
}
