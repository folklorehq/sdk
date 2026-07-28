// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { isCreateEvent } from '../pull-classification.js';
import { normalizeJiraCommentEvent, normalizeJiraIssueEvent, projectToResource, } from './normalize.js';
export class JiraConnector extends BaseConnector {
    client;
    kind = 'jira';
    constructor(context, client) {
        super(context);
        this.client = client;
    }
    async listResources() {
        const projects = await this.call('listProjects', () => this.client.listProjects());
        return projects.map(projectToResource);
    }
    async pull(cursor, options) {
        const since = cursor.value ?? options?.since?.toISOString();
        const facts = [];
        const containers = [];
        let maxUpdatedAt = cursor.value;
        const issues = await this.call('listIssues', () => this.client.listIssues(since));
        for (const issue of issues) {
            const normalized = normalizeJiraIssueEvent(this.issueEvent(issue, since));
            facts.push(...normalized.facts);
            containers.push(...normalized.containers);
            const comments = await this.call('listComments', () => this.client.listComments(issue.key, since));
            for (const comment of comments) {
                const event = {
                    webhookEvent: 'comment_created',
                    issue,
                    comment,
                };
                facts.push(...normalizeJiraCommentEvent(event).facts);
            }
            if (maxUpdatedAt === null || issue.fields.updated > maxUpdatedAt) {
                maxUpdatedAt = issue.fields.updated;
            }
        }
        this.logger.debug('jira pull complete', { facts: facts.length, issues: issues.length });
        return { facts, containers, cursor: { value: maxUpdatedAt }, hasMore: false };
    }
    normalizeWebhook(event) {
        const payload = event.payload;
        switch (payload.webhookEvent) {
            case 'jira:issue_created':
            case 'jira:issue_updated':
                return normalizeJiraIssueEvent(payload);
            case 'comment_created':
            case 'comment_updated':
                return normalizeJiraCommentEvent(payload);
            default:
                return { containers: [], facts: [] };
        }
    }
    // Classify per issue, not per pull mode: the enclave always sets a 12-month `since`, so an
    // issue born inside the window is a create (container + seed) while an older one only touched
    // in the window is an update.
    issueEvent(issue, since) {
        return {
            webhookEvent: isCreateEvent(issue.fields.created, since)
                ? 'jira:issue_created'
                : 'jira:issue_updated',
            issue,
        };
    }
}
//# sourceMappingURL=JiraConnector.js.map