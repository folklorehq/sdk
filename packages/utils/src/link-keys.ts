// SPDX-License-Identifier: Apache-2.0
// Only [] classes, anchors, {m,n} and | appear, so each pattern compiles alike in JS and PostgreSQL's ARE engine.
export const GITHUB_OWNER_PATTERN = '[A-Za-z0-9][A-Za-z0-9-]{0,38}';
export const GITHUB_REPO_PATTERN = '[A-Za-z0-9._-]{1,100}';
export const GITHUB_ITEM_KEY_PATTERN = `${GITHUB_OWNER_PATTERN}/${GITHUB_REPO_PATTERN}#[1-9][0-9]{0,9}`;
export const ISSUE_KEY_PATTERN = '[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,6}';
export const ANCHORED_ISSUE_KEY_PATTERN = `^${ISSUE_KEY_PATTERN}$`;
export const ANCHORED_GITHUB_ITEM_KEY_PATTERN = `^${GITHUB_ITEM_KEY_PATTERN}$`;
export const NOTION_PAGE_KEY_PATTERN =
  'notion:page:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const SLACK_THREAD_KEY_PATTERN = 'slack:[CGD][A-Z0-9]{2,20}:[0-9]{10}[.][0-9]{6}';
export const CANONICAL_LINK_KEY_PATTERN = `^(${GITHUB_ITEM_KEY_PATTERN}|${ISSUE_KEY_PATTERN}|${NOTION_PAGE_KEY_PATTERN}|${SLACK_THREAD_KEY_PATTERN})$`;

const CANONICAL_LINK_KEY_RE = new RegExp(CANONICAL_LINK_KEY_PATTERN);
const ISSUE_KEY_RE = new RegExp(ANCHORED_ISSUE_KEY_PATTERN);
const GITHUB_ITEM_KEY_RE = new RegExp(ANCHORED_GITHUB_ITEM_KEY_PATTERN);
const GITHUB_ITEM_SEPARATOR = '#';
const ISSUE_KEY_SEPARATOR = '-';
const NOTION_PAGE_KEY_PREFIX = 'notion:page:';
const NOTION_UNDASHED_ID_RE = /^[0-9a-f]{32}$/i;
const NOTION_DASHED_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTION_ID_IN_PATH_RE = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi;
const NOTION_UUID_GROUPS = [8, 4, 4, 4, 12] as const;
const NOTION_PEEK_PARAM = 'p';
const SLACK_PERMALINK_TS_RE = /^p([0-9]{10})([0-9]{6})$/;
const SLACK_THREAD_TS_PARAM = 'thread_ts';
const SLACK_ARCHIVES_PATH_RE = /^\/archives\/([^/]+)\/(p[0-9]+)\/?$/;
const JIRA_HOST_SUFFIX = '.atlassian.net';
const JIRA_BROWSE_PATH_RE = /^\/browse\/([^/]+)\/?$/;
const JIRA_SELECTED_ISSUE_PARAM = 'selectedIssue';
const LINEAR_HOST = 'linear.app';
const LINEAR_ISSUE_PATH_RE = /^\/[^/]+\/issue\/([^/]+)(?:\/[^/]*)?\/?$/;
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const GITHUB_ITEM_PATH_RE = new RegExp(
  `^\\/(${GITHUB_OWNER_PATTERN}\\/${GITHUB_REPO_PATTERN})\\/(?:pull|issues)\\/([0-9]+)(?:\\/|$)`,
);
const NOTION_HOSTS = new Set(['notion.so', 'www.notion.so']);
const NOTION_SITE_HOST_SUFFIX = '.notion.site';
const SLACK_HOST_SUFFIX = '.slack.com';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const BARE_ITEM_REF_RE = /^#([0-9]+)$/;

/** A GitHub pull request or issue's source-native key, `owner/repo#N`. */
export function githubItemKey(repoFullName: string, itemNumber: number | string): string {
  return `${repoFullName}${GITHUB_ITEM_SEPARATOR}${itemNumber}`;
}

/** The `owner/repo` of a GitHub item key, or null when the value is not one. */
export function githubItemRepo(key: string): string | null {
  return GITHUB_ITEM_KEY_RE.test(key) ? (key.split(GITHUB_ITEM_SEPARATOR)[0] ?? null) : null;
}

export function isCanonicalLinkKey(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_LINK_KEY_RE.test(value);
}

export function isIssueKey(value: string): boolean {
  return ISSUE_KEY_RE.test(value);
}

export function issueKey(prefix: string, issueNumber: number | string): string {
  return `${prefix.toUpperCase()}${ISSUE_KEY_SEPARATOR}${issueNumber}`;
}

export function issueKeyPrefix(key: string): string {
  return key.split(ISSUE_KEY_SEPARATOR)[0] ?? key;
}

/** 32 hex digits, dashed or not, in any case, as the dashed lower-case form Notion's API returns. */
export function canonicalNotionPageId(raw: string): string | null {
  if (!NOTION_UNDASHED_ID_RE.test(raw) && !NOTION_DASHED_ID_RE.test(raw)) return null;
  const hex = raw.replaceAll('-', '').toLowerCase();
  const groups: string[] = [];
  let offset = 0;
  for (const length of NOTION_UUID_GROUPS) {
    groups.push(hex.slice(offset, offset + length));
    offset += length;
  }
  return groups.join('-');
}

