// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Firefox's help links, as Vimma sends them to vimma.dev. Firefox builds every "Learn more" link,
// Help > Get Help and Settings' support button from the pref app.support.baseURL plus a topic
// (utilityOverlay.js getHelpLinkURL, moz-support-link.mjs), and Vimma sets that pref to
// https://vimma.dev/support/%VERSION%/%OS%/%LOCALE%/, so a link arrives as
// /support/<Firefox version>/<OS>/<locale>/<topic>.
//
// The Worker script (scripts/worker.ts) answers these links with the rules below; Cloudflare's
// static assets serve every other address. A topic Vimma documents goes to its page here; every
// other topic goes to the same article in Firefox's help on support.mozilla.org, through the
// address Firefox itself would have opened, so every link Firefox builds lands on a page.

/** The address Firefox's own app.support.baseURL formats to, before the version, OS and locale. */
export const FIREFOX_HELP = "https://support.mozilla.org/1/firefox/";

export interface SupportTopic {
  /** Firefox's topic names (the `support-page` attribute or getHelpLinkURL argument). */
  slugs: string[];
  /** The page on this site, root-relative, with an optional #fragment. */
  to: string;
  /** What the page covers, for the list on the help page. */
  title: string;
}

// The topics are the ones Firefox 159 links to where Vimma behaves differently or has a page of
// its own. A topic Vimma leaves as Firefox has it (Sync, passwords, certificates, Enhanced
// Tracking Protection) is better served by Mozilla's article, so it is not listed.
export const SUPPORT_TOPICS: SupportTopic[] = [
  // Help > Get Help, the About dialog, and Settings' "Vimma support" button and search results
  { slugs: ["firefox-help", "preferences"], to: "/support/", title: "Help" },
  {
    // Settings > Privacy & Security, data collection: Vimma builds upload nothing
    slugs: [
      "technical-and-interaction-data",
      "telemetry-clientid",
      "usage-ping-settings",
      "crash-reports",
      "unsent-crash-reports-in-firefox",
      "remote-improvements",
      "personalized-addons",
      "extensionrecommendations",
    ],
    to: "/docs/privacy/#turned-off",
    title: "Data collection, crash reports and recommendations",
  },
  { slugs: ["addons-help"], to: "/docs/firefox-shortcuts/#your-add-ons", title: "Add-ons" },
  { slugs: ["containers"], to: "/docs/workspaces/", title: "Containers, which are Vimma's workspaces" },
  { slugs: ["prefs-search"], to: "/docs/config/#search-engines", title: "Search engines" },
  {
    slugs: ["keyboard-shortcuts-perform-firefox-tasks-quickly"],
    to: "/docs/firefox-shortcuts/",
    title: "Keyboard shortcuts",
  },
];

const PREFIX = "/support/:version/:os/:locale/";

/** The rules, as `from` patterns with `:placeholders`: first match wins, the forward last. */
export function rules(): [from: string, to: string][] {
  return [
    // the bare base, as Firefox would build it for an empty topic
    [PREFIX, "/support/"],
    ...SUPPORT_TOPICS.flatMap((t) => t.slugs.map((s): [string, string] => [PREFIX + s, t.to])),
    [`${PREFIX}:topic`, `${FIREFOX_HELP}:version/:os/:locale/:topic`],
  ];
}

/**
 * Where a request path goes: a `:placeholder` takes one whole, non-empty path segment, as it
 * arrives (still percent-encoded), and the first matching rule wins. null when no rule matches,
 * and the path is served as a file or as not found.
 */
export function resolveSupport(path: string): string | null {
  const segments = path.split("/");
  for (const [from, to] of rules()) {
    const pattern = from.split("/");
    if (pattern.length !== segments.length) continue;
    const values = new Map<string, string>();
    const matches = pattern.every((part, i) => {
      const segment = segments[i] ?? "";
      if (!part.startsWith(":")) return part === segment;
      values.set(part, segment);
      return segment !== "";
    });
    if (!matches) continue;
    return to
      .split("/")
      .map((part) => values.get(part) ?? part)
      .join("/");
  }
  return null;
}
