// SPDX-License-Identifier: Apache-2.0
import { IntercomClient } from 'intercom-client';
import { BaseApiClient } from '../BaseApiClient.js';
export class IntercomSdkClient extends BaseApiClient {
    sdk;
    constructor(token) {
        super(token);
        this.sdk = new IntercomClient({ token: this.token });
    }
    async listConversations(updatedSince) {
        const conversations = [];
        for await (const conv of await this.sdk.conversations.list()) {
            if (updatedSince !== undefined &&
                conv.updated_at !== undefined &&
                conv.updated_at < updatedSince) {
                break;
            }
            conversations.push({
                type: 'conversation',
                id: conv.id ?? '',
                created_at: conv.created_at ?? 0,
                updated_at: conv.updated_at ?? 0,
                conversation_message: conv.source
                    ? {
                        type: 'conversation_message',
                        body: conv.source.body ?? '',
                        author: this.toAuthor(conv.source.author),
                        created_at: conv.created_at ?? 0,
                    }
                    : undefined,
                conversation_parts: conv.conversation_parts?.conversation_parts
                    ? {
                        conversation_parts: conv.conversation_parts.conversation_parts
                            .filter((p) => p.body)
                            .map((p) => ({
                            type: 'conversation_part',
                            part_type: p.part_type ?? 'comment',
                            body: p.body ?? '',
                            author: this.toAuthor(p.author),
                            created_at: p.created_at ?? 0,
                        })),
                    }
                    : undefined,
            });
        }
        return conversations;
    }
    toAuthor(raw) {
        return {
            type: raw?.type ?? 'user',
            id: raw?.id ?? '',
            name: raw?.name,
            email: raw?.email,
        };
    }
}
//# sourceMappingURL=IntercomSdkClient.js.map