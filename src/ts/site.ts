// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The site's one script, loaded as a module. Everything here is an enhancement: every page reads
// and works without it. It adds Vim-style keys (j k d u gg G / ? [ ] g h g d g k g i g a), the ?
// help overlay, the keys filter and the docs search. There is no status bar of its own:
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

// --- the ? overlay ----------------------------------------------------------------------------

function openHelp(): void {
  if (!help || help.open) return;
  help.showModal();
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
    if (e.key === "?" || e.key === "q") {
      e.preventDefault();
      help.close();
    }
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

if (filter) {
  const rows = [...document.querySelectorAll<HTMLElement>("[data-search]")];
  const sections = [...document.querySelectorAll<HTMLElement>("[data-keys-section]")];
  const count = $("#filter-count");
  const empty = $("#filter-empty");
  const total = rows.length;

  const apply = (): void => {
    const terms = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of rows) {
      const text = row.dataset["search"] ?? "";
      const hit = terms.every((t) => text.includes(t));
      row.hidden = !hit;
      if (hit) shown++;
    }
    for (const s of sections) {
      s.hidden = !s.querySelector("[data-search]:not([hidden])");
    }
    if (count) {
      count.textContent = terms.length ? `${shown} of ${total} actions` : `${total} actions`;
    }
    if (empty) empty.hidden = shown > 0;
  };

  filter.addEventListener("input", apply);
  filter.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (filter.value) {
        filter.value = "";
        apply();
      } else filter.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      filter.blur();
    }
  });
  apply();
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

const search = $<HTMLInputElement>("#docsearch");
const results = $<HTMLOListElement>("#docsearch-results");
const status = $("#docsearch-status");

if (search && results && status) {
  let index: SearchEntry[] | null = null;
  let loading: Promise<void> | null = null;

  const load = (): Promise<void> =>
    (loading ??= import(`${ROOT}assets/js/docs-index.js`).then((m: { default: SearchEntry[] }) => {
      index = m.default;
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
