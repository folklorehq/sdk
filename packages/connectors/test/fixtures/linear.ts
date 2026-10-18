// SPDX-License-Identifier: Apache-2.0
import type {
  LinearCommentNode,
  LinearCycleNode,
  LinearHistoryNode,
  LinearIssueNode,
  LinearPage,
  LinearProjectNode,
} from '../../src/linear/types.js';

export const NOW = new Date('2026-06-15T12:00:00.000Z');
export const DAY_MS = 86_400_000;
export const TEAM_ID = 'team-1';

export function daysAgo(days: number, from: Date = NOW): string {
  return new Date(from.getTime() - days * DAY_MS).toISOString();
}

export function page<T>(nodes: readonly T[], endCursor: string | null = null): LinearPage<T> {
  return { nodes, pageInfo: { hasNextPage: endCursor !== null, endCursor } };
}

export function historyNode(overrides: Partial<LinearHistoryNode> = {}): LinearHistoryNode {
  return {
    id: 'history-1',
    createdAt: daysAgo(3),
    actorId: 'user-2',
    fromStateId: null,
    toStateId: null,
    toState: null,
    fromAssigneeId: null,
    toAssigneeId: null,
    fromPriority: null,
    toPriority: null,
    fromProjectId: null,
    toProjectId: null,
    fromCycleId: null,
    toCycleId: null,
    fromParentId: null,
    toParentId: null,
    fromEstimate: null,
    toEstimate: null,
    fromDueDate: null,
    toDueDate: null,
    addedLabelIds: null,
    removedLabelIds: null,
    fromTeamId: null,
    toTeamId: null,
    fromTitle: null,
    toTitle: null,
    updatedDescription: null,
    ...overrides,
  };
}

export function issueNode(overrides: Partial<LinearIssueNode> = {}): LinearIssueNode {
  return {
    id: 'issue-1',
    identifier: 'ENG-42',
    title: 'Fix the auth bug',
    description: 'Auth is broken on mobile.',
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
    archivedAt: null,
    team: { id: TEAM_ID },
    creator: { id: 'user-1' },
    project: { id: 'project-1' },
    cycle: { id: 'cycle-1' },
    history: page([]),
    ...overrides,
  };
}

export function commentNode(overrides: Partial<LinearCommentNode> = {}): LinearCommentNode {
  return {
    id: 'comment-1',
    body: 'Looks good to me!',
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
    editedAt: null,
    resolvedAt: null,
    user: { id: 'user-3' },
    botActor: null,
    issue: { id: 'issue-1', identifier: 'ENG-42', team: { id: TEAM_ID } },
    ...overrides,
  };
}

export function projectNode(overrides: Partial<LinearProjectNode> = {}): LinearProjectNode {
  return {
    id: 'project-1',
    name: 'Mobile relaunch',
    description: 'Ship the new mobile app',
    content: 'Detailed scope for the relaunch',
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
    completedAt: null,
    canceledAt: null,
    creator: { id: 'user-1' },
    ...overrides,
  };
}

export function cycleNode(overrides: Partial<LinearCycleNode> = {}): LinearCycleNode {
  return {
    id: 'cycle-1',
    number: 7,
    name: null,
    description: null,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(14),
    completedAt: null,
    team: { id: TEAM_ID },
    ...overrides,
  };
}
