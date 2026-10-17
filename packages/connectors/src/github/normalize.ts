// SPDX-License-Identifier: Apache-2.0
import { FACT_METRIC_KEYS, FACT_METRIC_UNITS, type FactMetricKey } from '@folklore/contracts';
import { extractExplicitLinks, githubItemKey } from '@folklore/utils';
import type {
  NormalizedActor,
  NormalizedFact,
  NormalizedMetric,
  NormalizedRecords,
  NormalizedResource,
} from '../normalized.js';
import type {
  GitHubCommit,
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubRepo,
  GitHubUser,
  IssueCommentEvent,
  PullRequestEvent,
  PushEvent,
} from './types.js';

export function pullRequestContainerId(repo: GitHubRepo, pullNumber: number): string {
  return githubItemKey(repo.full_name, pullNumber);
}

function metric(key: FactMetricKey, value: number): NormalizedMetric {
  return { key, value, unit: FACT_METRIC_UNITS[key] };
}

/** Known-real structured ids for a github fact. `head.ref`/branch names are excluded on purpose (#68). */
function githubEntities(repo: GitHubRepo, pullNumber?: number): string[] {
  const entities = [repo.full_name];
  if (pullNumber !== undefined) entities.push(`PR#${pullNumber}`);
  return entities;
}

export function userToActor(
  user: GitHubUser,
  role: 'author' | 'co_author' = 'author',
): NormalizedActor {
  return {
    sourceUserId: String(user.id),
    email: user.email ?? undefined,
    displayName: user.name ?? user.login,
    role,
  };
}

function loginActor(user: GitHubUser): NormalizedActor {
  return userToActor({ id: user.id, login: user.login });
}

export function repoToResource(repo: GitHubRepo): NormalizedResource {
  return { externalId: String(repo.id), resourceType: 'repository', isPublic: !repo.private };
}

/**
 * A PR is a Container (stateful), seeded by a "PR opened" content Fact.
 */
export function normalizePullRequest(
  repo: GitHubRepo,
  pr: GitHubPullRequest,
): { container: NormalizedRecords['containers'][number]; fact: NormalizedFact } {
  const sourceContainerId = pullRequestContainerId(repo, pr.number);
  const resourceExternalId = String(repo.id);
  return {
    container: { sourceContainerId, shape: 'stateful', label: 'github_pr', resourceExternalId },
    fact: {
      sourceFactId: `github:pr_opened:${pr.id}`,
      kind: 'content',
      occurredAt: new Date(pr.created_at),
      resourceExternalId,
      authors: [loginActor(pr.user)],
      containerRefs: [sourceContainerId],
      sourceThreadId: sourceContainerId,
      entities: githubEntities(repo, pr.number),
      content: {
        body: [pr.title, pr.body ?? ''].filter(Boolean).join('\n\n'),
        explicitLinks: extractExplicitLinks(pr.body ?? '', repo.full_name),
      },
      raw: { id: pr.id, number: pr.number },
    },
  };
}

/** Status changes are their own transition Facts, never a mutated column. */
export function normalizePullRequestTransition(
  repo: GitHubRepo,
  pr: GitHubPullRequest,
  action: 'closed' | 'reopened' = pr.state === 'closed' ? 'closed' : 'reopened',
): NormalizedFact {
  const transitionType = action === 'reopened' ? 'reopened' : pr.merged ? 'merged' : 'closed';
  const from = action === 'reopened' ? 'closed' : 'open';
  const to = action === 'reopened' ? 'open' : transitionType;
  const mergeMetrics =
    pr.merged && pr.closed_at
      ? [
          metric(
            FACT_METRIC_KEYS.prTimeToMergeSeconds,
            timeToMergeSeconds(pr.created_at, pr.closed_at),
          ),
        ]
      : undefined;
  const keyAt = action === 'reopened' ? pr.updated_at : (pr.closed_at ?? pr.updated_at);
  return {
    sourceFactId: `github:pr_${transitionType}:${pr.id}:${keyAt}`,
    kind: 'transition',
    occurredAt: new Date(pr.closed_at ?? pr.updated_at),
    resourceExternalId: String(repo.id),
    authors: [loginActor(pr.user)],
    containerRefs: [pullRequestContainerId(repo, pr.number)],
    sourceThreadId: pullRequestContainerId(repo, pr.number),
    entities: githubEntities(repo, pr.number),
    transition: { transitionType, detail: { field: 'state', from, to } },
    metrics: mergeMetrics,
    raw: {
      id: pr.id,
      number: pr.number,
      closed_at: pr.closed_at ?? null,
      merged: pr.merged === true,
    },
  };
}

