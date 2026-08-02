// SPDX-License-Identifier: Apache-2.0
export interface IntercomAuthor {
  type: 'user' | 'admin' | 'bot';
  id: string;
  name?: string;
  email?: string;
}

export interface IntercomConversationMessage {
  type: 'conversation_message';
  body: string;
  author: IntercomAuthor;
  created_at: number;
}

export interface IntercomConversationPart {
  type: 'conversation_part';
  id?: string;
  part_type: string;
  body: string;
  redacted?: boolean;
  author: IntercomAuthor;
  created_at: number;
}

export interface IntercomConversation {
  type: 'conversation';
  id: string;
  created_at: number;
  updated_at: number;
  conversation_message?: IntercomConversationMessage;
  conversation_parts?: {
    conversation_parts: IntercomConversationPart[];
  };
}

export interface IntercomNotificationEvent {
  type: 'notification_event';
  topic:
    | 'conversation.user.created'
    | 'conversation.user.replied'
    | 'conversation.admin.replied'
    | 'conversation.admin.closed'
    | 'conversation.admin.assigned';
  data: { item: IntercomConversation };
  created_at: number;
}
