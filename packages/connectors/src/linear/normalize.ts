// SPDX-License-Identifier: Apache-2.0
import { extractExplicitLinks } from '../github/normalize.js';
import type { NormalizedRecords } from '../normalized.js';
import type {
  LinearComment,
  LinearCommentEvent,
  LinearIssue,
  LinearIssueEvent,
  LinearTeam,
} from './types.js';

export function linearIssueContainerId(team: LinearTeam, issueNumber: number): string {
  return `${team.key}-${issueNumber}`;
}

function issueAuthors(issue: LinearIssue) {
  return issue.assignee ? [{ sourceUserId: issue.assignee.id, role: 'author' as const }] : [];
}

export function normalizeLinearIssueEvent(event: LinearIssueEvent): NormalizedRecords {
  const issue = event.data;
  const issueId = linearIssueContainerId(issue.team, issue.number);

  if (event.action === 'create') {
    const body = [issue.title, issue.description].filter(Boolean).join('\n\n');
    return {
      containers: [
        {
          sourceContainerId: issueId,
          shape: 'stateful',
          label: 'linear_issue',
          resourceExternalId: issue.team.id,
        },
      ],
      facts: [
        {
          sourceFactId: `linear:issue:created:${issue.id}`,
          kind: 'content',
          occurredAt: new Date(event.createdAt),
          resourceExternalId: issue.team.id,
          authors: issueAuthors(issue),
          containerRefs: [issueId],
          sourceThreadId: issueId,
          entities: [issueId],
          content: { body, explicitLinks: extractExplicitLinks(body) },
          raw: event,
        },
      ],
    };
  }

  // update = transition fact
  return {
    containers: [],
    facts: [
      {
        sourceFactId: `linear:issue:updated:${issue.id}:${issue.updatedAt}`,
        kind: 'transition',
        occurredAt: new Date(issue.updatedAt),
        resourceExternalId: issue.team.id,
        authors: issueAuthors(issue),
        containerRefs: [issueId],
        sourceThreadId: issueId,
        entities: [issueId],
        transition: {
          transitionType: 'updated',
          detail: { field: 'state', to: issue.state.name },
        },
        raw: event,
      },
    ],
  };
}

export function normalizeLinearCommentEvent(event: LinearCommentEvent): NormalizedRecords {
  const comment: LinearComment = event.data;
  const issueId = linearIssueContainerId(comment.issue.team, comment.issue.number);

  return {
    containers: [],
    facts: [
      {
        sourceFactId: `linear:comment:${comment.id}`,
        kind: 'content',
        occurredAt: new Date(comment.createdAt),
        resourceExternalId: comment.issue.team.id,
        authors: [{ sourceUserId: comment.user.id, role: 'author' }],
        containerRefs: [issueId],
        sourceThreadId: issueId,
        entities: [issueId],
        content: { body: comment.body, explicitLinks: [] },
        raw: event,
      },
    ],
  };
}
