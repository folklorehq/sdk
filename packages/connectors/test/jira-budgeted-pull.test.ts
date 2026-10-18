// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import { RateLimitError } from '@folklore/errors';
import {
  JIRA_JQL_TIMEZONE_MARGIN_MS,
  JiraConnector,
  jiraUpdatedMs,
} from '../src/jira/JiraConnector.js';
import type { JiraApiClient } from '../src/jira/client.js';
import type { JiraComment, JiraIssue } from '../src/jira/types.js';
import { makeComment, makeIssue } from './fixtures/jira.js';

const CURSOR = '2026-06-01T10:00:00.000Z';
const MS_PER_HOUR = 3_600_000;

function issueAt(n: number, updated: string): JiraIssue {
  return Object.assign(makeIssue({ updated, created: '2026-01-01T00:00:00.000Z' }), {
    id: `issue-${n}`,
    key: `PROJ-${n}`,
  });
}

function updatedOf(cursorValue: string | null): string | null {
  return cursorValue === null ? null : (JSON.parse(cursorValue) as { updated: string }).updated;
}

function fiveIssues(): JiraIssue[] {
  return [1, 2, 3, 4, 5].map((n) => issueAt(n, `2026-06-0${n}T10:00:00.000Z`));
}

class PagedJiraClient implements JiraApiClient {
  sinceArgs: Array<string | undefined> = [];
  pagesPulled = 0;

  constructor(
    private readonly pages: JiraIssue[][],
    private readonly commentsPerIssue: (key: string) => number = () => 1,
    private readonly failWith?: unknown,
  ) {}

  async listProjects() {
    return [];
  }

  async *pageIssuesUpdatedSince(updatedSince?: string): AsyncIterable<readonly JiraIssue[]> {
    this.sinceArgs.push(updatedSince);
    for (const page of this.pages) {
      if (this.failWith !== undefined) throw this.failWith;
      this.pagesPulled += 1;
      yield page;
    }
  }

  async listComments(issueKey: string): Promise<JiraComment[]> {
    return Array.from({ length: this.commentsPerIssue(issueKey) }, (_, i) => ({
      ...makeComment(),
      id: `${issueKey}-c${i}`,
    }));
  }
}

function connectorFor(client: JiraApiClient): JiraConnector {
  return new JiraConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);
}

