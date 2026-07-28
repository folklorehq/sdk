// SPDX-License-Identifier: Apache-2.0
import { Octokit } from '@octokit/rest';
export class OctokitGitHubClient {
    octokit;
    constructor(token) {
        this.octokit = new Octokit({ auth: token });
    }
    // GitHub App installation tokens (ADL #42) can only enumerate their own repos via
    // `/installation/repositories` — `/user/repos` (listForAuthenticatedUser) 403s for them.
    async listRepositories() {
        const repos = await this.octokit.paginate(this.octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
        return repos.map((r) => ({ id: r.id, full_name: r.full_name, private: r.private }));
    }
    async listPullRequests(repoFullName, since) {
        const [owner, repo] = repoFullName.split('/');
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
            state: pr.state,
            merged: pr.merged_at !== null,
            user: { id: pr.user?.id ?? 0, login: pr.user?.login ?? '' },
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            closed_at: pr.closed_at ?? null,
        }));
    }
    async listIssueComments(repoFullName, pullNumber, since) {
        const [owner, repo] = repoFullName.split('/');
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
    async getPullRequest(repoFullName, pullNumber) {
        const [owner, repo] = repoFullName.split('/');
        const { data } = await this.octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
        return {
            additions: data.additions,
            deletions: data.deletions,
            changed_files: data.changed_files,
        };
    }
    async getPullRequestFiles(repoFullName, pullNumber) {
        const [owner, repo] = repoFullName.split('/');
        const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
            owner,
            repo,
            pull_number: pullNumber,
            per_page: 100,
        });
        return files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch,
        }));
    }
}
//# sourceMappingURL=octokit-client.js.map