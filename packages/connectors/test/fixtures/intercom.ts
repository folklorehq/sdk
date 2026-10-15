// SPDX-License-Identifier: Apache-2.0
import type { IntercomNotificationEvent } from '../../src/intercom/index.js';

export const UNIX_TS = 1700000000;

export function makeConversationCreatedEvent(): IntercomNotificationEvent {
  return {
    type: 'notification_event',
    topic: 'conversation.user.created',
    created_at: UNIX_TS,
    data: {
      item: {
        type: 'conversation',
        id: 'conv-42',
        created_at: UNIX_TS,
        updated_at: UNIX_TS,
        conversation_message: {
          type: 'conversation_message',
          body: 'I need help with billing.',
          author: { type: 'user', id: 'user-1', name: 'Bob' },
          created_at: UNIX_TS,
        },
      },
    },
  };
}

export function makeReplyEvent(): IntercomNotificationEvent {
  return {
    type: 'notification_event',
    topic: 'conversation.user.replied',
    created_at: UNIX_TS + 60,
    data: {
      item: {
        type: 'conversation',
        id: 'conv-42',
        created_at: UNIX_TS,
        updated_at: UNIX_TS + 60,
        conversation_parts: {
          conversation_parts: [
            {
              type: 'conversation_part',
              id: 'part-1',
              part_type: 'comment',
              body: 'Happy to help!',
              author: { type: 'admin', id: 'admin-1', name: 'Support' },
              created_at: UNIX_TS + 60,
            },
          ],
        },
      },
    },
  };
}
