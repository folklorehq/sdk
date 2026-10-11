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
    const since = cursor.value ?? options?.since?.toISOString();
    const records: NormalizedRecords = { facts: [], containers: [] };
    let maxUpdatedAt = cursor.value;

    const repos = await this.call('listRepositories', () => this.client.listRepositories());
    for (const repo of repos) {
      const pullRequests = await this.call('listPullRequestsUpdatedSince', () =>
        this.client.listPullRequestsUpdatedSince(repo.full_name, since),
      );
      if (pullRequests.length === 0) continue;
      const commentsByPull = await this.commentsByPullRequest(repo, pullRequests, since);
      for (const { pullRequest, detail } of pullRequests) {
        const comments = commentsByPull.get(pullRequest.number) ?? [];
        this.appendPullRequest(records, repo, pullRequest, detail, comments);
        if (maxUpdatedAt === null || pullRequest.updated_at > maxUpdatedAt) {
          maxUpdatedAt = pullRequest.updated_at;
        }
      }
    }

    this.logger.debug('github_pull_complete');
    return {
      facts: records.facts,
      containers: records.containers,
      cursor: { value: maxUpdatedAt },
      hasMore: false,
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
