// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ExternalServiceError, RateLimitError } from '@folklore/errors';
import { PinoLogger } from '@folklore/logger';
import { LinearRateLimitedError, LinearRequestError } from '../src/linear/client.js';
import { LinearConnector, LINEAR_DEFAULT_LOOKBACK_MS } from '../src/linear/LinearConnector.js';
import { linearFactKeys } from '../src/linear/canonical.js';
import { normalizeLinearPulledIssue } from '../src/linear/normalize.js';
import type { PullOptions, PullResult } from '../src/connector.js';
import type { NormalizedFact } from '../src/normalized.js';
import { FakeLinearApi } from './doubles/linear/FakeLinearApi.js';
import {
  NOW,
  TEAM_ID,
  commentNode,
  cycleNode,
  daysAgo,
  historyNode,
  issueNode,
  page,
  projectNode,
} from './fixtures/linear.js';

const MINUTE_MS = 60_000;

function connectorFor(fake: FakeLinearApi, clock: { now: Date } = { now: NOW }): LinearConnector {
  return new LinearConnector(
    { logger: new PinoLogger({ level: 'silent' }) },
    fake,
    () => clock.now,
  );
}

function pullFresh(fake: FakeLinearApi, options?: PullOptions): Promise<PullResult> {
  return connectorFor(fake).pull({ value: null }, options);
}

function factIds(result: PullResult): string[] {
  return result.facts.map((fact) => fact.sourceFactId);
}

function factById(result: PullResult, sourceFactId: string): NormalizedFact {
  const fact = result.facts.find((candidate) => candidate.sourceFactId === sourceFactId);
  if (!fact) throw new Error(`missing fact ${sourceFactId}`);
  return fact;
}

function ms(iso: string): number {
  return Date.parse(iso);
}

function richWorld(): FakeLinearApi {
  const fake = new FakeLinearApi();
  fake.issueNodes = [
    issueNode({
      id: 'issue-a',
      identifier: 'ENG-42',
      title: 'Fix the auth bug',
      description:
        'Auth is broken. See https://linear.app/acme/issue/ENG-43/refactor-the-login-flow-for-mobile and mail alice@example.com',
      createdAt: daysAgo(5),
      updatedAt: daysAgo(1),
      history: page([
        historyNode({
          id: 'h-state',
          createdAt: daysAgo(4),
          fromStateId: 's1',
          toStateId: 's2',
          toState: { type: 'started' },
        }),
        historyNode({
          id: 'h-multi',
          createdAt: daysAgo(3),
          fromAssigneeId: null,
          toAssigneeId: 'user-9',
          fromPriority: 0,
          toPriority: 2,
        }),
        historyNode({
          id: 'h-title',
          createdAt: daysAgo(2),
          fromTitle: 'Fix auth',
          toTitle: 'Fix the auth bug',
        }),
        historyNode({ id: 'h-labels', createdAt: daysAgo(1), addedLabelIds: ['label-1'] }),
      ]),
    }),
    issueNode({
      id: 'issue-b',
      identifier: 'ENG-44',
      title: 'Plan the secret migration',
      description: null,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(6),
      project: null,
      cycle: null,
    }),
    issueNode({
      id: 'issue-c',
      identifier: 'ENG-45',
      title: 'Retire legacy export',
      createdAt: daysAgo(8),
      updatedAt: daysAgo(2),
      archivedAt: daysAgo(2),
    }),
    issueNode({ id: 'issue-bad', identifier: 'not a key', updatedAt: daysAgo(3) }),
  ];
  fake.commentNodes = [
    commentNode({
      id: 'c-plain',
      body: 'Looks fine, ping bob@example.com',
      createdAt: daysAgo(4),
      updatedAt: daysAgo(4),
    }),
    commentNode({
      id: 'c-edited',
      body: 'Revised comment text',
      createdAt: daysAgo(5),
      editedAt: daysAgo(2),
      updatedAt: daysAgo(2),
    }),
    commentNode({
      id: 'c-resolved',
      body: 'Resolved comment text',
      createdAt: daysAgo(5),
      resolvedAt: daysAgo(1),
      updatedAt: daysAgo(1),
    }),
    commentNode({
      id: 'c-bot',
      body: 'Automated comment text',
      user: null,
      botActor: { type: 'integration' },
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
    }),
    commentNode({ id: 'c-orphan', issue: null, updatedAt: daysAgo(3) }),
  ];
  fake.projectNodes = [
    projectNode({
      id: 'project-1',
      createdAt: daysAgo(30),
      updatedAt: daysAgo(1),
      completedAt: daysAgo(1),
    }),
    projectNode({
      id: 'project-2',
      name: 'Dropped experiment',
      createdAt: daysAgo(20),
      updatedAt: daysAgo(2),
      canceledAt: daysAgo(2),
    }),
  ];
  fake.cycleNodes = [
    cycleNode({
      id: 'cycle-1',
      number: 7,
      createdAt: daysAgo(14),
      updatedAt: daysAgo(1),
      completedAt: daysAgo(1),
    }),
  ];
  return fake;
}

