import type { GitHubClient } from './client.js';
import type { GitHubIssueComment, GitHubPullRequest, GitHubPullRequestDetail, GitHubPullRequestFile, GitHubRepo } from './types.js';
export declare class OctokitGitHubClient implements GitHubClient {
    private readonly octokit;
    constructor(token: string);
    listRepositories(): Promise<GitHubRepo[]>;
    listPullRequests(repoFullName: string, since?: string): Promise<GitHubPullRequest[]>;
    listIssueComments(repoFullName: string, pullNumber: number, since?: string): Promise<GitHubIssueComment[]>;
    getPullRequest(repoFullName: string, pullNumber: number): Promise<GitHubPullRequestDetail>;
    getPullRequestFiles(repoFullName: string, pullNumber: number): Promise<GitHubPullRequestFile[]>;
}
//# sourceMappingURL=octokit-client.d.ts.map