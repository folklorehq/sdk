// SPDX-License-Identifier: Apache-2.0
import { Writable } from 'node:stream';
import { PinoLogger } from '@folklore/logger';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@folklore/core';
import { LinearConnector } from '../src/linear/LinearConnector.js';
import { projectBody } from '../src/linear/canonical.js';
import {
  normalizeLinearPulledComment,
  normalizeLinearPulledCycle,
  normalizeLinearPulledIssue,
  normalizeLinearPulledProject,
  type LinearEmitBounds,
} from '../src/linear/normalize.js';
import { normalizeLinearWebhook } from '../src/linear/webhook.js';
import { getDefaultConnectorRegistry } from '../src/registry/index.js';
import {
  TEAM_ID,
  commentNode,
  cycleNode,
  daysAgo,
  issueNode,
  projectNode,
} from './fixtures/linear.js';

const ms = (iso: string) => Date.parse(iso);
const DELIVERED = daysAgo(1);
const PREVIOUS = daysAgo(2);
const OTHER_TEAM = 'team-2';
const NEW_CONTENT = 'Rewritten scope';

const issueData = (over: object = {}) => ({
  id: 'issue-1',
  identifier: 'ENG-42',
  title: 'Fix the auth bug',
  description: 'Auth is broken on mobile.',
  createdAt: daysAgo(5),
  updatedAt: daysAgo(5),
  archivedAt: null,
  teamId: TEAM_ID,
  creatorId: 'user-1',
  projectId: 'project-1',
  cycleId: 'cycle-1',
  ...over,
});
const commentData = (over: object = {}) => ({
  id: 'comment-1',
  body: 'Looks good to me!',
  createdAt: daysAgo(4),
  updatedAt: daysAgo(4),
  editedAt: null,
  resolvedAt: null,
  userId: 'user-3',
  issue: { id: 'issue-1', identifier: 'ENG-42', teamId: OTHER_TEAM },
  ...over,
});
const projectData = (over: object = {}) => ({
  id: 'project-1',
  name: 'Mobile relaunch',
  description: 'Ship the new mobile app',
  content: 'Detailed scope for the relaunch',
  createdAt: daysAgo(30),
  updatedAt: daysAgo(30),
  completedAt: null,
  canceledAt: null,
  creatorId: 'user-1',
  ...over,
});
const cycleData = (over: object = {}) => ({
  id: 'cycle-1',
  number: 7,
  createdAt: daysAgo(14),
  updatedAt: daysAgo(14),
  completedAt: null,
  teamId: TEAM_ID,
  ...over,
});

function delivery(type: string, action: string, data: object, updatedFrom?: object) {
  return { type, action, createdAt: DELIVERED, organizationId: 'org-1', data, updatedFrom };
}
const updateFrom = (changed: object = {}) => ({ updatedAt: PREVIOUS, ...changed });
const createdWindow = (iso: string): LinearEmitBounds => ({
  emitAfterMs: ms(iso) - 1,
  floorMs: ms(iso),
});
const updateWindow: LinearEmitBounds = { emitAfterMs: ms(PREVIOUS), floorMs: 0 };

