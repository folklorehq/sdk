// SPDX-License-Identifier: Apache-2.0
import { BaseApiClient } from '../base-client.js';
const ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
const API_BASE = 'https://api.atlassian.com/ex/jira';
const ISSUE_FIELDS = 'summary,description,created,updated,reporter,assignee,status,project';
const PAGE_SIZE = 100;
const PROJECT_PAGE_SIZE = 50;
/** Talks to one Jira Cloud site over REST v3, resolving the site's cloudId from the OAuth token. */
export class JiraHttpClient extends BaseApiClient {
    cloudId = null;
    constructor(token, cloudId) {
        super(token);
        this.cloudId = cloudId ?? null;
    }
    async listProjects() {
        const projects = [];
        let startAt = 0;
        for (;;) {
            const page = await this.get(`/rest/api/3/project/search?startAt=${startAt}&maxResults=${PROJECT_PAGE_SIZE}`);
            projects.push(...page.values);
            if (page.isLast || page.values.length === 0)
                break;
            startAt += page.values.length;
        }
        return projects;
    }
    async listIssues(updatedSince) {
        const issues = [];
        let nextPageToken;
        for (;;) {
            const page = await this.get(this.searchPath(updatedSince, nextPageToken));
            issues.push(...page.issues);
            if (page.isLast || !page.nextPageToken)
                break;
            nextPageToken = page.nextPageToken;
        }
        return issues;
    }
    async listComments(issueKey, updatedSince) {
        const sinceMs = updatedSince ? Date.parse(updatedSince) : undefined;
        const comments = [];
        let startAt = 0;
        for (;;) {
            const page = await this.get(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${PAGE_SIZE}&orderBy=created`);
            for (const comment of page.comments) {
                if (sinceMs === undefined || Date.parse(comment.created) >= sinceMs) {
                    comments.push(comment);
                }
            }
            startAt += page.comments.length;
            if (page.comments.length === 0 || startAt >= page.total)
                break;
        }
        return comments;
    }
    searchPath(updatedSince, nextPageToken) {
        const params = new URLSearchParams({
            jql: this.buildJql(updatedSince),
            fields: ISSUE_FIELDS,
            maxResults: String(PAGE_SIZE),
        });
        if (nextPageToken)
            params.set('nextPageToken', nextPageToken);
        return `/rest/api/3/search/jql?${params.toString()}`;
    }
    buildJql(updatedSince) {
        if (!updatedSince)
            return 'ORDER BY updated ASC';
        return `updated >= "${this.toJqlDate(updatedSince)}" ORDER BY updated ASC`;
    }
    // Jira JQL wants `yyyy-MM-dd HH:mm`; an ISO instant maps cleanly by dropping seconds/zone.
    toJqlDate(iso) {
        const date = new Date(iso);
        const pad = (n) => String(n).padStart(2, '0');
        const y = date.getUTCFullYear();
        const mo = pad(date.getUTCMonth() + 1);
        const d = pad(date.getUTCDate());
        const h = pad(date.getUTCHours());
        const mi = pad(date.getUTCMinutes());
        return `${y}-${mo}-${d} ${h}:${mi}`;
    }
    async get(path) {
        const cloudId = await this.resolveCloudId();
        const res = await fetch(`${API_BASE}/${cloudId}${path}`, {
            headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        });
        if (!res.ok) {
            throw Object.assign(new Error(`jira request failed: ${res.status}`), { status: res.status });
        }
        return (await res.json());
    }
    async resolveCloudId() {
        if (this.cloudId)
            return this.cloudId;
        const res = await fetch(ACCESSIBLE_RESOURCES_URL, {
            headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        });
        if (!res.ok) {
            throw Object.assign(new Error(`jira accessible-resources failed: ${res.status}`), {
                status: res.status,
            });
        }
        const resources = (await res.json());
        const first = resources[0];
        if (!first)
            throw new Error('jira: no accessible Atlassian site for this token');
        // Never silently pick a site: an ambiguous token must carry an explicit cloudId (threaded
        // from connect-time) rather than guessing and ingesting the wrong Jira instance.
        if (resources.length > 1) {
            throw new Error(`jira: token grants ${resources.length} sites; a cloudId must be configured to disambiguate`);
        }
        this.cloudId = first.id;
        return this.cloudId;
    }
}
//# sourceMappingURL=http-client.js.map