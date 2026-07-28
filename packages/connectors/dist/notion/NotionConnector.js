// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { isCreateEvent } from '../pull-classification.js';
import { normalizeNotionCommentEvent, normalizeNotionPageEvent } from './normalize.js';
export class NotionConnector extends BaseConnector {
    client;
    kind = 'notion';
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
        const pages = await this.call('listPages', () => this.client.listPages(since));
        let maxEditedAt = cursor.value;
        for (const page of pages) {
            const type = isCreateEvent(page.created_time, since)
                ? 'page.created'
                : 'page.updated';
            const normalized = normalizeNotionPageEvent({ type, page, workspace_id: '' });
            facts.push(...normalized.facts);
            containers.push(...normalized.containers);
            if (maxEditedAt === null || page.last_edited_time > maxEditedAt) {
                maxEditedAt = page.last_edited_time;
            }
        }
        this.logger.debug('notion pull complete', { facts: facts.length, pages: pages.length });
        return { facts, containers, cursor: { value: maxEditedAt }, hasMore: false };
    }
    normalizeWebhook(event) {
        const type = event.type;
        if (type === 'page.created' || type === 'page.updated') {
            return normalizeNotionPageEvent(event.payload);
        }
        if (type === 'comment.created') {
            return normalizeNotionCommentEvent(event.payload);
        }
        return { containers: [], facts: [] };
    }
}
//# sourceMappingURL=NotionConnector.js.map