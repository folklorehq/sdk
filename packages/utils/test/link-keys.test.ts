// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import * as linkKeys from '../src/link-keys.js';
import {
  CANONICAL_LINK_KEY_PATTERN,
  canonicalNotionPageId,
  canonicalizeStoredLinks,
  githubItemRepo,
  isCanonicalLinkKey,
  isIssueKey,
  issueKey,
  issueKeyPrefix,
  linkKeyFromUrl,
  notionPageKey,
  scopeExplicitLinks,
  slackPermalinkTs,
  slackThreadKey,
} from '../src/link-keys.js';

const NOTION_ID = '0123456789abcdef0123456789abcdef';
const NOTION_KEY = 'notion:page:01234567-89ab-cdef-0123-456789abcdef';
const SLACK_KEY = 'slack:C0123ABCD:1700000000.123456';

describe('linkKeyFromUrl', () => {
  it('keys a GitHub pull URL', () => {
    expect(linkKeyFromUrl('https://github.com/acme/api/pull/7/files')).toBe('acme/api#7');
  });

  it('keys a GitHub issues URL', () => {
    expect(linkKeyFromUrl('https://github.com/acme/web/issues/9')).toBe('acme/web#9');
  });

  it('keys a Jira browse URL', () => {
    expect(linkKeyFromUrl('https://acme.atlassian.net/browse/PAY-12')).toBe('PAY-12');
  });

  it('keys a Jira selectedIssue URL', () => {
    expect(
      linkKeyFromUrl(
        'https://acme.atlassian.net/jira/software/projects/PAY/boards/1?selectedIssue=PAY-12',
      ),
    ).toBe('PAY-12');
  });

  it('keys a Linear issue URL with a slug', () => {
    expect(linkKeyFromUrl('https://linear.app/acme/issue/ENG-7/fix-the-retry-loop')).toBe('ENG-7');
  });

  it('keys a Notion URL by its page id and drops the title slug', () => {
    const key = linkKeyFromUrl(`https://www.notion.so/acme/Q4-plan-${NOTION_ID}`);
    expect(key).toBe(NOTION_KEY);
    expect(key).not.toMatch(/Q4|plan|acme/);
  });

  it('keys a notion.site URL the same way', () => {
    expect(linkKeyFromUrl(`https://acme.notion.site/Q4-plan-${NOTION_ID}`)).toBe(NOTION_KEY);
  });

  it('keys a Notion peek URL by its p parameter', () => {
    expect(
      linkKeyFromUrl(`https://www.notion.so/acme/Board-${'f'.repeat(32)}?p=${NOTION_ID}&pm=s`),
    ).toBe(NOTION_KEY);
  });

  it('keys a Slack permalink to its message ts', () => {
    expect(linkKeyFromUrl('https://acme.slack.com/archives/C0123ABCD/p1700000000123456')).toBe(
      SLACK_KEY,
    );
  });

  it('keys a Slack reply permalink to its thread parent', () => {
    expect(
      linkKeyFromUrl(
        'https://acme.slack.com/archives/C0123ABCD/p1700000000123456?thread_ts=1699999999.000100&cid=C0123ABCD',
      ),
    ).toBe('slack:C0123ABCD:1699999999.000100');
  });

  it.each([
    'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc&X-Amz-Credential=def',
    'https://docs.google.com/document/d/1AbCdEf/edit',
    'https://github.com/acme/api/tree/main/src',
    'https://example.com/browse/PAY-12',
    'not a url',
    'ftp://acme.atlassian.net/browse/PAY-12',
    'javascript:alert(1)//acme.atlassian.net/browse/PAY-12',
  ])('drops %s', (url) => {
    expect(linkKeyFromUrl(url)).toBeNull();
  });

  it('returns only allowlisted keys', () => {
    const urls = [
      'https://github.com/acme/api/pull/7',
      'https://acme.atlassian.net/browse/PAY-12',
      'https://linear.app/acme/issue/ENG-7',
      `https://www.notion.so/${NOTION_ID}`,
      'https://acme.slack.com/archives/C0123ABCD/p1700000000123456',
    ];
    for (const url of urls) {
      const key = linkKeyFromUrl(url);
      expect(isCanonicalLinkKey(key)).toBe(true);
    }
  });
});

describe('module surface', () => {
  it('exports no bare-key extraction from free text', () => {
    expect(Object.keys(linkKeys).sort()).toEqual(
      [
        'ANCHORED_GITHUB_ITEM_KEY_PATTERN',
        'ANCHORED_ISSUE_KEY_PATTERN',
        'CANONICAL_LINK_KEY_PATTERN',
        'GITHUB_ITEM_KEY_PATTERN',
        'GITHUB_OWNER_PATTERN',
        'GITHUB_REPO_PATTERN',
        'ISSUE_KEY_PATTERN',
        'NOTION_PAGE_KEY_PATTERN',
        'SLACK_THREAD_KEY_PATTERN',
        'canonicalNotionPageId',
        'canonicalizeStoredLinks',
        'githubItemKey',
        'githubItemRepo',
        'isCanonicalLinkKey',
        'isIssueKey',
        'issueKey',
        'issueKeyPrefix',
        'linkKeyFromUrl',
        'notionPageKey',
        'scopeExplicitLinks',
        'slackPermalinkTs',
        'slackThreadKey',
      ].sort(),
    );
  });

  it('compiles the allowlist as an anchored pattern', () => {
    expect(CANONICAL_LINK_KEY_PATTERN.startsWith('^(')).toBe(true);
    expect(CANONICAL_LINK_KEY_PATTERN.endsWith(')$')).toBe(true);
  });
});

