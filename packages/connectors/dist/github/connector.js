// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../base-connector.js';
import { normalizeIssueComment, normalizeIssueCommentEvent, normalizePullRequest, normalizePullRequestTransition, normalizePushEvent, normalizePullRequestEvent, repoToResource, } from './normalize.js';
export class GitHubConnector extends BaseConnector {
    client;
    kind = 'github';
    constructor(context, client) {
        super(context);
        this.client = client;
    }
    async listResources() {
        const repos = await this.call('listRepositories', () => this.client.listRepositories());
        return repos.map(repoToResource);
    }
    async pull(cursor, options) {
        // Incremental sync resumes from the cursor; a fresh backfill starts at the
        // `since` window boundary. GitHub's REST `since` filters by update time.
        const since = cursor.value ?? options?.since?.toISOString();
        const facts = [];
        const containers = [];
        let maxUpdatedAt = cursor.value;
        const repos = await this.call('listRepositories', () => this.client.listRepositories());
        for (const repo of repos) {
            const prs = await this.call('listPullRequests', () => this.client.listPullRequests(repo.full_name, since));
            for (const pr of prs) {
                const detail = await this.call('getPullRequest', () => this.client.getPullRequest(repo.full_name, pr.number));
                const comments = await this.call('listIssueComments', () => this.client.listIssueComments(repo.full_name, pr.number, since));
                const { container, fact } = normalizePullRequest(repo, pr, {
                    additions: detail.additions,
                    deletions: detail.deletions,
                    changedFiles: detail.changed_files,
                    commentCount: comments.length,
                });
                containers.push(container);
                facts.push(fact);
                if (pr.state === 'closed') {
                    facts.push(normalizePullRequestTransition(repo, pr, 'closed'));
                }
                for (const comment of comments) {
                    facts.push(normalizeIssueComment(repo, pr.number, comment));
                }
                if (maxUpdatedAt === null || pr.updated_at > maxUpdatedAt) {
                    maxUpdatedAt = pr.updated_at;
                }
            }
        }
        this.logger.debug('github pull complete', {
            facts: facts.length,
            containers: containers.length,
        });
        return { facts, containers, cursor: { value: maxUpdatedAt }, hasMore: false };
    }
    normalizeWebhook(event) {
        switch (event.type) {
            case 'pull_request':
                return normalizePullRequestEvent(event.payload);
            case 'issue_comment':
                return normalizeIssueCommentEvent(event.payload);
            case 'push':
                return normalizePushEvent(event.payload);
            default:
                this.logger.debug('unhandled github webhook', { type: event.type });
                return { facts: [], containers: [] };
        }
    }
}
//# sourceMappingURL=connector.js.map