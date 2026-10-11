// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// HTML helpers shared by the build and the scripts.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** Escapes text for an HTML text node or a double-quoted attribute value. */
export const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c] ?? c);
