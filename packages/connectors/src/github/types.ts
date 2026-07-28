// SPDX-License-Identifier: Apache-2.0
// Minimal subset of GitHub API/webhook shapes we map. Not exhaustive — only the
// fields normalization reads.

export interface GitHubUser {
  id: number;
  login: string;
  email?: string | null;
  name?: string | null;
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  private: boolean;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  state: 'open' | 'closed';
  merged?: boolean;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

/** Top-level PR diff counts from `pulls.get` — scalars only, never the filenames or patch (ADL #72). */
export interface GitHubPullRequestDetail {
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  user: GitHubUser;
  created_at: string;
}

export interface GitHubPullRequestFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author?: GitHubUser | null;
  committer?: GitHubUser | null;
  timestamp: string;
  added?: string[];
  modified?: string[];
  removed?: string[];
}

// Webhook envelopes
export interface PullRequestEvent {
  action: 'opened' | 'closed' | 'reopened';
  repository: GitHubRepo;
  pull_request: GitHubPullRequest;
}

export interface IssueCommentEvent {
  action: 'created' | 'edited' | 'deleted';
  repository: GitHubRepo;
  issue: { number: number; pull_request?: object };
  comment: GitHubIssueComment;
}

export interface PushEvent {
  ref: string;
  repository: GitHubRepo;
  commits: GitHubCommit[];
}