describe('LinearConnector.pull issues', () => {
  it('seeds a container, a created fact and history-keyed transitions', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [
      issueNode({
        updatedAt: daysAgo(3),
        history: page([
          historyNode({
            id: 'h1',
            createdAt: daysAgo(4),
            fromStateId: 's1',
            toStateId: 's2',
            toState: { type: 'started' },
          }),
          historyNode({ id: 'h2', createdAt: daysAgo(3), toAssigneeId: 'user-9' }),
        ]),
      }),
    ];

    const result = await pullFresh(fake);

    expect(result.containers).toEqual([
      {
        sourceContainerId: 'ENG-42',
        shape: 'stateful',
        label: 'linear_issue',
        resourceExternalId: TEAM_ID,
      },
    ]);
    expect(factIds(result)).toEqual([
      'linear:issue:created:issue-1',
      'linear:issue:state:h1',
      'linear:issue:assignee:h2',
    ]);
    const created = factById(result, 'linear:issue:created:issue-1');
    expect(created).toMatchObject({
      kind: 'content',
      resourceExternalId: TEAM_ID,
      containerRefs: ['ENG-42'],
      sourceThreadId: 'ENG-42',
      entities: ['ENG-42', 'linear:project:project-1', 'linear:cycle:cycle-1'],
      authors: [{ sourceUserId: 'user-1', role: 'author' }],
      raw: { entity: 'issue', id: 'issue-1' },
    });
    expect(created.content?.body).toBe('Fix the auth bug\n\nAuth is broken on mobile.');
    const state = factById(result, 'linear:issue:state:h1');
    expect(state).toMatchObject({
      kind: 'transition',
      authors: [{ sourceUserId: 'user-2', role: 'author' }],
      transition: { transitionType: 'started', detail: { field: 'state', from: 's1', to: 's2' } },
    });
  });

  it('emits only the edit fact for an issue created and edited inside the window', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [
      issueNode({
        title: 'Fix the auth bug',
        updatedAt: daysAgo(2),
        history: page([
          historyNode({
            id: 'h-edit',
            createdAt: daysAgo(2),
            actorId: 'user-7',
            fromTitle: 'Fix auth',
            toTitle: 'Fix the auth bug',
          }),
        ]),
      }),
    ];

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual(['linear:issue:edited:issue-1:h-edit']);
    const edit = factById(result, 'linear:issue:edited:issue-1:h-edit');
    expect(edit.content?.body).toBe('Fix the auth bug\n\nAuth is broken on mobile.');
    expect(edit.authors).toEqual([{ sourceUserId: 'user-7', role: 'author' }]);
    expect(edit.occurredAt.toISOString()).toBe(daysAgo(2));
  });

  it('emits only the latest of several in-window edits for an issue created earlier', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [
      issueNode({
        createdAt: daysAgo(30),
        updatedAt: daysAgo(2),
        history: page([
          historyNode({ id: 'h-a', createdAt: daysAgo(4), updatedDescription: true }),
          historyNode({ id: 'h-b', createdAt: daysAgo(2), updatedDescription: true }),
        ]),
      }),
    ];

    const result = await pullFresh(fake, { since: new Date(daysAgo(10)) });

    expect(factIds(result)).toEqual(['linear:issue:edited:issue-1:h-b']);
  });

  it('keeps a history entry at or before the emit bound out and one after it in', () => {
    const emitAfterMs = ms(daysAgo(3));
    const issue = issueNode({
      createdAt: daysAgo(30),
      history: page([
        historyNode({ id: 'h-at', createdAt: daysAgo(3), toAssigneeId: 'user-a' }),
        historyNode({
          id: 'h-after',
          createdAt: new Date(emitAfterMs + 1).toISOString(),
          toAssigneeId: 'user-b',
        }),
      ]),
    });

    const records = normalizeLinearPulledIssue(issue, issue.history.nodes, {
      emitAfterMs,
      floorMs: 0,
    });

    expect(records.facts.map((fact) => fact.sourceFactId)).toEqual([
      'linear:issue:assignee:h-after',
    ]);
  });

  it('repairs an item the previous slice missed using the slice before it as the emit bound', async () => {
    const clock = { now: NOW };
    const fake = new FakeLinearApi();
    const connector = connectorFor(fake, clock);
    const first = await connector.pull({ value: null });
    clock.now = new Date(NOW.getTime() + 15 * MINUTE_MS);
    const second = await connector.pull(first.cursor);
    clock.now = new Date(NOW.getTime() + 30 * MINUTE_MS);
    fake.issueNodes = [
      issueNode({
        createdAt: daysAgo(30),
        updatedAt: new Date(NOW.getTime() + 25 * MINUTE_MS).toISOString(),
        history: page([
          historyNode({
            id: 'h-missed',
            createdAt: new Date(NOW.getTime() + 5 * MINUTE_MS).toISOString(),
            toAssigneeId: 'user-a',
          }),
          historyNode({
            id: 'h-old',
            createdAt: new Date(NOW.getTime() - 3 * MINUTE_MS).toISOString(),
            toAssigneeId: 'user-b',
          }),
        ]),
      }),
    ];

    const third = await connector.pull(second.cursor);

    expect(factIds(third)).toEqual(['linear:issue:assignee:h-missed']);
  });

  it('stops at the fact budget and resumes with the rest', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = ['a', 'b', 'c', 'd', 'e'].map((suffix) =>
      issueNode({ id: `issue-${suffix}`, identifier: `ENG-${suffix.charCodeAt(0)}` }),
    );
    const connector = connectorFor(fake);

    const first = await connector.pull({ value: null }, { maxFacts: 3 });
    const second = await connector.pull(first.cursor, { maxFacts: 3 });

    expect(first.facts).toHaveLength(3);
    expect(first.hasMore).toBe(true);
    expect(second.facts).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(new Set([...factIds(first), ...factIds(second)]).size).toBe(5);
  });

  it('fetches overflow history until the last page', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [
      issueNode({
        updatedAt: daysAgo(1),
        history: page(
          [
            historyNode({ id: 'h1', createdAt: daysAgo(4), toAssigneeId: 'user-a' }),
            historyNode({ id: 'h2', createdAt: daysAgo(3), toAssigneeId: 'user-b' }),
          ],
          '0',
        ),
      }),
    ];
    fake.historyOverflow.set('issue-1', [
      historyNode({ id: 'h3', createdAt: daysAgo(2), toAssigneeId: 'user-c' }),
      historyNode({ id: 'h4', createdAt: daysAgo(1), toAssigneeId: 'user-d' }),
      historyNode({ id: 'h5', createdAt: daysAgo(1), toAssigneeId: 'user-e' }),
    ]);

    const result = await pullFresh(fake);

    expect(fake.issueHistoryCalls).toBe(2);
    expect(factIds(result)).toEqual(
      expect.arrayContaining([
        'linear:issue:assignee:h1',
        'linear:issue:assignee:h2',
        'linear:issue:assignee:h3',
        'linear:issue:assignee:h4',
      ]),
    );
  });

  it('emits an archive transition with no author', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [
      issueNode({ createdAt: daysAgo(30), updatedAt: daysAgo(1), archivedAt: daysAgo(1) }),
    ];

    const result = await pullFresh(fake, { since: new Date(daysAgo(10)) });

    const archived = factById(result, `linear:issue:archived:issue-1:${ms(daysAgo(1))}`);
    expect(archived).toMatchObject({
      kind: 'transition',
      authors: [],
      transition: { transitionType: 'archived' },
    });
  });
});

