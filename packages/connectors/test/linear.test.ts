// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import {
  LinearConnector,
  linearIssueContainerId,
  normalizeLinearCommentEvent,
  normalizeLinearIssueEvent,
} from '../src/linear/index.js';
import type {
  LinearApiClient,
  LinearCommentEvent,
  LinearIssue,
  LinearIssueEvent,
  LinearTeam,
  LinearUser,
} from '../src/linear/index.js';

const TEAM: LinearTeam = { id: 'team-uuid', name: 'Engineering', key: 'ENG' };
const USER: LinearUser = { id: 'user-uuid', name: 'Alice', email: 'alice@example.com' };

function makeIssueEvent(action: 'create' | 'update' = 'create'): LinearIssueEvent {
  return {
    type: 'Issue',
    action,
    createdAt: '2026-01-01T00:00:00Z',
    organizationId: 'org-uuid',
    data: {
      id: 'issue-uuid',
      number: 42,
      title: 'Fix the auth bug',
      description: 'Auth is broken on mobile.',
      priority: 1,
      state: { name: 'In Progress', type: 'started' },
      assignee: USER,
      team: TEAM,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  };
}

function makeCommentEvent(): LinearCommentEvent {
  return {
    type: 'Comment',
    action: 'create',
    createdAt: '2026-01-03T00:00:00Z',
    organizationId: 'org-uuid',
    data: {
      id: 'comment-uuid',
      body: 'Looks good to me!',
      issue: { id: 'issue-uuid', number: 42, team: TEAM },
      user: USER,
      createdAt: '2026-01-03T00:00:00Z',
    },
  };
}

describe('linearIssueContainerId', () => {
  it('formats as {TEAM_KEY}-{number}', () => {
    expect(linearIssueContainerId(TEAM, 42)).toBe('ENG-42');
  });
});

describe('normalizeLinearIssueEvent — create', () => {
  it('produces one container and one content fact', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('create'));
    expect(result.containers).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('container has label linear_issue and shape stateful', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('create'));
    expect(result.containers[0]).toMatchObject({
      label: 'linear_issue',
      shape: 'stateful',
    });
  });

  it('container sourceContainerId is {TEAM}-{number}', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('create'));
    expect(result.containers[0]!.sourceContainerId).toBe('ENG-42');
  });

  it('fact containerRefs and sourceThreadId reference the issue container', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('create'));
    expect(result.facts[0]!.containerRefs).toContain('ENG-42');
    expect(result.facts[0]!.sourceThreadId).toBe('ENG-42');
  });

  it('exposes the issue key as the structural entity', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('create'));
    expect(result.facts[0]!.entities).toEqual(['ENG-42']);
  });

  it('routes both the container and the seed fact to the team resource', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('create'));
    expect(result.containers[0]!.resourceExternalId).toBe('team-uuid');
    expect(result.facts[0]!.resourceExternalId).toBe('team-uuid');
  });

  it('attributes the seed fact to the assignee and folds title + description into the body', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('create'));
    expect(result.facts[0]!.authors).toEqual([{ sourceUserId: 'user-uuid', role: 'author' }]);
    expect(result.facts[0]!.content?.body).toBe('Fix the auth bug\n\nAuth is broken on mobile.');
  });

  it('emits an unattributed create fact when the issue has no assignee', () => {
    const event = makeIssueEvent('create');
    delete event.data.assignee;
    const result = normalizeLinearIssueEvent(event);
    expect(result.facts[0]!.authors).toEqual([]);
    expect(result.facts[0]!.content?.body).toContain('Fix the auth bug');
  });
});

