// SPDX-License-Identifier: Apache-2.0
import { GITHUB_OWNER_PATTERN, GITHUB_REPO_PATTERN, githubItemKey } from './link-keys.js';

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

export function escapeSqlLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const URL_RE = /https?:\/\/[^\s)]+/g;
const REF_BOUNDARY = '(?:^|[\\s(\\[,])';
const ISSUE_REF_RE = new RegExp(`${REF_BOUNDARY}(#\\d+)\\b`, 'g');
const CROSS_REPO_REF_RE = new RegExp(
  `${REF_BOUNDARY}(${GITHUB_OWNER_PATTERN}\\/${GITHUB_REPO_PATTERN})#(\\d+)\\b`,
  'g',
);
const GITHUB_ITEM_URL_RE = new RegExp(
  `^https?:\\/\\/(?:www\\.)?github\\.com\\/(${GITHUB_OWNER_PATTERN}\\/${GITHUB_REPO_PATTERN})\\/(?:pull|issues)\\/(\\d+)\\b`,
);

/** URLs and `#N` references in free text; GitHub items become `githubItemKey`s, a bare `#N` scoped to `repoFullName` when given. */
export function extractExplicitLinks(body: string, repoFullName?: string): string[] {
  const links = new Set<string>();
  for (const match of body.matchAll(URL_RE)) {
    const item = GITHUB_ITEM_URL_RE.exec(match[0]);
    links.add(item?.[1] && item[2] ? githubItemKey(item[1], item[2]) : match[0]);
  }
  for (const match of body.matchAll(CROSS_REPO_REF_RE)) {
    if (match[1] && match[2]) links.add(githubItemKey(match[1], match[2]));
  }
  for (const match of body.matchAll(ISSUE_REF_RE)) {
    if (!match[1]) continue;
    links.add(repoFullName ? githubItemKey(repoFullName, match[1].slice(1)) : match[1]);
  }
  return [...links];
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