/** Null for an id that is not a Notion page id, so the caller drops it. */
export function notionPageKey(pageId: string): string | null {
  const canonical = canonicalNotionPageId(pageId);
  return canonical === null ? null : `${NOTION_PAGE_KEY_PREFIX}${canonical}`;
}

export function slackThreadKey(channelId: string, threadTs: string): string {
  return `slack:${channelId}:${threadTs}`;
}

/** A permalink's `p<16 digits>` segment as the message ts it names. */
export function slackPermalinkTs(pSegment: string): string | null {
  const match = SLACK_PERMALINK_TS_RE.exec(pSegment);
  return match ? `${match[1]}.${match[2]}` : null;
}

/** The canonical key of the container a URL names, or null when it names none. */
export function linkKeyFromUrl(url: string): string | null {
  const parsed = parseWebUrl(url);
  if (!parsed) return null;
  const key = containerKeyFromUrl(parsed);
  return isCanonicalLinkKey(key) ? key : null;
}

/** What an org's own containers name: Jira and Linear issue prefixes, and GitHub `owner/repo`s. */
export interface LinkScope {
  issuePrefixes: ReadonlySet<string>;
  githubRepos: ReadonlySet<string>;
}

/** Keeps allowlisted keys only, and an issue or GitHub key only when the org's own containers name its prefix or repo. */
export function scopeExplicitLinks(links: readonly unknown[], scope: LinkScope): string[] {
  const kept = new Set<string>();
  for (const link of links) {
    if (isCanonicalLinkKey(link) && isInScope(link, scope)) kept.add(link);
  }
  return [...kept];
}

function isInScope(key: string, scope: LinkScope): boolean {
  if (isIssueKey(key)) return scope.issuePrefixes.has(issueKeyPrefix(key));
  const repo = githubItemRepo(key);
  return repo === null || scope.githubRepos.has(repo);
}

export interface StoredLinkContext {
  githubRepoFullName?: string;
}

/** Re-keys links stored before canonical keys: URLs to keys, `#N` to the repo's item; the caller scopes the result. */
export function canonicalizeStoredLinks(links: unknown, ctx: StoredLinkContext): string[] {
  if (!Array.isArray(links)) return [];
  const keys = new Set<string>();
  for (const link of links) {
    const key = typeof link === 'string' ? canonicalizeStoredLink(link, ctx) : null;
    if (key !== null) keys.add(key);
  }
  return [...keys];
}

function canonicalizeStoredLink(link: string, ctx: StoredLinkContext): string | null {
  if (parseWebUrl(link)) return linkKeyFromUrl(link);
  const bareRef = BARE_ITEM_REF_RE.exec(link);
  if (!bareRef) return link;
  return ctx.githubRepoFullName && bareRef[1]
    ? githubItemKey(ctx.githubRepoFullName, bareRef[1])
    : null;
}

function parseWebUrl(url: string): URL | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  return WEB_PROTOCOLS.has(parsed.protocol) ? parsed : null;
}

function containerKeyFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (GITHUB_HOSTS.has(host)) return githubKeyFromPath(url.pathname);
  if (host.endsWith(JIRA_HOST_SUFFIX)) return jiraKeyFromUrl(url);
  if (host === LINEAR_HOST) return LINEAR_ISSUE_PATH_RE.exec(url.pathname)?.[1] ?? null;
  if (NOTION_HOSTS.has(host) || host.endsWith(NOTION_SITE_HOST_SUFFIX))
    return notionKeyFromUrl(url);
  if (host.endsWith(SLACK_HOST_SUFFIX)) return slackKeyFromUrl(url);
  return null;
}

function githubKeyFromPath(pathname: string): string | null {
  const match = GITHUB_ITEM_PATH_RE.exec(pathname);
  return match?.[1] && match[2] ? githubItemKey(match[1], match[2]) : null;
}

function jiraKeyFromUrl(url: URL): string | null {
  return (
    JIRA_BROWSE_PATH_RE.exec(url.pathname)?.[1] ??
    url.searchParams.get(JIRA_SELECTED_ISSUE_PARAM) ??
    null
  );
}

function notionKeyFromUrl(url: URL): string | null {
  const peeked = url.searchParams.get(NOTION_PEEK_PARAM);
  const pageId =
    peeked && NOTION_UNDASHED_ID_RE.test(peeked)
      ? peeked
      : (url.pathname.match(NOTION_ID_IN_PATH_RE) ?? []).at(-1);
  return pageId ? notionPageKey(pageId) : null;
}

function slackKeyFromUrl(url: URL): string | null {
  const match = SLACK_ARCHIVES_PATH_RE.exec(url.pathname);
  if (!match?.[1] || !match[2]) return null;
  const threadTs = url.searchParams.get(SLACK_THREAD_TS_PARAM) ?? slackPermalinkTs(match[2]);
  return threadTs ? slackThreadKey(match[1], threadTs) : null;
}
