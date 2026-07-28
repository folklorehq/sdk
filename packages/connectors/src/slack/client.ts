// SPDX-License-Identifier: Apache-2.0
import type { SlackMessage } from './types.js';

export interface SlackConversation {
  id: string;
  name: string;
  is_member: boolean;
  is_private?: boolean;
}

export interface SlackMessagesResult {
  messages: SlackMessage[];
  nextCursor: string | null;
}

export interface SlackClient {
  listConversations(): Promise<SlackConversation[]>;
  listMessages(channelId: string, oldest?: string, cursor?: string): Promise<SlackMessagesResult>;
}