const PARITY_CASES = [
  [
    'issue create',
    delivery('Issue', 'create', issueData()),
    normalizeLinearPulledIssue(issueNode(), [], createdWindow(daysAgo(5))),
  ],
  [
    'comment create',
    delivery('Comment', 'create', commentData()),
    normalizeLinearPulledComment(
      commentNode({ issue: { id: 'issue-1', identifier: 'ENG-42', team: { id: OTHER_TEAM } } }),
      createdWindow(daysAgo(4)),
    ),
  ],
  [
    'comment edit',
    delivery('Comment', 'update', commentData({ editedAt: DELIVERED }), updateFrom()),
    normalizeLinearPulledComment(
      commentNode({
        editedAt: DELIVERED,
        issue: { id: 'issue-1', identifier: 'ENG-42', team: { id: OTHER_TEAM } },
      }),
      updateWindow,
    ),
  ],
  [
    'comment resolve',
    delivery('Comment', 'update', commentData({ resolvedAt: DELIVERED }), updateFrom()),
    normalizeLinearPulledComment(
      commentNode({
        resolvedAt: DELIVERED,
        issue: { id: 'issue-1', identifier: 'ENG-42', team: { id: OTHER_TEAM } },
      }),
      updateWindow,
    ),
  ],
  [
    'issue archive',
    delivery('Issue', 'update', issueData({ archivedAt: DELIVERED }), updateFrom()),
    normalizeLinearPulledIssue(issueNode({ archivedAt: DELIVERED }), [], updateWindow),
  ],
  [
    'project create',
    delivery('Project', 'create', projectData()),
    normalizeLinearPulledProject(projectNode(), createdWindow(daysAgo(30))),
  ],
  [
    'project complete',
    delivery('Project', 'update', projectData({ completedAt: DELIVERED }), updateFrom()),
    normalizeLinearPulledProject(projectNode({ completedAt: DELIVERED }), updateWindow),
  ],
  [
    'cycle create',
    delivery('Cycle', 'create', cycleData()),
    normalizeLinearPulledCycle(cycleNode(), createdWindow(daysAgo(14))),
  ],
  [
    'cycle complete',
    delivery('Cycle', 'update', cycleData({ completedAt: DELIVERED }), updateFrom()),
    normalizeLinearPulledCycle(cycleNode({ completedAt: DELIVERED }), updateWindow),
  ],
] as const;

const REMOVAL_CASES = [
  ['issue', delivery('Issue', 'remove', issueData()), TEAM_ID],
  ['comment', delivery('Comment', 'remove', commentData()), OTHER_TEAM],
  ['cycle', delivery('Cycle', 'remove', cycleData()), TEAM_ID],
  ['project', delivery('Project', 'remove', projectData()), undefined],
] as const;

const DROP_CASES = [
  ['a reaction', delivery('Reaction', 'create', { id: 'reaction-1' }), 'unsupported_type', 'other'],
  ['an SLA event', delivery('IssueSLA', 'set', { id: 'issue-1' }), 'unsupported_type', 'other'],
  [
    'an unsupported action',
    delivery('Issue', 'restore', issueData()),
    'unsupported_action',
    'issue',
  ],
  ['a missing id', delivery('Issue', 'create', issueData({ id: undefined })), 'unparsed', 'issue'],
  ['a non-object body', null, 'unparsed', 'other'],
  [
    'an update with no previous update time',
    delivery('Issue', 'update', issueData(), { stateId: 'state-1' }),
    'no_previous_update',
    'issue',
  ],
  [
    'an invalid identifier',
    delivery('Issue', 'create', issueData({ identifier: 'bad' })),
    'no_container',
    'issue',
  ],
  [
    'a removed comment with no issue',
    delivery('Comment', 'remove', commentData({ issue: undefined })),
    'no_container',
    'comment',
  ],
] as const;

const stable = (records: object) => JSON.stringify(records);

