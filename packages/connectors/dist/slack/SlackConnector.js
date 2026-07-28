// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { normalizeSlackMessage, normalizeSlackReaction } from './normalize.js';
export class SlackConnector extends BaseConnector {
    client;
    kind = 'slack';
    constructor(context, client) {
        super(context);
        this.client = client;
    }
    async listResources() {
        const channels = await this.call('listConversations', () => this.client.listConversations());
        return channels.map((ch) => ({
            externalId: ch.id,
            resourceType: 'channel',
            // Fail closed on the source-access boundary: a channel is public only when Slack
            // explicitly says so; a missing is_private is treated as private.
            isPublic: ch.is_private === false,
        }));
    }
    async pull(cursor, options) {
        const oldest = cursor.value ?? options?.since?.getTime().toString();
        const facts = [];
        const containers = [];
        let maxTs = cursor.value;
        const channels = await this.call('listConversations', () => this.client.listConversations());
        for (const channel of channels) {
            let pageCursor;
            do {
                const result = await this.call('listMessages', () => this.client.listMessages(channel.id, oldest, pageCursor));
                for (const msg of result.messages) {
                    const normalized = normalizeSlackMessage(msg);
                    facts.push(...normalized.facts);
                    containers.push(...normalized.containers);
                    if (maxTs === null || msg.ts > maxTs)
                        maxTs = msg.ts;
                }
                pageCursor = result.nextCursor ?? undefined;
            } while (pageCursor);
        }
        this.logger.debug('slack pull complete', { facts: facts.length, channels: channels.length });
        return { facts, containers, cursor: { value: maxTs }, hasMore: false };
    }
    normalizeWebhook(event) {
        const payload = event.payload;
        const inner = payload.event ?? payload;
        if (inner.type === 'reaction_added' || inner.type === 'reaction_removed') {
            return normalizeSlackReaction(inner);
        }
        return normalizeSlackMessage(inner);
    }
}
//# sourceMappingURL=SlackConnector.js.map