describe('normalizeLinearIssueEvent — update', () => {
  it('produces no container and one transition fact', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('update'));
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('transition');
  });

  it('transition fact keeps the issue key as its structural entity', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('update'));
    expect(result.facts[0]!.entities).toEqual(['ENG-42']);
  });

  it('transition fact has transitionType updated', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('update'));
    expect(result.facts[0]!.transition?.transitionType).toBe('updated');
  });

  it('carries the target workflow state in the transition detail', () => {
    const event = makeIssueEvent('update');
    event.data.state = { name: 'Done', type: 'completed' };
    const result = normalizeLinearIssueEvent(event);
    expect(result.facts[0]!.transition?.detail).toEqual({ field: 'state', to: 'Done' });
  });

  it('stamps the transition at the issue updatedAt, not the event createdAt', () => {
    const result = normalizeLinearIssueEvent(makeIssueEvent('update'));
    expect(result.facts[0]!.occurredAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('gives each status change a distinct sourceFactId keyed by updatedAt', () => {
    const first = makeIssueEvent('update');
    const second = makeIssueEvent('update');
    second.data.updatedAt = '2026-01-03T00:00:00Z';
    const a = normalizeLinearIssueEvent(first).facts[0]!.sourceFactId;
    const b = normalizeLinearIssueEvent(second).facts[0]!.sourceFactId;
    expect(a).not.toBe(b);
  });
});

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-uuid',
    number: 42,
    title: 'Fix the auth bug',
    description: 'Auth is broken on mobile.',
    priority: 1,
    state: { name: 'In Progress', type: 'started' },
    assignee: USER,
    team: TEAM,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

class FakeLinearClient implements LinearApiClient {
  issueSinceArgs: Array<string | undefined> = [];

  constructor(private readonly issues: LinearIssue[]) {}

  async listIssues(updatedSince?: string) {
    this.issueSinceArgs.push(updatedSince);
    return this.issues;
  }

  async listComments() {
    return [];
  }
}

describe('LinearConnector.pull', () => {
  function connectorFor(issues: LinearIssue[]) {
    const client = new FakeLinearClient(issues);
    const connector = new LinearConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);
    return { client, connector };
  }

  it('seeds a container + content body for an issue created inside the enclave 12-month window', async () => {
    // Regression: the enclave ALWAYS sets options.since, so the old `since ? 'update' : 'create'`
    // buried every backfilled issue as a bodyless transition. An in-window issue is a create.
    const { client, connector } = connectorFor([makeIssue()]);

    const result = await connector.pull(
      { value: null },
      { since: new Date('2025-06-01T00:00:00Z') },
    );

    expect(client.issueSinceArgs[0]).toBe('2025-06-01T00:00:00.000Z');
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0]!.label).toBe('linear_issue');
    const seed = result.facts.find((f) => f.sourceFactId.startsWith('linear:issue:created:'));
    expect(seed?.kind).toBe('content');
    expect(seed?.content?.body).toContain('Fix the auth bug');
    expect(seed?.content?.body).toContain('Auth is broken on mobile.');
    expect(seed?.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('treats an issue only updated within the window as a bodyless transition', async () => {
    const { connector } = connectorFor([makeIssue()]);

    const result = await connector.pull({ value: '2026-06-01T00:00:00.000Z' });

    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('transition');
  });
});

describe('normalizeLinearCommentEvent', () => {
  it('produces no container and one content fact', () => {
    const result = normalizeLinearCommentEvent(makeCommentEvent());
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('fact references the parent issue container', () => {
    const result = normalizeLinearCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.containerRefs).toContain('ENG-42');
    expect(result.facts[0]!.sourceThreadId).toBe('ENG-42');
  });

  it('fact sourceFactId contains the comment id', () => {
    const result = normalizeLinearCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.sourceFactId).toContain('comment-uuid');
  });

  it('fact author is the comment user', () => {
    const result = normalizeLinearCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.authors[0]!.sourceUserId).toBe('user-uuid');
  });

  it('comment fact carries the parent issue key as its structural entity', () => {
    const result = normalizeLinearCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.entities).toEqual(['ENG-42']);
  });

  it('routes the comment fact to the parent issue team resource', () => {
    const result = normalizeLinearCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.resourceExternalId).toBe('team-uuid');
  });
});

describe('LinearConnector.normalizeWebhook', () => {
  function connector() {
    const client: LinearApiClient = {
      async listIssues() {
        return [];
      },
      async listComments() {
        return [];
      },
    };
    return new LinearConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);
  }

  it('dispatches an Issue create webhook to a container + content fact', () => {
    const result = connector().normalizeWebhook({
      type: 'Issue',
      payload: makeIssueEvent('create'),
    });
    expect(result.containers).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('dispatches an Issue update webhook to a status transition fact', () => {
    const result = connector().normalizeWebhook({
      type: 'Issue',
      payload: makeIssueEvent('update'),
    });
    expect(result.containers).toHaveLength(0);
    expect(result.facts[0]!.kind).toBe('transition');
  });

  it('dispatches a Comment webhook to a content fact on the parent issue', () => {
    const result = connector().normalizeWebhook({ type: 'Comment', payload: makeCommentEvent() });
    expect(result.facts[0]!.kind).toBe('content');
    expect(result.facts[0]!.containerRefs).toContain('ENG-42');
  });

  it('ignores an unknown webhook type (fail closed to no records)', () => {
    const result = connector().normalizeWebhook({
      type: 'Reaction',
      payload: { type: 'Reaction' },
    });
    expect(result).toEqual({ containers: [], facts: [] });
  });
});
