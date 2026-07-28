// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { normalizeIntercomEvent } from './normalize.js';
export class IntercomConnector extends BaseConnector {
    client;
    kind = 'intercom';
    constructor(context, client) {
        super(context);
        this.client = client;
    }
    async listResources() {
        return [];
    }
    async pull(cursor, options) {
        const sinceEpoch = cursor.value
            ? Number(cursor.value)
            : options?.since
                ? Math.floor(options.since.getTime() / 1000)
                : undefined;
        const conversations = await this.call('listConversations', () => this.client.listConversations(sinceEpoch));
        const facts = [];
        const containers = [];
        let maxUpdatedAt = cursor.value;
        for (const conv of conversations) {
            const event = {
                type: 'notification_event',
                topic: 'conversation.user.created',
                data: { item: conv },
                created_at: conv.created_at,
            };
            const normalized = normalizeIntercomEvent(event);
            facts.push(...normalized.facts);
            containers.push(...normalized.containers);
            const updatedAtStr = String(conv.updated_at);
            if (maxUpdatedAt === null || updatedAtStr > maxUpdatedAt) {
                maxUpdatedAt = updatedAtStr;
            }
        }
        this.logger.debug('intercom pull complete', {
            facts: facts.length,
            conversations: conversations.length,
        });
        return { facts, containers, cursor: { value: maxUpdatedAt }, hasMore: false };
    }
    normalizeWebhook(event) {
        const payload = event.payload;
        if (!payload.type || !payload.topic || !payload.data?.item) {
            return { containers: [], facts: [] };
        }
        return normalizeIntercomEvent(payload);
    }
}
//# sourceMappingURL=IntercomConnector.js.map