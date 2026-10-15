// SPDX-License-Identifier: Apache-2.0
import type {
  AdfNode,
  JiraComment,
  JiraCommentEvent,
  JiraIssue,
  JiraIssueEvent,
} from '../../src/jira/types.js';

export const REPORTER = {
  accountId: 'acc-reporter',
  displayName: 'Alice',
  emailAddress: 'a@example.com',
};

export const ASSIGNEE = { accountId: 'acc-assignee', displayName: 'Bob' };

export function adfDoc(text: string): AdfNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

export function makeIssue(overrides: Partial<JiraIssue['fields']> = {}): JiraIssue {
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

export function issueEvent(
  kind: JiraIssueEvent['webhookEvent'],
  issue = makeIssue(),
  changelog?: JiraIssueEvent['changelog'],
): JiraIssueEvent {
  return { webhookEvent: kind, issue, changelog };
}

export function statusChangelog(from: string, to: string): JiraIssueEvent['changelog'] {
  return { items: [{ field: 'status', fromString: from, toString: to }] };
}

export function makeComment(): JiraComment {
  return {
    id: 'comment-9',
    body: adfDoc('Looks good to me!'),
    author: ASSIGNEE,
    created: '2026-01-03T00:00:00.000Z',
  };
}

export function commentEvent(): JiraCommentEvent {
  return { webhookEvent: 'comment_created', issue: makeIssue(), comment: makeComment() };
}
