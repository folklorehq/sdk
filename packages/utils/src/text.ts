// SPDX-License-Identifier: Apache-2.0
/** Collapse internal whitespace runs to single spaces and trim the ends. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Collapse whitespace, then cap length with a trailing ellipsis if needed. */
export function truncate(value: string, max: number): string {
  const collapsed = collapseWhitespace(value);
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/** Up to two leading letters of the space-separated words in a name. */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

/** Escape a string for literal use inside a `RegExp`. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MENTION_TOKEN = '[A-Za-z0-9._-]{1,64}';
// `fk-person:<slug>` mention pills and `@handle` tokens (the latter only when not preceded by a word
// char, so `foo@bar.com` in an address is not a mention). Returns lowercased target tokens only —
// never the surrounding text — so it is safe to run on decrypted comment prose.
const MENTION_RE = new RegExp(`fk-person:(${MENTION_TOKEN})|(?<![\\w])@(${MENTION_TOKEN})`, 'g');

/** Extract lowercased mention target tokens (`@handle` / `fk-person:<slug>`) from plaintext. */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    const token = match[1] ?? match[2];
    if (token) out.add(token.toLowerCase());
  }
  return [...out];
}
