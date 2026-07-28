// SPDX-License-Identifier: Apache-2.0
import { IntercomClient } from 'intercom-client';
import { BaseApiClient } from '../BaseApiClient.js';
import type { IntercomApiClient } from './client.js';
import type { IntercomAuthor, IntercomConversation, IntercomConversationPart } from './types.js';

export class IntercomSdkClient extends BaseApiClient implements IntercomApiClient {
  private readonly sdk: IntercomClient;

  constructor(token: string) {
    super(token);
    this.sdk = new IntercomClient({ token: this.token });
  }

  async listConversations(updatedSince?: number): Promise<IntercomConversation[]> {
    const conversations: IntercomConversation[] = [];

    for await (const conv of await this.sdk.conversations.list()) {
      if (
        updatedSince !== undefined &&
        conv.updated_at !== undefined &&
        conv.updated_at < updatedSince
      ) {
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
                .map(
                  (p): IntercomConversationPart => ({
                    type: 'conversation_part',
                    part_type: p.part_type ?? 'comment',
                    body: p.body ?? '',
                    author: this.toAuthor(p.author),
                    created_at: p.created_at ?? 0,
                  }),
                ),
            }
          : undefined,
      });
    }

    return conversations;
  }

  private toAuthor(
    raw: { type?: string; id?: string; name?: string; email?: string } | undefined,
  ): IntercomAuthor {
    return {
      type: (raw?.type as IntercomAuthor['type']) ?? 'user',
      id: raw?.id ?? '',
      name: raw?.name,
      email: raw?.email,
    };
  }
}
