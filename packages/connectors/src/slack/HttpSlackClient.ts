// SPDX-License-Identifier: Apache-2.0
import type { Agent } from 'node:http';
import { WebClient } from '@slack/web-api';
import { BaseApiClient } from '../BaseApiClient.js';
import type { SlackClient, SlackConversation, SlackMessagesResult } from './client.js';
import type { SlackMessage } from './types.js';

export class HttpSlackClient extends BaseApiClient implements SlackClient {
  private readonly client: WebClient;

  // WebClient's axios sets `proxy: false`, so a forward-proxy caller must inject the agent.
  constructor(token: string, agent?: Agent) {
    super(token);
    this.client = new WebClient(this.token, agent ? { agent } : undefined);
  }

  async listConversations(): Promise<SlackConversation[]> {
    const channels: SlackConversation[] = [];
    for await (const page of this.client.paginate('conversations.list', {
      types: 'public_channel,private_channel',
      limit: 200,
    })) {
      const typedPage = page as { channels?: SlackConversation[] };
      for (const ch of typedPage.channels ?? []) {
        if (ch.is_member)
          channels.push({ id: ch.id, name: ch.name, is_member: true, is_private: ch.is_private });
      }
    }
    return channels;
  }

  async listMessages(
    channelId: string,
    oldest?: string,
    cursor?: string,
  ): Promise<SlackMessagesResult> {
    const result = await this.client.conversations.history({
      channel: channelId,
      limit: 200,
      ...(oldest ? { oldest } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return {
      messages: (result.messages ?? []) as SlackMessage[],
      nextCursor: result.has_more ? (result.response_metadata?.next_cursor ?? null) : null,
    };
  }
}
