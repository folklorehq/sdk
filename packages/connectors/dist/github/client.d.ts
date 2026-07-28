import type { GitHubIssueComment, GitHubPullRequest, GitHubPullRequestDetail, GitHubPullRequestFile, GitHubRepo } from './types.js';
export interface GitHubClient {
    listRepositories(): Promise<GitHubRepo[]>;
    listPullRequests(repoFullName: string, since?: string): Promise<GitHubPullRequest[]>;
    listIssueComments(repoFullName: string, pullNumber: number, since?: string): Promise<GitHubIssueComment[]>;
    getPullRequest(repoFullName: string, pullNumber: number): Promise<GitHubPullRequestDetail>;
    getPullRequestFiles(repoFullName: string, pullNumber: number): Promise<GitHubPullRequestFile[]>;
}
//# sourceMappingURL=client.d.ts.map