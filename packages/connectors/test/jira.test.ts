// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import {
  JiraConnector,
  adfToText,
  jiraIssueContainerId,
  normalizeJiraCommentEvent,
  normalizeJiraIssueEvent,
} from '../src/jira/index.js';
import type { JiraApiClient } from '../src/jira/index.js';
import type {
  AdfNode,
  JiraComment,
  JiraCommentEvent,
  JiraIssue,
  JiraIssueEvent,
} from '../src/jira/types.js';

const REPORTER = { accountId: 'acc-reporter', displayName: 'Alice', emailAddress: 'a@example.com' };
const ASSIGNEE = { accountId: 'acc-assignee', displayName: 'Bob' };

function adfDoc(text: string): AdfNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function makeIssue(overrides: Partial<JiraIssue['fields']> = {}): JiraIssue {
  return {
    id: 'issue-1',
    key: 'PROJ-42',
    fields: {
      summary: 'Fix the auth bug',
      description: adfDoc('Auth is broken on mobile. See PROJ-7 and https://x.test/a'),
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-02T00:00:00.000Z',
      reporter: REPORTER,
      assignee: ASSIGNEE,
      status: { name: 'Done', statusCategory: { key: 'done', name: 'Done' } },
      project: { id: 'p-1', key: 'PROJ', name: 'Project' },
      ...overrides,
    },
  };
}

function issueEvent(
  kind: JiraIssueEvent['webhookEvent'],
  issue = makeIssue(),
  changelog?: JiraIssueEvent['changelog'],
): JiraIssueEvent {
  return { webhookEvent: kind, issue, changelog };
}

function statusChangelog(from: string, to: string): JiraIssueEvent['changelog'] {
  return { items: [{ field: 'status', fromString: from, toString: to }] };
}

function makeComment(): JiraComment {
  return {
    id: 'comment-9',
    body: adfDoc('Looks good to me!'),
    author: ASSIGNEE,
    created: '2026-01-03T00:00:00.000Z',
  };
}

function commentEvent(): JiraCommentEvent {
  return { webhookEvent: 'comment_created', issue: makeIssue(), comment: makeComment() };
}

describe('adfToText', () => {
  it('flattens paragraphs to text', () => {
    expect(adfToText(adfDoc('hello world'))).toBe('hello world');
  });

  it('renders headings, lists, and links', () => {
    const doc: AdfNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'text', text: 'one' }] },
            { type: 'listItem', content: [{ type: 'text', text: 'two' }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'link',
              marks: [{ type: 'link', attrs: { href: 'https://x.test' } }],
            },
          ],
        },
      ],
    };
    const out = adfToText(doc);
    expect(out).toContain('## Title');
    expect(out).toContain('- one');
    expect(out).toContain('- two');
    expect(out).toContain('link (https://x.test)');
  });

  it('returns empty string for null', () => {
    expect(adfToText(null)).toBe('');
  });

  it('caps recursion on a pathologically nested doc without throwing', () => {
    let node: AdfNode = { type: 'text', text: 'deep' };
    for (let i = 0; i < 5000; i++) {
      node = { type: 'blockquote', content: [node] };
    }
    expect(() => adfToText({ type: 'doc', content: [node] })).not.toThrow();
  });
});

describe('jiraIssueContainerId', () => {
  it('is the issue key', () => {
    expect(jiraIssueContainerId(makeIssue())).toBe('PROJ-42');
  });
});

