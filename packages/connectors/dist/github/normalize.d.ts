import type { NormalizedActor, NormalizedFact, NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { GitHubCommit, GitHubIssueComment, GitHubPullRequest, GitHubRepo, GitHubUser, IssueCommentEvent, PullRequestEvent, PushEvent } from './types.js';
/** Pull URLs and `#123` issue references out of free text (ADL: explicit_links). */
export declare function extractExplicitLinks(body: string): string[];
export declare function pullRequestContainerId(repo: GitHubRepo, pullNumber: number): string;
/** Diff/comment scalars for a PR-opened Fact. Counts only — no filename ever enters. */
export interface PullRequestMetricsInput {
    additions: number;
    deletions: number;
    changedFiles: number;
    commentCount: number;
}
export declare function userToActor(user: GitHubUser, role?: 'author' | 'co_author'): NormalizedActor;
export declare function repoToResource(repo: GitHubRepo): NormalizedResource;
/**
 * A PR is a Container (stateful), seeded by a "PR opened" content Fact.
 */
export declare function normalizePullRequest(repo: GitHubRepo, pr: GitHubPullRequest, metricsInput?: PullRequestMetricsInput): {
    container: NormalizedRecords['containers'][number];
    fact: NormalizedFact;
};
/** Status changes are their own transition Facts, never a mutated column. */
export declare function normalizePullRequestTransition(repo: GitHubRepo, pr: GitHubPullRequest, action?: 'closed' | 'reopened'): NormalizedFact;
export declare function normalizeIssueComment(repo: GitHubRepo, pullNumber: number, comment: GitHubIssueComment): NormalizedFact;
export declare function normalizeCommit(repo: GitHubRepo, commit: GitHubCommit): NormalizedFact;
export declare function normalizePullRequestEvent(event: PullRequestEvent): NormalizedRecords;
export declare function normalizeIssueCommentEvent(event: IssueCommentEvent): NormalizedRecords;
export declare function normalizePushEvent(event: PushEvent): NormalizedRecords;
//# sourceMappingURL=normalize.d.ts.map