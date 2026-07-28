import { WebClient } from '@slack/web-api';
import { BaseApiClient } from '../BaseApiClient.js';
export class HttpSlackClient extends BaseApiClient {
    client;
    // WebClient's axios sets `proxy: false`, so a forward-proxy caller must inject the agent.
    constructor(token, agent) {
        super(token);
        this.client = new WebClient(this.token, agent ? { agent } : undefined);
    }
    async listConversations() {
        const channels = [];
        for await (const page of this.client.paginate('conversations.list', {
            types: 'public_channel,private_channel',
            limit: 200,
        })) {
            const typedPage = page;
            for (const ch of typedPage.channels ?? []) {
                if (ch.is_member)
                    channels.push({ id: ch.id, name: ch.name, is_member: true, is_private: ch.is_private });
            }
        }
        return channels;
    }
    async listMessages(channelId, oldest, cursor) {
        const result = await this.client.conversations.history({
            channel: channelId,
            limit: 200,
            ...(oldest ? { oldest } : {}),
            ...(cursor ? { cursor } : {}),
        });
        return {
            messages: (result.messages ?? []),
            nextCursor: result.has_more ? (result.response_metadata?.next_cursor ?? null) : null,
        };
    }
}
//# sourceMappingURL=HttpSlackClient.js.map