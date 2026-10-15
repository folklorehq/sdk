// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { extractExplicitLinks, githubItemKey, isBareIssueKey } from '../src/text.js';

describe('extractExplicitLinks', () => {
  it('extracts unique URLs and issue references without changing their existing grouping', () => {
    expect(extractExplicitLinks('fixes #3, see https://example.com/x and #12')).toEqual([
      'https://example.com/x',
      '#3',
      '#12',
    ]);
  });

  it('does not treat an embedded hash as an issue reference', () => {
    expect(
      extractExplicitLinks('hash#3 and #3 again https://example.com/x https://example.com/x'),
    ).toEqual(['https://example.com/x', '#3']);
  });

  it('keys GitHub references the way GitHub containers are keyed, scoping a bare #N to the repo', () => {
    const body = [
      'Fixes #123 and closes acme/web#45.',
      'Follow-up to https://github.com/acme/api/pull/7/files and https://github.com/acme/web/issues/9.',
      'Squashed: feat(api): retry uploads (#418)',
      'Docs: https://example.com/x',
    ].join('\n');

    expect(extractExplicitLinks(body, 'acme/api')).toEqual([
      'acme/api#7',
      'acme/web#9',
      'https://example.com/x',
      'acme/web#45',
      'acme/api#123',
      'acme/api#418',
    ]);
  });

  it('leaves a bare #N unscoped when the repo is unknown', () => {
    expect(extractExplicitLinks('see (#12) and [#13]')).toEqual(['#12', '#13']);
  });

  it('keeps a URL fragment and a non-item GitHub URL as plain URLs', () => {
    expect(
      extractExplicitLinks('https://github.com/acme/api/blob/main/a.ts#L10', 'acme/api'),
    ).toEqual(['https://github.com/acme/api/blob/main/a.ts#L10']);
  });

  it('builds the owner/repo#N key', () => {
    expect(githubItemKey('acme/api', 42)).toBe('acme/api#42');
  });
});

describe('isBareIssueKey', () => {
  it.each(['PROJ-7', 'LAYOFFS-2025', 'Q3-2026', 'AB12-1'])('matches the bare key %s', (value) => {
    expect(isBareIssueKey(value)).toBe(true);
  });

  it.each([
    'https://acme.atlassian.net/browse/PROJ-12',
    'acme/api#7',
    '#12',
    'proj-7',
    'P-7',
    'PROJ-',
    'PROJ-7x',
    ' PROJ-7',
    'PROJ-7\n',
  ])('does not match %j', (value) => {
    expect(isBareIssueKey(value)).toBe(false);
  });
});