describe('scopeExplicitLinks', () => {
  const scope = { issuePrefixes: new Set(['PAY']), githubRepos: new Set(['owner/r']) };

  it.each<[string, unknown]>([
    ['a URL', 'https://x'],
    ['a scheme-less host', 'notion.so/acme/abc'],
    ['leading whitespace', ' PAY-1'],
    ['trailing whitespace', 'PAY-1 '],
    ['a trailing newline', 'PAY-1\n'],
    ['a nested array', ['PAY-1']],
    ['a number', 42],
    ['a lower-case key', 'pay-1'],
    ['an out-of-scope prefix', 'CVE-2024'],
    ['a malformed Slack ts', 'slack:C1:1.2'],
    ['a short Notion id', 'notion:page:0123'],
    ['a GitHub key for a repo the org does not have', 'other/r#3'],
    ['a body token that only looks like a repo item', 'hr/layoffs#2025'],
  ])('drops %s', (_name, value) => {
    expect(scopeExplicitLinks([value], scope)).toEqual([]);
  });

  it('keeps in-scope issue and GitHub keys and every other canonical key', () => {
    expect(scopeExplicitLinks(['PAY-1', 'owner/r#3', NOTION_KEY, SLACK_KEY], scope)).toEqual([
      'PAY-1',
      'owner/r#3',
      NOTION_KEY,
      SLACK_KEY,
    ]);
  });

  it("drops another org's prefix", () => {
    expect(scopeExplicitLinks(['ENG-1'], scope)).toEqual([]);
  });

  it('drops every issue and GitHub key when the org has neither', () => {
    const empty = { issuePrefixes: new Set<string>(), githubRepos: new Set<string>() };
    expect(scopeExplicitLinks(['PAY-1', 'owner/r#3', NOTION_KEY], empty)).toEqual([NOTION_KEY]);
  });

  it('dedupes in order', () => {
    expect(scopeExplicitLinks(['owner/r#3', 'PAY-1', 'owner/r#3'], scope)).toEqual([
      'owner/r#3',
      'PAY-1',
    ]);
  });
});

describe('githubItemRepo', () => {
  it('reads the repo of a GitHub item key', () => {
    expect(githubItemRepo('acme/api#12')).toBe('acme/api');
  });

  it.each(['PAY-12', '#12', 'acme/api', 'acme/api#0', 'acme/api#12\n'])(
    'gives null for %j',
    (value) => {
      expect(githubItemRepo(value)).toBeNull();
    },
  );
});

describe('canonicalizeStoredLinks', () => {
  it('re-keys stored URLs and repo-scoped #N, dropping the rest', () => {
    expect(
      canonicalizeStoredLinks(
        ['#4', 'https://github.com/o/r/pull/9', 'https://docs.google.com/x', 7],
        { githubRepoFullName: 'o/r' },
      ),
    ).toEqual(['o/r#4', 'o/r#9']);
  });

  it('drops #N without a repo', () => {
    expect(canonicalizeStoredLinks(['#4', 'o/r#5'], {})).toEqual(['o/r#5']);
  });

  it('gives [] for a non-array value', () => {
    expect(canonicalizeStoredLinks({ links: ['o/r#5'] }, {})).toEqual([]);
    expect(canonicalizeStoredLinks(null, {})).toEqual([]);
  });

  it('keeps other strings for scopeExplicitLinks to judge', () => {
    expect(canonicalizeStoredLinks(['CVE-2024'], {})).toEqual(['CVE-2024']);
  });

  it('dedupes in order', () => {
    expect(
      canonicalizeStoredLinks(['o/r#9', 'https://github.com/o/r/pull/9', 'o/r#1'], {}),
    ).toEqual(['o/r#9', 'o/r#1']);
  });
});

describe('notion page ids', () => {
  it('keys an undashed upper-case id as dashed lower-case', () => {
    expect(notionPageKey(NOTION_ID.toUpperCase())).toBe(NOTION_KEY);
  });

  it('keeps a dashed lower-case id byte for byte', () => {
    expect(notionPageKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'notion:page:a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });

  it('gives no key for a non-hex id, so the caller drops it', () => {
    expect(notionPageKey('not-a-page-id')).toBeNull();
  });

  it('gives null for a wrong-length id', () => {
    expect(canonicalNotionPageId('0123')).toBeNull();
  });
});

describe('issue and slack keys', () => {
  it('builds an issue key with an upper-case prefix', () => {
    expect(issueKey('eng', 7)).toBe('ENG-7');
  });

  it('reads an issue key prefix', () => {
    expect(issueKeyPrefix('PAY-12')).toBe('PAY');
  });

  it.each(['PAY-12', 'AB12-1'])('accepts the issue key %s', (key) => {
    expect(isIssueKey(key)).toBe(true);
  });

  it.each(['P-1', 'PAY-0', 'pay-1', 'PAY-1 ', 'PAY-'])('rejects %j as an issue key', (key) => {
    expect(isIssueKey(key)).toBe(false);
  });

  it('builds a slack thread key', () => {
    expect(slackThreadKey('C0123ABCD', '1700000000.123456')).toBe(SLACK_KEY);
  });

  it('reads a permalink ts', () => {
    expect(slackPermalinkTs('p1700000000123456')).toBe('1700000000.123456');
    expect(slackPermalinkTs('p170000000012345')).toBeNull();
  });

  it('accepts only strings as canonical keys', () => {
    expect(isCanonicalLinkKey(42)).toBe(false);
    expect(isCanonicalLinkKey(['PAY-1'])).toBe(false);
    expect(isCanonicalLinkKey(null)).toBe(false);
  });
});