describe('normalizeJiraIssueEvent — created', () => {
  it('produces one stateful jira_issue container and one content fact', () => {
    const result = normalizeJiraIssueEvent(issueEvent('jira:issue_created'));
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0]).toMatchObject({
      label: 'jira_issue',
      shape: 'stateful',
      sourceContainerId: 'PROJ-42',
      resourceExternalId: 'PROJ',
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('seeds the fact from summary + description, reporter, and created time', () => {
    const fact = normalizeJiraIssueEvent(issueEvent('jira:issue_created')).facts[0]!;
    expect(fact.content?.body).toContain('Fix the auth bug');
    expect(fact.content?.body).toContain('Auth is broken on mobile');
    expect(fact.authors[0]!.sourceUserId).toBe('acc-reporter');
    expect(fact.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(fact.sourceThreadId).toBe('PROJ-42');
    expect(fact.containerRefs).toContain('PROJ-42');
  });

  it('extracts URLs and Jira issue keys as explicit links', () => {
    const fact = normalizeJiraIssueEvent(issueEvent('jira:issue_created')).facts[0]!;
    expect(fact.content?.explicitLinks).toContain('PROJ-7');
    expect(fact.content?.explicitLinks).toContain('https://x.test/a');
  });

  it('exposes the issue key as the structural entity', () => {
    const fact = normalizeJiraIssueEvent(issueEvent('jira:issue_created')).facts[0]!;
    expect(fact.entities).toEqual(['PROJ-42']);
  });
});

describe('normalizeJiraIssueEvent — updated', () => {
  it('emits a transition fact only when the changelog shows a status change', () => {
    const event = issueEvent(
      'jira:issue_updated',
      makeIssue(),
      statusChangelog('In Progress', 'Done'),
    );
    const result = normalizeJiraIssueEvent(event);
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    const fact = result.facts[0]!;
    expect(fact.kind).toBe('transition');
    expect(fact.transition?.transitionType).toBe('closed');
    expect(fact.transition?.detail).toMatchObject({
      field: 'status',
      from: 'In Progress',
      to: 'Done',
    });
    expect(fact.entities).toEqual(['PROJ-42']);
  });

  it('maps a new status category to reopened', () => {
    const issue = makeIssue({ status: { name: 'To Do', statusCategory: { key: 'new' } } });
    const event = issueEvent('jira:issue_updated', issue, statusChangelog('Done', 'To Do'));
    const fact = normalizeJiraIssueEvent(event).facts[0]!;
    expect(fact.transition?.transitionType).toBe('reopened');
  });

  it('emits a content fact (not a status transition) when the edit is not a status change', () => {
    const event = issueEvent('jira:issue_updated', makeIssue(), {
      items: [{ field: 'description', fromString: 'old', toString: 'new' }],
    });
    const result = normalizeJiraIssueEvent(event);
    expect(result.facts).toHaveLength(1);
    const fact = result.facts[0]!;
    expect(fact.kind).toBe('content');
    expect(fact.content?.body).toContain('Fix the auth bug');
  });

  it('emits a content fact when an update carries no changelog (e.g. a pull with no history)', () => {
    const result = normalizeJiraIssueEvent(issueEvent('jira:issue_updated'));
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
    expect(result.facts.some((f) => f.kind === 'transition')).toBe(false);
  });
});

describe('normalizeJiraCommentEvent', () => {
  it('produces one content fact referencing the parent issue', () => {
    const result = normalizeJiraCommentEvent(commentEvent());
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    const fact = result.facts[0]!;
    expect(fact.kind).toBe('content');
    expect(fact.content?.body).toBe('Looks good to me!');
    expect(fact.containerRefs).toContain('PROJ-42');
    expect(fact.sourceThreadId).toBe('PROJ-42');
    expect(fact.authors[0]!.sourceUserId).toBe('acc-assignee');
    expect(fact.sourceFactId).toContain('comment-9');
    expect(fact.entities).toEqual(['PROJ-42']);
  });
});

describe('JiraConnector.normalizeWebhook', () => {
  const connector = new JiraConnector(
    { logger: new PinoLogger({ level: 'silent' }) },
    {} as JiraApiClient,
  );

  it('routes issue_created to a container + content fact', () => {
    const result = connector.normalizeWebhook({
      type: 'jira:issue_created',
      payload: issueEvent('jira:issue_created'),
    });
    expect(result.containers).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('routes comment_updated to a content fact', () => {
    const result = connector.normalizeWebhook({
      type: 'comment_updated',
      payload: { ...commentEvent(), webhookEvent: 'comment_updated' },
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.content?.body).toBe('Looks good to me!');
  });

  it('ignores unknown events', () => {
    const result = connector.normalizeWebhook({ type: 'jira:worklog_updated', payload: {} });
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });
});

class FakeJiraClient implements JiraApiClient {
  issueSinceArgs: Array<string | undefined> = [];
  commentSinceArgs: Array<string | undefined> = [];

  constructor(private readonly issues: JiraIssue[]) {}

  async listProjects() {
    return [{ id: 'p-1', key: 'PROJ', name: 'Project', isPrivate: false }];
  }

  async listIssues(updatedSince?: string) {
    this.issueSinceArgs.push(updatedSince);
    return this.issues;
  }

  async listComments(_issueKey: string, updatedSince?: string) {
    this.commentSinceArgs.push(updatedSince);
    return [makeComment()];
  }
}

describe('JiraConnector.pull', () => {
  function twoIssues(): JiraIssue[] {
    const issueB = makeIssue({ updated: '2026-01-05T00:00:00.000Z' });
    issueB.key = 'PROJ-43';
    issueB.id = 'issue-2';
    return [makeIssue(), issueB];
  }

  it('treats an empty incremental response as successful and preserves its cursor', async () => {
    const client = new FakeJiraClient([]);
    const connector = new JiraConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);

    const result = await connector.pull({ value: '2026-06-01T10:00:00.000Z' });

    expect(result.facts).toEqual([]);
    expect(result.containers).toEqual([]);
    expect(result.cursor.value).toBe('2026-06-01T10:00:00.000Z');
  });

  it('does not report success when the Jira provider fails', async () => {
    const providerFailure = new Error('jira_provider_failed');
    const client = new FakeJiraClient([]);
    client.listIssues = async () => {
      throw providerFailure;
    };
    const connector = new JiraConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);

    await expect(connector.pull({ value: '2026-06-01T10:00:00.000Z' })).rejects.toMatchObject({
      code: 'external_service_error',
      component: 'jira',
    });
  });

  it('seeds a container per issue on a from-scratch pull and advances the cursor to the max updated time', async () => {
    const client = new FakeJiraClient(twoIssues());
    const connector = new JiraConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);

    const result = await connector.pull({ value: null });

    expect(client.issueSinceArgs[0]).toBeUndefined();
    expect(result.containers).toHaveLength(2);
    expect(result.cursor.value).toBe('2026-01-05T00:00:00.000Z');
    // two issue seed facts + one comment fact per issue
    expect(result.facts.filter((f) => f.kind === 'content')).toHaveLength(4);
  });

  it('seeds a container + content fact for an issue created inside the enclave 12-month window (HIGH-1)', async () => {
    // The enclave ALWAYS sets options.since; an issue born within the window is still a create.
    const client = new FakeJiraClient([makeIssue()]);
    const connector = new JiraConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);

    const result = await connector.pull(
      { value: null },
      { since: new Date('2025-06-01T00:00:00Z') },
    );

    expect(client.issueSinceArgs[0]).toBe('2025-06-01T00:00:00.000Z');
    expect(result.containers).toHaveLength(1);
    const seed = result.facts.find((f) => f.sourceFactId.startsWith('jira:issue:created:'));
    expect(seed?.kind).toBe('content');
    expect(seed?.content?.body).toContain('Fix the auth bug');
  });

  it('treats an issue only updated within the window as a content edit, and threads the cursor as since', async () => {
    // Issue created 2026-01-01 but the cursor (since) is later → update path, no spurious transition.
    const client = new FakeJiraClient([makeIssue()]);
    const connector = new JiraConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);

    const result = await connector.pull({ value: '2026-01-01T12:00:00.000Z' });

    expect(client.issueSinceArgs[0]).toBe('2026-01-01T12:00:00.000Z');
    expect(client.commentSinceArgs[0]).toBe('2026-01-01T12:00:00.000Z');
    expect(result.facts.some((f) => f.kind === 'transition')).toBe(false);
    expect(result.facts.some((f) => f.sourceFactId.startsWith('jira:issue:edited:'))).toBe(true);
    expect(result.containers).toHaveLength(0);
  });
});
