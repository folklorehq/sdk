// SPDX-License-Identifier: Apache-2.0
import { Octokit } from '@octokit/rest';
import type { GitHubClient } from './client.js';
import type {
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubPullRequestDetail,
  GitHubPullRequestFile,
  GitHubRepo,
} from './types.js';

export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  // GitHub App installation tokens can only enumerate their own repos via
  // `/installation/repositories` — `/user/repos` (listForAuthenticatedUser) 403s for them.
  async listRepositories(): Promise<GitHubRepo[]> {
    const repos = await this.octokit.paginate(
      this.octokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
    );
    return repos.map((r) => ({ id: r.id, full_name: r.full_name, private: r.private }));
  }

  async listPullRequests(repoFullName: string, since?: string): Promise<GitHubPullRequest[]> {
    const [owner, repo] = repoFullName.split('/') as [string, string];
    const prs = await this.octokit.paginate(this.octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    });
    return prs
      .filter((pr) => !since || pr.updated_at >= since)
      .map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body ?? null,
        state: pr.state as 'open' | 'closed',
        merged: pr.merged_at !== null,
        user: { id: pr.user?.id ?? 0, login: pr.user?.login ?? '' },
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        closed_at: pr.closed_at ?? null,
      }));
  }

  async listIssueComments(
    repoFullName: string,
    pullNumber: number,
    since?: string,
  ): Promise<GitHubIssueComment[]> {
    const [owner, repo] = repoFullName.split('/') as [string, string];
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
      ...(since ? { since } : {}),
    });
    return comments.map((c) => ({
      id: c.id,
      body: c.body ?? '',
      user: { id: c.user?.id ?? 0, login: c.user?.login ?? '' },
      created_at: c.created_at,
    }));
  }

  async getPullRequest(repoFullName: string, pullNumber: number): Promise<GitHubPullRequestDetail> {
    const [owner, repo] = repoFullName.split('/') as [string, string];
    const { data } = await this.octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    return {
      additions: data.additions,
      deletions: data.deletions,
      changed_files: data.changed_files,
    };
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
      per_page: 100,
    });
    return files.map((f) => ({
      filename: f.filename,
      status: f.status as GitHubPullRequestFile['status'],
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }));
  }
}