describe('LinearConnector.pull limits and failures', () => {
  it('returns a partial pull when the complexity guard trips', async () => {
    const fake = new FakeLinearApi();
    fake.projectNodes = [projectNode({ createdAt: daysAgo(2), updatedAt: daysAgo(2) })];
    fake.issueNodes = [issueNode()];
    fake.complexityAfterFirstRequest = 10_000;

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual(['linear:project:created:project-1']);
    expect(result.hasMore).toBe(true);
  });

  it('returns the facts it has when comments are rate limited', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [issueNode()];
    fake.commentNodes = [commentNode()];
    fake.failures.comments = new LinearRateLimitedError();

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual(['linear:issue:created:issue-1']);
    expect(result.hasMore).toBe(true);
    expect(JSON.parse(result.cursor.value ?? '{}').w.comments).toEqual({
      wm: null,
      emitAfter: null,
      slice: null,
    });
  });

  it('throws a rate-limit error when rate limited before any fact', async () => {
    const fake = new FakeLinearApi();
    fake.failures.projects = new LinearRateLimitedError();

    await expect(pullFresh(fake)).rejects.toBeInstanceOf(RateLimitError);
  });

  it('exposes a 401 through the cause so the runner can refresh', async () => {
    const fake = new FakeLinearApi();
    fake.failures.issues = new LinearRequestError('linear_unauthorized', 401);

    const error = await pullFresh(fake).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ExternalServiceError);
    expect((error as { cause?: { status?: number } }).cause?.status).toBe(401);
  });

  it('keeps the facts of the other streams when one stream keeps failing', async () => {
    const fake = new FakeLinearApi();
    fake.projectNodes = [projectNode({ createdAt: daysAgo(2), updatedAt: daysAgo(2) })];
    fake.issueNodes = [issueNode()];
    fake.commentNodes = [commentNode()];
    fake.failures.cycles = new LinearRequestError('linear_graphql_error');

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual([
      'linear:project:created:project-1',
      'linear:issue:created:issue-1',
      'linear:comment:comment-1',
    ]);
    expect(result.hasMore).toBe(false);
    const written = JSON.parse(result.cursor.value ?? '{}').w;
    expect(written.cycles).toEqual({ wm: null, emitAfter: null, slice: null });
    expect(written.issues.wm).not.toBeNull();
    expect(written.comments.wm).not.toBeNull();
  });

  it('retries the failed stream on the next pull while the others stay caught up', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [issueNode()];
    fake.cycleNodes = [cycleNode()];
    fake.failures.cycles = new LinearRequestError('linear_graphql_error');
    const connector = connectorFor(fake);
    const first = await connector.pull({ value: null });
    delete fake.failures.cycles;

    const second = await connector.pull(first.cursor);

    expect(factIds(first)).toEqual(['linear:issue:created:issue-1']);
    expect(factIds(second).some((id) => id.startsWith('linear:cycle:'))).toBe(true);
    expect(factIds(second)).not.toContain('linear:issue:created:issue-1');
  });

  it('discards a failing stream partial facts but keeps those collected before it', async () => {
    const fake = new FakeLinearApi(1);
    fake.projectNodes = [projectNode({ createdAt: daysAgo(2), updatedAt: daysAgo(2) })];
    fake.issueNodes = ['a', 'b'].map((suffix) =>
      issueNode({ id: `issue-${suffix}`, identifier: `ENG-${suffix.charCodeAt(0)}` }),
    );
    fake.failureAtCursor = {
      stream: 'issues',
      after: '1',
      error: new LinearRequestError('linear_graphql_error'),
    };

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual(['linear:project:created:project-1']);
    expect(JSON.parse(result.cursor.value ?? '{}').w.issues).toEqual({
      wm: null,
      emitAfter: null,
      slice: null,
    });
  });

  it('isolates a history failure during emit without restarting the stream from page one', async () => {
    const fake = new FakeLinearApi();
    fake.projectNodes = [projectNode({ createdAt: daysAgo(2), updatedAt: daysAgo(2) })];
    fake.issueNodes = [
      issueNode({ history: { nodes: [], pageInfo: { hasNextPage: true, endCursor: '0' } } }),
    ];
    fake.historyFailure = new LinearRequestError('linear_cursor_invalid');

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual(['linear:project:created:project-1']);
    expect(fake.windows.filter((entry) => entry.stream === 'issues')).toHaveLength(1);
  });

  it('throws a rate-limit error when the guard stops a pull that collected no facts', async () => {
    const fake = new FakeLinearApi();
    fake.complexityAfterFirstRequest = 10_000;

    await expect(pullFresh(fake)).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws when every stream fails', async () => {
    const fake = new FakeLinearApi();
    for (const stream of ['projects', 'cycles', 'issues', 'comments'] as const) {
      fake.failures[stream] = new LinearRequestError('linear_graphql_error');
    }

    await expect(pullFresh(fake)).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('still throws an unauthorized failure instead of isolating it', async () => {
    const fake = new FakeLinearApi();
    fake.projectNodes = [projectNode({ createdAt: daysAgo(2), updatedAt: daysAgo(2) })];
    fake.failures.issues = new LinearRequestError('linear_unauthorized', 401);

    await expect(pullFresh(fake)).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('resets a stale cursor without emitting the same fact twice', async () => {
    const fake = new FakeLinearApi(1);
    fake.issueNodes = ['a', 'b', 'c'].map((suffix) =>
      issueNode({ id: `issue-${suffix}`, identifier: `ENG-${suffix.charCodeAt(0)}` }),
    );
    fake.staleCursorOnce = { stream: 'issues', after: '2' };
    const connector = connectorFor(fake);
    const startedAtMs = NOW.getTime();
    const cursor = {
      value: JSON.stringify({
        v: 1,
        w: {
          projects: { wm: null, emitAfter: null, slice: null },
          cycles: { wm: null, emitAfter: null, slice: null },
          issues: {
            wm: null,
            emitAfter: null,
            slice: { untilMs: startedAtMs - 2 * MINUTE_MS, after: '1', lastId: null },
          },
          comments: { wm: null, emitAfter: null, slice: null },
        },
      }),
    };

    const result = await connector.pull(cursor);

    const ids = factIds(result);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it('floors an undefined option at a year back and terminates', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [
      issueNode({ id: 'old', identifier: 'ENG-1', createdAt: daysAgo(400), updatedAt: daysAgo(1) }),
      issueNode({ id: 'new', identifier: 'ENG-2', createdAt: daysAgo(10), updatedAt: daysAgo(10) }),
    ];

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual(['linear:issue:created:new']);
    const floor = NOW.getTime() - LINEAR_DEFAULT_LOOKBACK_MS;
    expect(fake.windows.every((entry) => entry.window.gtMs === floor - 1)).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it('deduplicates containers across issue and comment facts', async () => {
    const fake = new FakeLinearApi();
    fake.issueNodes = [issueNode()];
    fake.commentNodes = [commentNode(), commentNode({ id: 'comment-2' })];

    const result = await pullFresh(fake);

    expect(result.facts).toHaveLength(3);
    expect(result.containers.filter((c) => c.sourceContainerId === 'ENG-42')).toHaveLength(1);
  });
});

describe('LinearConnector.pull comments', () => {
  const SINCE = { since: new Date(daysAgo(10)) };

  it('emits a created comment with its issue container and team resource', async () => {
    const fake = new FakeLinearApi();
    fake.commentNodes = [commentNode({ id: 'c-a' })];

    const result = await pullFresh(fake, SINCE);

    expect(factById(result, 'linear:comment:c-a')).toMatchObject({
      kind: 'content',
      authors: [{ sourceUserId: 'user-3', role: 'author' }],
      containerRefs: ['ENG-42'],
      resourceExternalId: TEAM_ID,
      entities: ['ENG-42'],
    });
    expect(factById(result, 'linear:comment:c-a').content?.body).toBe('Looks good to me!');
  });

  it('emits only the edit for a comment created and edited in the window', async () => {
    const fake = new FakeLinearApi();
    fake.commentNodes = [
      commentNode({ id: 'c-b', editedAt: daysAgo(1), updatedAt: daysAgo(1), body: 'Edited text' }),
    ];

    const result = await pullFresh(fake, SINCE);

    expect(factIds(result)).toEqual([`linear:comment:edited:c-b:${ms(daysAgo(1))}`]);
    expect(result.facts[0]?.content?.body).toBe('Edited text');
  });

  it('emits only the edit for a comment created before the window', async () => {
    const fake = new FakeLinearApi();
    fake.commentNodes = [
      commentNode({
        id: 'c-c',
        createdAt: daysAgo(40),
        editedAt: daysAgo(1),
        updatedAt: daysAgo(1),
      }),
    ];

    const result = await pullFresh(fake, SINCE);

    expect(factIds(result)).toEqual([`linear:comment:edited:c-c:${ms(daysAgo(1))}`]);
  });

  it('emits a resolved transition after the created fact', async () => {
    const fake = new FakeLinearApi();
    fake.commentNodes = [commentNode({ id: 'c-d', resolvedAt: daysAgo(1), updatedAt: daysAgo(1) })];

    const result = await pullFresh(fake, SINCE);

    expect(factIds(result)).toEqual([
      'linear:comment:c-d',
      `linear:comment:resolved:c-d:${ms(daysAgo(1))}`,
    ]);
    expect(result.facts[1]).toMatchObject({
      kind: 'transition',
      authors: [],
      transition: { transitionType: 'resolved' },
    });
  });

  it('skips a comment with no issue', async () => {
    const fake = new FakeLinearApi();
    fake.commentNodes = [commentNode({ id: 'c-e', issue: null })];

    expect((await pullFresh(fake, SINCE)).facts).toEqual([]);
  });

  it('keeps a bot comment with no authors and a real issue key', async () => {
    const fake = new FakeLinearApi();
    fake.commentNodes = [commentNode({ id: 'c-f', user: null, botActor: { type: 'integration' } })];

    const result = await pullFresh(fake, SINCE);

    expect(factIds(result)).toEqual(['linear:comment:c-f']);
    expect(result.facts[0]?.authors).toEqual([]);
    expect(result.facts[0]?.containerRefs).toEqual(['ENG-42']);
  });
});

describe('LinearConnector.pull projects and cycles', () => {
  it('emits project created and closed facts with no resource', async () => {
    const fake = new FakeLinearApi();
    fake.projectNodes = [
      projectNode({
        id: 'p-1',
        createdAt: daysAgo(2),
        updatedAt: daysAgo(1),
        completedAt: daysAgo(1),
      }),
      projectNode({
        id: 'p-2',
        createdAt: daysAgo(40),
        updatedAt: daysAgo(1),
        canceledAt: daysAgo(1),
      }),
    ];

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual([
      'linear:project:created:p-1',
      `linear:project:closed:p-1:${ms(daysAgo(1))}`,
      'linear:project:created:p-2',
      `linear:project:closed:p-2:${ms(daysAgo(1))}`,
    ]);
    expect(result.containers).toEqual([
      { sourceContainerId: 'linear:project:p-1', shape: 'stateful', label: 'linear_project' },
      { sourceContainerId: 'linear:project:p-2', shape: 'stateful', label: 'linear_project' },
    ]);
    for (const fact of result.facts) expect('resourceExternalId' in fact).toBe(false);
  });

  it('emits cycle created and closed facts on the team resource', async () => {
    const fake = new FakeLinearApi();
    fake.cycleNodes = [
      cycleNode({
        id: 'y-1',
        createdAt: daysAgo(2),
        updatedAt: daysAgo(1),
        completedAt: daysAgo(1),
      }),
    ];

    const result = await pullFresh(fake);

    expect(factIds(result)).toEqual([
      'linear:cycle:created:y-1',
      `linear:cycle:closed:y-1:${ms(daysAgo(1))}`,
    ]);
    expect(result.facts[0]?.content?.body).toBe('Cycle 7');
    expect(result.facts.every((fact) => fact.resourceExternalId === TEAM_ID)).toBe(true);
    expect(result.containers).toEqual([
      {
        sourceContainerId: 'linear:cycle:y-1',
        shape: 'stateful',
        label: 'linear_cycle',
        resourceExternalId: TEAM_ID,
      },
    ]);
  });
});

describe('LinearConnector.pull invariants', () => {
  it('keeps containerRefs equal to the single sourceThreadId on every fact', async () => {
    const result = await pullFresh(richWorld());

    expect(result.facts.length).toBeGreaterThan(10);
    for (const fact of result.facts) {
      expect(fact.containerRefs).toEqual([fact.sourceThreadId]);
    }
  });

  it('gives byte-identical facts for two pulls of an unchanged world', async () => {
    const first = await pullFresh(richWorld());
    const second = await pullFresh(richWorld());

    expect(JSON.stringify(first.facts)).toBe(JSON.stringify(second.facts));
    expect(JSON.stringify(first.containers)).toBe(JSON.stringify(second.containers));
  });

  it('never emits the retired key shape and always a documented one', async () => {
    const result = await pullFresh(richWorld());
    const documented = [
      /^linear:issue:created:[^:]+$/,
      /^linear:issue:edited:[^:]+:[^:]+$/,
      /^linear:issue:(state|assignee|priority|project|cycle|parent|estimate|dueDate|labels|team):[^:]+$/,
      /^linear:issue:archived:[^:]+:\d+$/,
      /^linear:comment:[^:]+$/,
      /^linear:comment:(edited|resolved):[^:]+:\d+$/,
      /^linear:project:created:[^:]+$/,
      /^linear:project:closed:[^:]+:\d+$/,
      /^linear:cycle:created:[^:]+$/,
      /^linear:cycle:closed:[^:]+:\d+$/,
    ];

    for (const id of factIds(result)) {
      expect(id.startsWith('linear:issue:updated:')).toBe(false);
      expect(documented.some((shape) => shape.test(id))).toBe(true);
    }
    expect(linearFactKeys.issueCreated('x')).toBe('linear:issue:created:x');
  });

  it('never builds an undefined thread and drops an issue whose identifier is not a key', async () => {
    const result = await pullFresh(richWorld());

    for (const fact of result.facts) {
      expect(fact.sourceThreadId?.endsWith('-undefined')).toBe(false);
      for (const ref of fact.containerRefs) expect(ref.endsWith('-undefined')).toBe(false);
    }
    expect(
      result.facts.some((fact) => fact.raw && (fact.raw as { id: string }).id === 'issue-bad'),
    ).toBe(false);
  });

  it('leaks no content into the metadata that leaves the enclave', async () => {
    const result = await pullFresh(richWorld());
    const forbidden = [
      'Fix the auth bug',
      'Fix auth',
      'Auth is broken',
      'Plan the secret migration',
      'Retire legacy export',
      'Looks fine',
      'Revised comment text',
      'Resolved comment text',
      'Automated comment text',
      'Mobile relaunch',
      'Ship the new mobile app',
      'Detailed scope',
      'Dropped experiment',
      'refactor-the-login-flow-for-mobile',
      'alice@example.com',
      'bob@example.com',
    ];
    const metadata = JSON.stringify([
      ...result.facts.map((fact) => [
        fact.sourceFactId,
        fact.containerRefs,
        fact.sourceThreadId,
        fact.entities,
        fact.content?.explicitLinks,
      ]),
      ...result.containers.map((container) => container.sourceContainerId),
    ]);

    for (const text of forbidden) expect(metadata).not.toContain(text);
    const withLink = result.facts.find((fact) => fact.content?.body.includes('refactor-the-login'));
    expect(withLink?.content?.explicitLinks).toEqual(['ENG-43']);
  });

  it('emits the edit, not the creation, when an item is edited after its first sighting', async () => {
    const clock = { now: NOW };
    const fake = new FakeLinearApi();
    fake.issueNodes = [
      issueNode({
        createdAt: new Date(NOW.getTime() - 5 * MINUTE_MS).toISOString(),
        updatedAt: new Date(NOW.getTime() - 5 * MINUTE_MS).toISOString(),
        title: 'Old title',
      }),
    ];
    fake.commentNodes = [
      commentNode({
        createdAt: new Date(NOW.getTime() - 4 * MINUTE_MS).toISOString(),
        updatedAt: new Date(NOW.getTime() - 4 * MINUTE_MS).toISOString(),
        body: 'Old body',
      }),
    ];
    const connector = connectorFor(fake, clock);
    const first = await connector.pull({ value: null });
    expect(factIds(first)).toEqual(['linear:issue:created:issue-1', 'linear:comment:comment-1']);

    const editedAt = new Date(NOW.getTime() + 2 * MINUTE_MS).toISOString();
    const issueEditAt = new Date(NOW.getTime() + 3 * MINUTE_MS).toISOString();
    fake.issueNodes = [
      issueNode({
        createdAt: new Date(NOW.getTime() - 5 * MINUTE_MS).toISOString(),
        updatedAt: issueEditAt,
        title: 'New title',
        history: page([
          historyNode({
            id: 'h1',
            createdAt: issueEditAt,
            fromTitle: 'Old title',
            toTitle: 'New title',
          }),
        ]),
      }),
    ];
    fake.commentNodes = [
      commentNode({
        createdAt: new Date(NOW.getTime() - 4 * MINUTE_MS).toISOString(),
        editedAt,
        updatedAt: editedAt,
        body: 'New body',
      }),
    ];
    clock.now = new Date(NOW.getTime() + 15 * MINUTE_MS);

    const second = await connector.pull(first.cursor);

    expect(factIds(second)).toEqual([
      'linear:issue:edited:issue-1:h1',
      `linear:comment:edited:comment-1:${ms(editedAt)}`,
    ]);
    expect(second.facts[0]?.content?.body).toContain('New title');
    expect(second.facts[1]?.content?.body).toBe('New body');
  });
});
