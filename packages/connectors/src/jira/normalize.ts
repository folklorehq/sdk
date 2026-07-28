// SPDX-License-Identifier: Apache-2.0
import { extractExplicitLinks } from '../github/normalize.js';
import type { NormalizedActor, NormalizedRecords, NormalizedResource } from '../normalized.js';
import { adfToText } from './adf-to-text.js';
import type {
  JiraComment,
  JiraCommentEvent,
  JiraIssue,
  JiraIssueEvent,
  JiraStatusCategoryKey,
  JiraUser,
} from './types.js';

const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

/** The issue key (e.g. PROJ-123) is the stable container id and native thread id. */
export function jiraIssueContainerId(issue: JiraIssue): string {
  return issue.key;
}

function extractJiraLinks(text: string): string[] {
  const links = new Set(extractExplicitLinks(text));
  for (const match of text.matchAll(JIRA_KEY_RE)) {
    if (match[1]) links.add(match[1]);
  }
  return [...links];
}

function userToActor(user: JiraUser | null | undefined): NormalizedActor[] {
  if (!user) return [];
  return [
    {
      sourceUserId: user.accountId,
      email: user.emailAddress,
      displayName: user.displayName,
      role: 'author',
    },
  ];
}

const CATEGORY_TRANSITION: Record<JiraStatusCategoryKey, string> = {
  done: 'closed',
  new: 'reopened',
  indeterminate: 'started',
};

function statusCategoryToTransition(categoryKey: string): string {
  return CATEGORY_TRANSITION[categoryKey as JiraStatusCategoryKey] ?? 'updated';
}

function issueBody(issue: JiraIssue): string {
  return [issue.fields.summary, adfToText(issue.fields.description)].filter(Boolean).join('\n\n');
}

function normalizeIssueCreated(event: JiraIssueEvent, occurredAt: Date): NormalizedRecords {
  const { issue } = event;
  const containerId = jiraIssueContainerId(issue);
  const body = issueBody(issue);
  return {
    containers: [
      {
        sourceContainerId: containerId,
        shape: 'stateful',
        label: 'jira_issue',
        resourceExternalId: issue.fields.project.key,
      },
    ],
    facts: [
      {
        sourceFactId: `jira:issue:created:${issue.id}`,
        kind: 'content',
        occurredAt,
        resourceExternalId: issue.fields.project.key,
        authors: userToActor(issue.fields.reporter),
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: [containerId],
        content: { body, explicitLinks: extractJiraLinks(body) },
        raw: event,
      },
    ],
  };
}

// A status change (append-only lifecycle Fact, ADL #1) only when the changelog proves one — the
// current statusCategory alone can't tell a status edit from a summary/description edit.
function normalizeStatusTransition(
  event: JiraIssueEvent,
  occurredAt: Date,
  from: string | undefined,
  to: string,
): NormalizedRecords {
  const { issue } = event;
  const containerId = jiraIssueContainerId(issue);
  return {
    containers: [],
    facts: [
      {
        sourceFactId: `jira:issue:status:${issue.id}:${issue.fields.updated}`,
        kind: 'transition',
        occurredAt,
        resourceExternalId: issue.fields.project.key,
        authors: userToActor(issue.fields.assignee ?? issue.fields.reporter),
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: [containerId],
        transition: {
          transitionType: statusCategoryToTransition(issue.fields.status.statusCategory.key),
          detail: { field: 'status', from, to },
        },
        raw: event,
      },
    ],
  };
}

function normalizeIssueEdited(event: JiraIssueEvent, occurredAt: Date): NormalizedRecords {
  const { issue } = event;
  const containerId = jiraIssueContainerId(issue);
  const body = issueBody(issue);
  return {
    containers: [],
    facts: [
      {
        sourceFactId: `jira:issue:edited:${issue.id}:${issue.fields.updated}`,
        kind: 'content',
        occurredAt,
        resourceExternalId: issue.fields.project.key,
        authors: userToActor(issue.fields.assignee ?? issue.fields.reporter),
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: [containerId],
        content: { body, explicitLinks: extractJiraLinks(body) },
        raw: event,
      },
    ],
  };
}

function normalizeIssueUpdated(event: JiraIssueEvent, occurredAt: Date): NormalizedRecords {
  const statusChange = event.changelog?.items.find((item) => item.field === 'status');
  if (statusChange) {
    return normalizeStatusTransition(
      event,
      occurredAt,
      statusChange.fromString ?? undefined,
      statusChange.toString ?? event.issue.fields.status.name,
    );
  }
  return normalizeIssueEdited(event, occurredAt);
}

export function normalizeJiraIssueEvent(event: JiraIssueEvent): NormalizedRecords {
  if (event.webhookEvent === 'jira:issue_created') {
    return normalizeIssueCreated(event, new Date(event.issue.fields.created));
  }
  return normalizeIssueUpdated(event, new Date(event.issue.fields.updated));
}

export function normalizeJiraCommentEvent(event: JiraCommentEvent): NormalizedRecords {
  const comment: JiraComment = event.comment;
  const containerId = jiraIssueContainerId(event.issue);
  const body = adfToText(comment.body);
  return {
    containers: [],
    facts: [
      {
        sourceFactId: `jira:comment:${comment.id}`,
        kind: 'content',
        occurredAt: new Date(comment.created),
        resourceExternalId: event.issue.fields.project.key,
        authors: userToActor(comment.author),
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: [containerId],
        content: { body, explicitLinks: extractJiraLinks(body) },
        raw: event,
      },
    ],
  };
}

export function projectToResource(project: {
  key: string;
  isPrivate?: boolean;
}): NormalizedResource {
  return { externalId: project.key, resourceType: 'project', isPublic: !project.isPrivate };
}
