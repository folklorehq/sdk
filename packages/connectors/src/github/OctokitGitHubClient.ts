// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@folklore/core';
import { retry } from '@octokit/plugin-retry';
import { Octokit } from '@octokit/rest';
import type { GitHubClient } from './client.js';
import type {
  GitHubIssueComment,
  GitHubPullRequestFile,
  GitHubPullRequestWithDetail,
  GitHubRepo,
  GitHubRepositoryIssueComment,
  GitHubUser,
} from './types.js';

const PAGE_SIZE = 100;
// Diff counts are computed per PR: measured pages took up to 7.4s at 100 (intermittent 5xx), 2.0s at 25.
const PULL_REQUEST_PAGE_SIZE = 25;
// plugin-retry backs off (retryCount + 1)^2 times this base: 1s, 4s, 9s for its 3 retries.
const RETRY_BASE_MS = 1_000;
const RETRIES = 3;
const RetryingOctokit = Octokit.plugin(retry);
const BOT_LOGIN_SUFFIX = '[bot]';
const ISSUE_NUMBER_FROM_URL = /\/issues\/(\d+)$/;
const REPOSITORY_UNRESOLVED = 'github_repository_unresolved';
// One page carries the diff counts, so no per-PR request is needed; `fullDatabaseId` equals the
// REST `id` (the 32-bit `databaseId` is deprecated and overflows on current PR ids).
const PULL_REQUESTS_BY_UPDATED_DESC = `
  query ($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: ${PULL_REQUEST_PAGE_SIZE}, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          fullDatabaseId
          number
          title
          body
          state
          merged
          createdAt
          updatedAt
          closedAt
          additions
          deletions
          changedFiles
          author {
            __typename
            login
            ... on User { databaseId }
            ... on Bot { databaseId }
            ... on Mannequin { databaseId }
            ... on Organization { databaseId }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

interface PullRequestAuthor {
  __typename: string;
  login: string;
  databaseId?: number | null;
}

interface PullRequestNode {
  fullDatabaseId: string | null;
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  merged: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: PullRequestAuthor | null;
}

type IdentifiedPullRequestNode = PullRequestNode & { fullDatabaseId: string };

export interface OctokitGitHubClientOptions {
  transport?: typeof fetch;
  logger?: Logger;
  retryBaseMs?: number;
}

interface PullRequestPage {
  nodes: (PullRequestNode | null)[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

interface PullRequestPageResponse {
  repository: { pullRequests: PullRequestPage } | null;
}

export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: InstanceType<typeof RetryingOctokit>;
  private readonly logger: Logger | undefined;

  constructor(token: string, options: OctokitGitHubClientOptions = {}) {
    this.octokit = new RetryingOctokit({
      auth: token,
      retry: { retries: RETRIES, retryAfterBaseValue: options.retryBaseMs ?? RETRY_BASE_MS },
      ...(options.transport ? { request: { fetch: options.transport } } : {}),
    });
    this.logger = options.logger;
  }

  // GitHub App installation tokens can only enumerate their own repos via
  // `/installation/repositories` — `/user/repos` (listForAuthenticatedUser) 403s for them.
  async listRepositories(): Promise<GitHubRepo[]> {
    const repos = await this.octokit.paginate(
      this.octokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: PAGE_SIZE },
    );
    return repos.map((r) => ({ id: r.id, full_name: r.full_name, private: r.private }));
  }

  async listPullRequestsUpdatedSince(
    repoFullName: string,
    since?: string,
  ): Promise<GitHubPullRequestWithDetail[]> {
    const [owner, name] = repoFullName.split('/') as [string, string];
    const nodes = await this.pullRequestNodesUpdatedSince(owner, name, since);
    const identified = nodes.filter(
      (node): node is IdentifiedPullRequestNode => node.fullDatabaseId !== null,
    );
    if (identified.length < nodes.length) {
      this.logger?.warn('github_pull_requests_without_id_skipped', {
        count: nodes.length - identified.length,
      });
    }
    return identified.map((node) => this.toPullRequestWithDetail(node));
  }

  async listIssueCommentsUpdatedSince(
    repoFullName: string,
    since?: string,
  ): Promise<GitHubRepositoryIssueComment[]> {
    const [owner, repo] = repoFullName.split('/') as [string, string];
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listCommentsForRepo, {
      owner,
      repo,
      sort: 'created',
      direction: 'asc',
      per_page: PAGE_SIZE,
      ...(since ? { since } : {}),
    });
    return comments.flatMap((c) => {
      const issueNumber = this.issueNumberFromUrl(c.issue_url);
      if (issueNumber === undefined) return [];
      const comment: GitHubIssueComment = {
        id: c.id,
        body: c.body ?? '',
        user: { id: c.user?.id ?? 0, login: c.user?.login ?? '' },
        created_at: c.created_at,
      };
      return [{ issueNumber, comment }];
    });
  }

  async getPullRequestFiles(
    repoFullName: string,
    pullNumber: number,
  ): Promise<GitHubPullRequestFile[]> {
    const [owner, repo] = repoFullName.split('/') as [string, string];
    const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: PAGE_SIZE,
    });
    return files.map((f) => ({
      filename: f.filename,
      status: f.status as GitHubPullRequestFile['status'],
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  }

  private async pullRequestNodesUpdatedSince(
    owner: string,
    name: string,
    since: string | undefined,
  ): Promise<PullRequestNode[]> {
    const nodes: PullRequestNode[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = await this.pullRequestPage(owner, name, cursor);
      for (const node of page.nodes) {
        if (!node) continue;
        if (since && node.updatedAt < since) return nodes;
        nodes.push(node);
      }
      if (!page.pageInfo.hasNextPage) return nodes;
      cursor = page.pageInfo.endCursor;
    }
  }

  private async pullRequestPage(
    owner: string,
    name: string,
    cursor: string | null,
  ): Promise<PullRequestPage> {
    const response = await this.octokit.graphql<PullRequestPageResponse>(
      PULL_REQUESTS_BY_UPDATED_DESC,
      { owner, name, cursor },
    );
    if (!response.repository) throw new Error(REPOSITORY_UNRESOLVED);
    return response.repository.pullRequests;
  }

  private toPullRequestWithDetail(node: IdentifiedPullRequestNode): GitHubPullRequestWithDetail {
    return {
      pullRequest: {
        id: Number(node.fullDatabaseId),
        number: node.number,
        title: node.title,
        body: node.body === '' ? null : node.body,
        state: node.state === 'OPEN' ? 'open' : 'closed',
        merged: node.merged,
        user: this.toUser(node.author),
        created_at: node.createdAt,
        updated_at: node.updatedAt,
        closed_at: node.closedAt ?? null,
      },
      detail: {
        additions: node.additions,
        deletions: node.deletions,
        changed_files: node.changedFiles,
      },
    };
  }

  // REST names an app's bot user `<slug>[bot]`; GraphQL's Bot.login drops the suffix.
  private toUser(author: PullRequestAuthor | null): GitHubUser {
    if (!author) return { id: 0, login: '' };
    const login = author.__typename === 'Bot' ? `${author.login}${BOT_LOGIN_SUFFIX}` : author.login;
    return { id: author.databaseId ?? 0, login };
  }

  private issueNumberFromUrl(issueUrl: string): number | undefined {
    const match = ISSUE_NUMBER_FROM_URL.exec(issueUrl);
    return match ? Number(match[1]) : undefined;
  }
}
