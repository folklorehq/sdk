// SPDX-License-Identifier: Apache-2.0
import type {
  GitHubPullRequestFile,
  GitHubPullRequestWithDetail,
  GitHubRepo,
  GitHubRepositoryIssueComment,
} from './types.js';

export interface GitHubClient {
  listRepositories(): Promise<GitHubRepo[]>;
  /** Most recently updated first, ending at the first PR last updated before `since`. */
  listPullRequestsUpdatedSince(
    repoFullName: string,
    since?: string,
  ): Promise<GitHubPullRequestWithDetail[]>;
  /** Every issue and PR comment in the repo updated at or after `since`, oldest created first. */
  listIssueCommentsUpdatedSince(
    repoFullName: string,
    since?: string,
  ): Promise<GitHubRepositoryIssueComment[]>;
  getPullRequestFiles(repoFullName: string, pullNumber: number): Promise<GitHubPullRequestFile[]>;
}