describe('JiraConnector.pull budget and watermark', () => {
  it('takes whole issues until the fact budget is spent and cursors at the last one taken', async () => {
    const client = new PagedJiraClient([fiveIssues()]);

    const result = await connectorFor(client).pull({ value: null }, { maxFacts: 3 });

    expect(result.facts).toHaveLength(4);
    expect(result.hasMore).toBe(true);
    expect(updatedOf(result.cursor.value)).toBe('2026-06-02T10:00:00.000Z');
  });

  it('skips issues before the cursor, retakes the one at it free, and continues', async () => {
    const client = new PagedJiraClient([fiveIssues()]);

    const result = await connectorFor(client).pull(
      { value: '2026-06-02T10:00:00.000Z' },
      { maxFacts: 3 },
    );

    const takenKeys = new Set(result.facts.map((f) => f.sourceThreadId));
    expect([...takenKeys].sort()).toEqual(['PROJ-2', 'PROJ-3', 'PROJ-4']);
    expect(result.hasMore).toBe(true);
    expect(updatedOf(result.cursor.value)).toBe('2026-06-04T10:00:00.000Z');
  });

  it('keeps every issue that shares one millisecond even when the budget is spent', async () => {
    const same = [1, 2, 3].map((n) => issueAt(n, '2026-06-02T10:00:00.000Z'));
    const client = new PagedJiraClient([[...same, issueAt(4, '2026-06-03T10:00:00.000Z')]]);

    const result = await connectorFor(client).pull({ value: null }, { maxFacts: 1 });

    expect(new Set(result.facts.map((f) => f.sourceThreadId))).toEqual(
      new Set(['PROJ-1', 'PROJ-2', 'PROJ-3']),
    );
    expect(result.hasMore).toBe(true);
  });

  it('counts each comment as a fact in an issue cost', async () => {
    const pages = [
      [issueAt(1, '2026-06-01T10:00:00.000Z'), issueAt(2, '2026-06-02T10:00:00.000Z')],
    ];
    const client = new PagedJiraClient(pages, (key) => (key === 'PROJ-1' ? 3 : 1));

    const result = await connectorFor(client).pull({ value: null }, { maxFacts: 4 });

    expect(result.facts).toHaveLength(4);
    expect(result.hasMore).toBe(true);
    expect(updatedOf(result.cursor.value)).toBe('2026-06-01T10:00:00.000Z');
  });

  it('widens the JQL lower bound by the timezone margin', async () => {
    const client = new PagedJiraClient([[]]);

    await connectorFor(client).pull({ value: CURSOR });

    const expected = new Date(Date.parse(CURSOR) - JIRA_JQL_TIMEZONE_MARGIN_MS).toISOString();
    expect(JIRA_JQL_TIMEZONE_MARGIN_MS).toBe(14 * MS_PER_HOUR);
    expect(client.sinceArgs).toEqual([expected]);
    expect(expected).toBe('2026-05-31T20:00:00.000Z');
  });

  it('uses the window start, unwidened, when there is no cursor', async () => {
    const client = new PagedJiraClient([[]]);

    await connectorFor(client).pull({ value: null }, { since: new Date('2025-06-01T00:00:00Z') });

    expect(client.sinceArgs).toEqual(['2025-06-01T00:00:00.000Z']);
  });

  it('takes an issue updated later in the same minute as the cursor and drops one earlier in it', async () => {
    const client = new PagedJiraClient([
      [issueAt(1, '2026-06-01T09:59:30.000Z'), issueAt(2, '2026-06-01T10:00:30.000Z')],
    ]);

    const result = await connectorFor(client).pull({ value: CURSOR });

    expect(new Set(result.facts.map((f) => f.sourceThreadId))).toEqual(new Set(['PROJ-2']));
    expect(result.cursor.value).toBe('2026-06-01T10:00:30.000Z');
  });

  it('rejects an issue whose updated time does not parse', async () => {
    const client = new PagedJiraClient([[issueAt(1, 'not-a-date')]]);

    await expect(connectorFor(client).pull({ value: null })).rejects.toThrow(
      'jira_timestamp_invalid',
    );
  });

  it('accepts the legacy cursor format and Jira offsets without a colon', async () => {
    expect(jiraUpdatedMs('2026-06-01T10:00:00.000Z')).toBe(Date.parse(CURSOR));
    expect(jiraUpdatedMs('2026-06-01T12:00:00.000+0200')).toBe(Date.parse(CURSOR));
    const client = new PagedJiraClient([[issueAt(1, '2026-06-01T12:00:00.000+0200')]]);

    const result = await connectorFor(client).pull({ value: CURSOR });

    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.cursor.value).toBe('2026-06-01T12:00:00.000+0200');
  });

  it('takes everything and reports no more when no budget is given', async () => {
    const client = new PagedJiraClient([fiveIssues()]);

    const result = await connectorFor(client).pull({ value: null });

    expect(result.facts).toHaveLength(10);
    expect(result.hasMore).toBe(false);
    expect(result.cursor.value).toBe('2026-06-05T10:00:00.000Z');
  });

  it('maps a rate-limited page fetch to a RateLimitError', async () => {
    const client = new PagedJiraClient([[issueAt(1, CURSOR)]], () => 1, { status: 429 });

    await expect(connectorFor(client).pull({ value: null })).rejects.toBeInstanceOf(RateLimitError);
  });

  it('does not fetch a page past the one that reveals the boundary', async () => {
    const client = new PagedJiraClient([
      [issueAt(1, '2026-06-01T10:00:00.000Z')],
      [issueAt(2, '2026-06-02T10:00:00.000Z')],
      [issueAt(3, '2026-06-03T10:00:00.000Z')],
    ]);

    const result = await connectorFor(client).pull({ value: null }, { maxFacts: 1 });

    expect(client.pagesPulled).toBe(2);
    expect(result.hasMore).toBe(true);
  });
});
