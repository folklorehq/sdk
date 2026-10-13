// SPDX-License-Identifier: Apache-2.0
import type { AppError } from '@folklore/errors';
import { BaseConnector } from '../BaseConnector.js';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { GitHubClient } from './client.js';
import { readGitHubPullCursor, writeGitHubPullCursor } from './pull-cursor.js';
import {
  normalizeIssueComment,
  normalizeIssueCommentEvent,
  normalizePullRequest,
  normalizePullRequestTransition,
  normalizePushEvent,
  normalizePullRequestEvent,
  repoToResource,
} from './normalize.js';
import type {
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubPullRequestDetail,
  GitHubPullRequestWithDetail,
  GitHubRepo,
  IssueCommentEvent,
  PullRequestEvent,
  PushEvent,
} from './types.js';

// GraphQL reports an exhausted budget as HTTP 200 with this error type, so it carries no status.
const GRAPHQL_RATE_LIMITED = 'RATE_LIMITED';
const PULL_FACT_BUDGET_INVALID = 'pull_fact_budget_invalid';

interface ListedPullRequest {
  repo: GitHubRepo;
  pullRequest: GitHubPullRequest;
  detail: GitHubPullRequestDetail;
  comments: GitHubIssueComment[];
}

export class GitHubConnector extends BaseConnector {
  readonly kind = 'github';

  constructor(
    context: ConnectorContext,
    private readonly client: GitHubClient,
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    const repos = await this.call('listRepositories', () => this.client.listRepositories());
    return repos.map(repoToResource);
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    // Incremental sync resumes from the cursor; a fresh backfill starts at the
    // `since` window boundary. GitHub's `since` filters by update time.
    const windowStart = options?.since?.toISOString() ?? null;
    const position = readGitHubPullCursor(cursor.value, windowStart);
    const listed = await this.listUpdatedPullRequests(
      position.updatedAt ?? windowStart ?? undefined,
      position.commentsSince ?? undefined,
    );
    const chunk =
      options?.maxFacts === undefined
        ? { pullRequests: listed, hasMore: false }
        : this.oldestWithinBudget(listed, position.updatedAt, options.maxFacts);
    const records: NormalizedRecords = { facts: [], containers: [] };
    let maxUpdatedAt = position.updatedAt;
    for (const { repo, pullRequest, detail, comments } of chunk.pullRequests) {
      this.appendPullRequest(records, repo, pullRequest, detail, comments);
      if (maxUpdatedAt === null || pullRequest.updated_at > maxUpdatedAt) {
        maxUpdatedAt = pullRequest.updated_at;
      }
    }

    this.logger.debug('github_pull_complete');
    return {
      facts: records.facts,
      containers: records.containers,
      cursor: {
        value: writeGitHubPullCursor(
          { updatedAt: maxUpdatedAt, commentsSince: position.commentsSince },
          chunk.hasMore,
        ),
      },
      hasMore: chunk.hasMore,
    };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    switch (event.type) {
      case 'pull_request':
        return normalizePullRequestEvent(event.payload as PullRequestEvent);
      case 'issue_comment':
        return normalizeIssueCommentEvent(event.payload as IssueCommentEvent);
      case 'push':
        return normalizePushEvent(event.payload as PushEvent);
      default:
        this.logger.debug('unhandled_github_webhook');
        return { facts: [], containers: [] };
    }
  }

  // The repo-wide stream also carries plain-issue comments; only comments on PRs in this window count.
  protected override mapError(operation: string, err: unknown): AppError {
    return this.isGraphqlRateLimited(err)
      ? this.rateLimitError(operation, err)
      : super.mapError(operation, err);
  }

  private isGraphqlRateLimited(err: unknown): boolean {
    const errors = (err as { errors?: unknown } | null)?.errors;
    return (
      Array.isArray(errors) &&
      errors.some((e) => (e as { type?: unknown } | null)?.type === GRAPHQL_RATE_LIMITED)
    );
  }

  private async listUpdatedPullRequests(
    since: string | undefined,
    commentsSince: string | undefined,
  ): Promise<ListedPullRequest[]> {
    const listed: ListedPullRequest[] = [];
    const repos = await this.call('listRepositories', () => this.client.listRepositories());
    for (const repo of repos) {
      const pullRequests = await this.call('listPullRequestsUpdatedSince', () =>
        this.client.listPullRequestsUpdatedSince(repo.full_name, since),
      );
      if (pullRequests.length === 0) continue;
      const commentsByPull = await this.commentsByPullRequest(repo, pullRequests, commentsSince);
      for (const { pullRequest, detail } of pullRequests) {
        const comments = commentsByPull.get(pullRequest.number) ?? [];
        listed.push({ repo, pullRequest, detail, comments });
      }
    }
    return listed;
  }

  // Boundary ties stay together and updates at the resume cursor are free, so a cursor at the last
  // update taken never skips a PR, and any chunk with a newer update moves the cursor forward.
  private oldestWithinBudget(
    listed: readonly ListedPullRequest[],
    resumeAt: string | null,
    maxFacts: number,
  ): { pullRequests: ListedPullRequest[]; hasMore: boolean } {
    if (!Number.isSafeInteger(maxFacts) || maxFacts < 1) {
      throw new Error(PULL_FACT_BUDGET_INVALID);
    }
    const oldestFirst = [...listed].sort((a, b) =>
      a.pullRequest.updated_at.localeCompare(b.pullRequest.updated_at),
    );
    const taken: ListedPullRequest[] = [];
    let remaining = maxFacts;
    let boundary: string | undefined;
    for (const item of oldestFirst) {
      const updatedAt = item.pullRequest.updated_at;
      if (boundary !== undefined && updatedAt !== boundary) {
        return { pullRequests: taken, hasMore: true };
      }
      taken.push(item);
      if (resumeAt === null || updatedAt > resumeAt) remaining -= this.factCount(item);
      if (remaining <= 0) boundary ??= updatedAt;
    }
    return { pullRequests: taken, hasMore: false };
  }

  private factCount({ pullRequest, comments }: ListedPullRequest): number {
    return 1 + (pullRequest.state === 'closed' ? 1 : 0) + comments.length;
  }

  private async commentsByPullRequest(
    repo: GitHubRepo,
    pullRequests: GitHubPullRequestWithDetail[],
    since: string | undefined,
  ): Promise<Map<number, GitHubIssueComment[]>> {
    const byPull = new Map<number, GitHubIssueComment[]>(
      pullRequests.map(({ pullRequest }) => [pullRequest.number, []]),
    );
    const comments = await this.call('listIssueCommentsUpdatedSince', () =>
      this.client.listIssueCommentsUpdatedSince(repo.full_name, since),
    );
    for (const { issueNumber, comment } of comments) byPull.get(issueNumber)?.push(comment);
    return byPull;
  }

  private appendPullRequest(
    records: NormalizedRecords,
    repo: GitHubRepo,
    pr: GitHubPullRequest,
    detail: GitHubPullRequestDetail,
    comments: GitHubIssueComment[],
  ): void {
    const { container, fact } = normalizePullRequest(repo, pr, {
      additions: detail.additions,
      deletions: detail.deletions,
      changedFiles: detail.changed_files,
      commentCount: comments.length,
    });
    records.containers.push(container);
    records.facts.push(fact);
    if (pr.state === 'closed') {
      records.facts.push(normalizePullRequestTransition(repo, pr, 'closed'));
    }
    for (const comment of comments) {
      records.facts.push(normalizeIssueComment(repo, pr.number, comment));
    }
  }
}