describe('normalizeLinearWebhook', () => {
  it.each(PARITY_CASES)('yields the pull facts and containers for %s', (_name, payload, pulled) => {
    const outcome = normalizeLinearWebhook(payload);

    expect(pulled.facts.length).toBeGreaterThan(0);
    expect(stable(outcome.records)).toBe(stable(pulled));
    expect(outcome.dropped).toBeNull();
  });

  it('leaves issue field changes and project metadata changes to the pull', () => {
    const issue = delivery('Issue', 'update', issueData(), updateFrom({ stateId: 'state-1' }));
    const project = delivery('Project', 'update', projectData(), updateFrom({ health: 'onTrack' }));

    for (const payload of [issue, project]) {
      expect(normalizeLinearWebhook(payload)).toEqual({
        records: { facts: [], containers: [] },
        dropped: null,
      });
    }
  });

  it('emits one webhook-only content fact for a project edit', () => {
    const payload = delivery(
      'Project',
      'update',
      projectData({ content: NEW_CONTENT, updatedAt: DELIVERED }),
      updateFrom({ content: 'Detailed scope for the relaunch' }),
    );

    const { records } = normalizeLinearWebhook(payload);

    expect(records.facts).toHaveLength(1);
    expect(records.facts[0]).toMatchObject({
      sourceFactId: `linear:project:edited:project-1:${ms(DELIVERED)}`,
      content: { body: projectBody('Mobile relaunch', 'Ship the new mobile app', NEW_CONTENT) },
    });
    expect(normalizeLinearWebhook(payload)).toEqual(normalizeLinearWebhook(payload));
  });

  it.each(REMOVAL_CASES)(
    'records a removed %s as one deleted transition under the team its pull facts use',
    (entity, payload, resourceExternalId) => {
      const { records, dropped } = normalizeLinearWebhook(payload);

      expect(dropped).toBeNull();
      expect(records.facts).toHaveLength(1);
      const [fact] = records.facts;
      expect(fact).toMatchObject({
        sourceFactId: `linear:${entity}:removed:${payload.data.id}:${ms(DELIVERED)}`,
        kind: 'transition',
        transition: { transitionType: 'deleted' },
        raw: { entity, id: payload.data.id },
      });
      expect(fact).not.toHaveProperty('content');
      expect(fact?.resourceExternalId).toBe(resourceExternalId);
      expect(fact !== undefined && 'resourceExternalId' in fact).toBe(
        resourceExternalId !== undefined,
      );
    },
  );

  it('records an unarchived issue as one restored transition keyed by its update time', () => {
    const payload = delivery(
      'Issue',
      'update',
      issueData({ archivedAt: null, updatedAt: DELIVERED }),
      updateFrom({ archivedAt: daysAgo(3) }),
    );

    const { records } = normalizeLinearWebhook(payload);

    expect(records.facts).toHaveLength(1);
    expect(records.facts[0]).toMatchObject({
      sourceFactId: `linear:issue:restored:issue-1:${ms(DELIVERED)}`,
      transition: { transitionType: 'restored' },
      resourceExternalId: TEAM_ID,
    });
  });

  it('treats a comment on a project update as a legitimate empty result', () => {
    const payload = delivery('Comment', 'create', commentData({ issue: undefined }));

    expect(normalizeLinearWebhook(payload).dropped).toBeNull();
    expect(normalizeLinearWebhook(payload).records.facts).toEqual([]);
  });

  it.each(DROP_CASES)('drops %s with a closed reason', (_name, payload, reason, entity) => {
    expect(normalizeLinearWebhook(payload)).toEqual({
      records: { facts: [], containers: [] },
      dropped: { reason, entity },
    });
  });
});

describe('LinearConnector.normalizeWebhook', () => {
  it('logs a drop through the real content-free logger as closed codes, never a payload string', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const connector = new LinearConnector(
      { logger: new PinoLogger({ destination }) },
      null as never,
    );
    const payload = delivery('Reaction', 'create', {
      id: 'reaction-1',
      body: 'Secret launch plan',
    });

    connector.normalizeWebhook({ type: 'Reaction', payload });

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({
        msg: 'linear_webhook_dropped',
        reason: 'unsupported_type',
        entityKind: 'other',
      }),
    ]);
    expect(lines.join('')).not.toContain('Secret launch plan');
  });

  it('is what the registry runs for a Linear delivery', () => {
    const payload = delivery('Issue', 'create', issueData());

    const records = getDefaultConnectorRegistry().normalizeWebhook(
      'linear',
      { type: 'Issue', payload },
      { logger: { warn: vi.fn() } as unknown as Logger },
    );

    expect(stable(records)).toBe(stable(normalizeLinearWebhook(payload).records));
    expect(records.facts).toHaveLength(1);
  });
});
