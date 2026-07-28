// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { isCreateEvent } from '../pull-classification.js';
import { normalizeLinearCommentEvent, normalizeLinearIssueEvent } from './normalize.js';
export class LinearConnector extends BaseConnector {
    client;
    kind = 'linear';
    constructor(context, client) {
        super(context);
        this.client = client;
    }
    async listResources() {
        return [];
    }
    async pull(cursor, options) {
        const since = cursor.value ?? options?.since?.toISOString();
        const facts = [];
        const containers = [];
        let maxUpdatedAt = cursor.value;
        const issues = await this.call('listIssues', () => this.client.listIssues(since));
        for (const issue of issues) {
            const event = {
                action: isCreateEvent(issue.createdAt, since) ? 'create' : 'update',
                data: issue,
                type: 'Issue',
                createdAt: issue.createdAt,
                organizationId: issue.team.id,
            };
            const normalized = normalizeLinearIssueEvent(event);
            facts.push(...normalized.facts);
            containers.push(...normalized.containers);
            const comments = await this.call('listComments', () => this.client.listComments(issue.id, since));
            for (const comment of comments) {
                const commentEvent = {
                    action: 'create',
                    data: comment,
                    type: 'Comment',
                    createdAt: comment.createdAt,
                    organizationId: issue.team.id,
                };
                facts.push(...normalizeLinearCommentEvent(commentEvent).facts);
            }
            if (maxUpdatedAt === null || issue.updatedAt > maxUpdatedAt) {
                maxUpdatedAt = issue.updatedAt;
            }
        }
        this.logger.debug('linear pull complete', { facts: facts.length, issues: issues.length });
        return { facts, containers, cursor: { value: maxUpdatedAt }, hasMore: false };
    }
    normalizeWebhook(event) {
        const payload = event.payload;
        if (payload.type === 'Issue') {
            return normalizeLinearIssueEvent(payload);
        }
        if (payload.type === 'Comment') {
            return normalizeLinearCommentEvent(payload);
        }
        return { containers: [], facts: [] };
    }
}
//# sourceMappingURL=LinearConnector.js.map