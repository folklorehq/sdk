// SPDX-License-Identifier: Apache-2.0
import type {
  LinearCommentEvent,
  LinearIssueEvent,
  LinearTeam,
  LinearUser,
} from '../../src/linear/index.js';

export const TEAM: LinearTeam = { id: 'team-uuid', name: 'Engineering', key: 'ENG' };

export const USER: LinearUser = { id: 'user-uuid', name: 'Alice', email: 'alice@example.com' };

export function makeIssueEvent(action: 'create' | 'update' = 'create'): LinearIssueEvent {
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

export function makeCommentEvent(): LinearCommentEvent {
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
