// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import { JiraConnector } from '../src/jira/JiraConnector.js';
import type { JiraApiClient } from '../src/jira/client.js';
import type { JiraComment, JiraIssue } from '../src/jira/types.js';
import { makeComment, makeIssue } from './fixtures/jira.js';

const WINDOW_START = new Date('2026-05-01T00:00:00.000Z');

class WindowedJiraClient implements JiraApiClient {
  constructor(
    private readonly issues: JiraIssue[],
    private readonly commentsByIssue: Record<string, JiraComment[]>,
  ) {}

  async listProjects() {
    return [];
  }

  async *pageIssuesUpdatedSince(updatedSince?: string): AsyncIterable<readonly JiraIssue[]> {
    const floor = updatedSince === undefined ? 0 : Date.parse(updatedSince);
    yield this.issues
      .filter((issue) => Date.parse(issue.fields.updated) >= floor)
      .sort((a, b) => Date.parse(a.fields.updated) - Date.parse(b.fields.updated));
  }

  async listComments(issueKey: string, updatedSince?: string): Promise<JiraComment[]> {
    const floor = updatedSince === undefined ? 0 : Date.parse(updatedSince);
    return (this.commentsByIssue[issueKey] ?? []).filter((c) => Date.parse(c.created) >= floor);
  }
}

function chainWorld(): WindowedJiraClient {
  const early = Object.assign(
    makeIssue({ created: '2026-06-01T00:00:00.000Z', updated: '2026-06-02T00:00:00.000Z' }),
    { id: 'issue-early', key: 'PROJ-1' },
  );
  const spanning = Object.assign(
    makeIssue({ created: '2026-05-10T00:00:00.000Z', updated: '2026-06-10T00:00:00.000Z' }),
    { id: 'issue-spanning', key: 'PROJ-2' },
  );
  return new WindowedJiraClient([early, spanning], {
    'PROJ-2': [
      { ...makeComment(), id: 'c-before-boundary', created: '2026-05-15T00:00:00.000Z' },
      { ...makeComment(), id: 'c-after-boundary', created: '2026-06-09T00:00:00.000Z' },
    ],
  });
}

function connector(): JiraConnector {
  return new JiraConnector({ logger: new PinoLogger({ level: 'silent' }) }, chainWorld());
}

describe('JiraConnector.pull chunk chain keeps the window floor', () => {
  it('keeps the created fact, the container seed and the earlier comments of an issue born before the chunk boundary and updated after it', async () => {
    const jira = connector();

    const first = await jira.pull({ value: null }, { since: WINDOW_START, maxFacts: 1 });
    expect(first.hasMore).toBe(true);
    const second = await jira.pull(first.cursor, { since: WINDOW_START, maxFacts: 1 });

    expect(second.hasMore).toBe(false);
    const ids = second.facts.map((f) => f.sourceFactId);
    expect(ids).toContain('jira:issue:created:issue-spanning');
    expect(ids).toContain('jira:comment:c-before-boundary');
    expect(ids).toContain('jira:comment:c-after-boundary');
    expect(second.containers.map((c) => c.sourceContainerId)).toContain('PROJ-2');
  });

  it('ends the chain on a plain watermark so the next sync floors at it', async () => {
    const jira = connector();
    const first = await jira.pull({ value: null }, { since: WINDOW_START, maxFacts: 1 });

    const last = await jira.pull(first.cursor, { since: WINDOW_START, maxFacts: 1 });

    expect(last.cursor.value).toBe('2026-06-10T00:00:00.000Z');
  });

  it('rejects a chained cursor that does not decode', async () => {
    await expect(connector().pull({ value: '{"v":2}' }, { since: WINDOW_START })).rejects.toThrow(
      'jira_cursor_invalid',
    );
    await expect(connector().pull({ value: '{not json' }, { since: WINDOW_START })).rejects.toThrow(
      'jira_cursor_invalid',
    );
  });
});
