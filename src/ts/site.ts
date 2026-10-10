// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The site's one script, loaded as a module. Everything here is an enhancement: every page reads
// and works without it. It adds Vim-style keys (j k d u gg G / ? [ ] g h g d g k g i g a), the ?
// help overlay, the status bar's live parts, the keys filter, the docs search and the hero.

import { STATIC_STEP, STEPS, frameHtml, escapeHtml } from "./hero-frames.js";

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

// --- status bar -------------------------------------------------------------------------------

const sbMode = $("#sb-mode");
const sbPending = $("#sb-pending");
const sbPos = $("#sb-pos");
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

function setMode(mode: "normal" | "insert" | "help"): void {
  if (!sbMode) return;
  sbMode.textContent = mode.toUpperCase();
  sbMode.className = `badge badge-${mode}`;
}

function syncMode(): void {
  if (help?.open) setMode("help");
  else setMode(isEditable(document.activeElement) ? "insert" : "normal");
}

document.addEventListener("focusin", syncMode);
document.addEventListener("focusout", () => setTimeout(syncMode, 0));

function setPending(keys: string): void {
  if (!sbPending) return;
  sbPending.textContent = keys;
  sbPending.hidden = keys === "";
}

function syncPosition(): void {
  if (!sbPos) return;
  const max = root.scrollHeight - window.innerHeight;
  const y = window.scrollY;
  sbPos.textContent =
    max <= 2 ? "All" : y <= 2 ? "Top" : y >= max - 2 ? "Bot" : `${Math.round((y / max) * 100)}%`;
}

window.addEventListener("scroll", syncPosition, { passive: true });
window.addEventListener("resize", syncPosition);
syncPosition();

// --- the ? overlay ----------------------------------------------------------------------------

function openHelp(): void {
  if (!help || help.open) return;
  help.showModal();
  syncMode();
}

if (help) {
  help.addEventListener("close", syncMode);
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
  setPending("");
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
      setPending("g");
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

// --- home page: the hero session --------------------------------------------------------------

const screenEl = $("#hero-screen");
const keysEl = $("#hero-keys");
const toggleBtn = $<HTMLButtonElement>("#hero-toggle");
const stepItems = [...document.querySelectorAll<HTMLElement>("#hero-steps li")];

if (screenEl && keysEl && toggleBtn) {
  let playing = false;
  let generation = 0;
  let visible = true;

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  const show = (i: number, typed: readonly string[]): void => {
    const step = STEPS[i];
    if (!step) return;
    screenEl.innerHTML = frameHtml(step);
    keysEl.innerHTML = typed.length
      ? typed.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join(" ")
      : '<span class="dim">waiting for keys…</span>';
    stepItems.forEach((li, j) => li.classList.toggle("current", j === i));
  };

  const run = async (gen: number): Promise<void> => {
    for (let i = 0; ; i = (i + 1) % STEPS.length) {
      const step = STEPS[i];
      if (!step) return;
      const typed: string[] = [];
      for (const k of step.keys) {
        typed.push(k);
        keysEl.innerHTML =
          typed.map((t) => `<kbd>${escapeHtml(t)}</kbd>`).join(" ") + '<span class="caret"></span>';
        await sleep(520);
        if (gen !== generation) return;
      }
      show(i, typed);
      await sleep(i === STEPS.length - 1 ? 3200 : 2300);
      if (gen !== generation) return;
    }
  };

  const setPlaying = (on: boolean): void => {
    playing = on;
    generation++;
    toggleBtn.textContent = on ? "pause" : "play";
    if (on && visible) void run(generation);
  };

  toggleBtn.addEventListener("click", () => {
    if (!playing) show(0, []);
    setPlaying(!playing);
  });

  // Hidden or scrolled away: stop; back in view, carry on from the top.
  const observer = new IntersectionObserver((entries) => {
    const now = entries.some((en) => en.isIntersecting);
    if (now === visible) return;
    visible = now;
    if (playing) {
      generation++;
      if (visible) void run(generation);
    }
  });
  observer.observe(screenEl);

  show(STATIC_STEP, STEPS[STATIC_STEP]?.keys ?? []);
  if (!reducedMotion.matches) {
    show(0, []);
    setPlaying(true);
  } else {
    setPlaying(false);
  }
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
    const head = `${e.p} ${e.h}`.toLowerCase();
    for (const t of terms) {
      if (!e.w.includes(t)) return 0;
      n += 1;
      if (head.includes(t)) n += 4;
      if (` ${e.w} `.includes(` ${t} `)) n += 1;
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
      a.href = ROOT + e.u;
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