const MILLIS_PER_SECOND = 1000;

function timeToMergeSeconds(createdAt: string, closedAt: string): number {
  return Math.round(
    (new Date(closedAt).getTime() - new Date(createdAt).getTime()) / MILLIS_PER_SECOND,
  );
}

export function normalizeIssueComment(
  repo: GitHubRepo,
  pullNumber: number,
  comment: GitHubIssueComment,
): NormalizedFact {
  const editedAt = editedTimestamp(comment);
  return {
    sourceFactId: editedAt
      ? `github:comment:edited:${comment.id}:${editedAt}`
      : `github:comment:${comment.id}`,
    kind: 'content',
    occurredAt: new Date(editedAt ?? comment.created_at),
    resourceExternalId: String(repo.id),
    authors: [loginActor(comment.user)],
    containerRefs: [pullRequestContainerId(repo, pullNumber)],
    sourceThreadId: pullRequestContainerId(repo, pullNumber),
    entities: githubEntities(repo, pullNumber),
    content: {
      body: comment.body,
      explicitLinks: extractExplicitLinks(comment.body, repo.full_name),
    },
    raw: { id: comment.id },
  };
}

function editedTimestamp(comment: GitHubIssueComment): string | undefined {
  const { updated_at: updatedAt, created_at: createdAt } = comment;
  return updatedAt !== undefined && updatedAt !== createdAt ? updatedAt : undefined;
}

export function normalizeCommit(repo: GitHubRepo, commit: GitHubCommit): NormalizedFact {
  const author = commit.author ?? commit.committer ?? null;
  const changedFiles = [
    ...(commit.added ?? []),
    ...(commit.modified ?? []),
    ...(commit.removed ?? []),
  ];
  return {
    sourceFactId: `github:commit:${commit.sha}`,
    kind: 'content',
    occurredAt: new Date(commit.timestamp),
    resourceExternalId: String(repo.id),
    authors: author ? [userToActor(author)] : [],
    // Commit↔PR membership is N:M and resolved during ingestion (stacked PRs).
    containerRefs: [],
    entities: [...githubEntities(repo), ...changedFiles],
    content: {
      body: commit.message,
      explicitLinks: extractExplicitLinks(commit.message, repo.full_name),
    },
    metrics: [metric(FACT_METRIC_KEYS.commitChangedFiles, changedFiles.length)],
    raw: commit,
  };
}

function isTransitionAction(action: string): action is 'closed' | 'reopened' {
  return action === 'closed' || action === 'reopened';
}

export function normalizePullRequestEvent(event: PullRequestEvent): NormalizedRecords {
  const { repository, pull_request, action } = event;
  if (action === 'opened') {
    const { container, fact } = normalizePullRequest(repository, pull_request);
    return { containers: [container], facts: [fact] };
  }
  if (!isTransitionAction(action)) return { containers: [], facts: [] };
  return {
    containers: [],
    facts: [normalizePullRequestTransition(repository, pull_request, action)],
  };
}

export function normalizeIssueCommentEvent(event: IssueCommentEvent): NormalizedRecords {
  // Only comments on PRs become Facts here, and only on creation.
  if (event.action !== 'created' || !event.issue.pull_request) {
    return { containers: [], facts: [] };
  }
  return {
    containers: [],
    facts: [normalizeIssueComment(event.repository, event.issue.number, event.comment)],
  };
}

export function normalizePushEvent(event: PushEvent): NormalizedRecords {
  return {
    containers: [],
    facts: event.commits.map((commit) => normalizeCommit(event.repository, commit)),
  };
}
