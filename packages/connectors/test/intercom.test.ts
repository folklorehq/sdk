// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import {
  IntercomConnector,
  intercomConversationId,
  normalizeIntercomEvent,
} from '../src/intercom/index.js';
import type { IntercomApiClient } from '../src/intercom/index.js';
import type { IntercomConversation, IntercomNotificationEvent } from '../src/intercom/index.js';

const UNIX_TS = 1700000000;

function makeConversationCreatedEvent(): IntercomNotificationEvent {
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

function makeReplyEvent(): IntercomNotificationEvent {
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

describe('intercomConversationId', () => {
  it('formats as intercom:conv:{id}', () => {
    expect(intercomConversationId('conv-42')).toBe('intercom:conv:conv-42');
  });
});

describe('normalizeIntercomEvent — conversation.user.created', () => {
  it('produces one container and one content fact', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.containers).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('container has label intercom_conversation and shape flat', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.containers[0]).toMatchObject({
      label: 'intercom_conversation',
      shape: 'flat',
    });
  });

  it('container sourceContainerId is intercom:conv:{id}', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.containers[0]!.sourceContainerId).toBe('intercom:conv:conv-42');
  });

  it('fact occurredAt is Unix seconds × 1000 converted to Date', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.facts[0]!.occurredAt.getTime()).toBe(UNIX_TS * 1000);
  });

  it('fact body is the conversation message body', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.facts[0]!.content?.body).toBe('I need help with billing.');
  });

  it('fact author is the message author', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.facts[0]!.authors[0]!.sourceUserId).toBe('user-1');
  });

  it('emits the conversation id as the structural entity', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.facts[0]!.entities).toEqual(['conv-42']);
  });

  it('sourceFactId is deterministic and derived from the conversation id (append-only dedup key)', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.facts[0]!.sourceFactId).toBe('intercom:conv:created:conv-42');
  });

  it('the created fact anchors its container via containerRefs and sourceThreadId', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.facts[0]!.containerRefs).toEqual(['intercom:conv:conv-42']);
    expect(result.facts[0]!.sourceThreadId).toBe('intercom:conv:conv-42');
  });

  it('carries no explicit links', () => {
    const result = normalizeIntercomEvent(makeConversationCreatedEvent());
    expect(result.facts[0]!.content?.explicitLinks).toEqual([]);
  });

  it('returns nothing when the created conversation has no opening message', () => {
    const event = makeConversationCreatedEvent();
    delete event.data.item.conversation_message;
    const result = normalizeIntercomEvent(event);
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(0);
  });
});

describe('normalizeIntercomEvent — reply topic', () => {
  it('produces no container and one content fact', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('fact references the conversation container', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.facts[0]!.containerRefs).toContain('intercom:conv:conv-42');
    expect(result.facts[0]!.sourceThreadId).toBe('intercom:conv:conv-42');
  });

  it('fact body is the reply part body', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.facts[0]!.content?.body).toBe('Happy to help!');
  });

  it('fact author is the reply part author', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.facts[0]!.authors[0]!.sourceUserId).toBe('admin-1');
  });

  it('fact occurredAt uses the part created_at timestamp', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.facts[0]!.occurredAt.getTime()).toBe((UNIX_TS + 60) * 1000);
  });

  it('sourceFactId keys on the conversation id and the part timestamp', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.facts[0]!.sourceFactId).toBe(`intercom:part:conv-42:${UNIX_TS + 60}`);
  });

  it('a reply part shares the conversation id as its only structural entity', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.facts[0]!.entities).toEqual(['conv-42']);
  });

  it('normalizes the most recent conversation part when several are present', () => {
    const event = makeReplyEvent();
    event.data.item.conversation_parts = {
      conversation_parts: [
        {
          type: 'conversation_part',
          part_type: 'comment',
          body: 'first reply',
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
        {
          type: 'conversation_part',
          part_type: 'comment',
          body: 'latest reply',
          author: { type: 'admin', id: 'admin-2' },
          created_at: UNIX_TS + 120,
        },
      ],
    };
    const result = normalizeIntercomEvent(event);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.content?.body).toBe('latest reply');
    expect(result.facts[0]!.sourceFactId).toBe(`intercom:part:conv-42:${UNIX_TS + 120}`);
  });

  it('routes admin lifecycle topics (closed/assigned) through the reply path', () => {
    const event = makeReplyEvent();
    event.topic = 'conversation.admin.closed';
    const result = normalizeIntercomEvent(event);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.content?.body).toBe('Happy to help!');
  });
});

describe('normalizeIntercomEvent — empty conversation parts', () => {
  it('returns empty when conversation_parts array is empty', () => {
    const event = makeReplyEvent();
    event.data.item.conversation_parts = { conversation_parts: [] };
    const result = normalizeIntercomEvent(event);
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(0);
  });

  it('returns empty when the latest part carries no body', () => {
    const event = makeReplyEvent();
    event.data.item.conversation_parts = {
      conversation_parts: [
        {
          type: 'conversation_part',
          part_type: 'assignment',
          body: '',
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
      ],
    };
    const result = normalizeIntercomEvent(event);
    expect(result.facts).toHaveLength(0);
  });
});

describe('IntercomConnector.normalizeWebhook', () => {
  const connector = new IntercomConnector(
    { logger: new PinoLogger({ level: 'silent' }) },
    {} as IntercomApiClient,
  );

  it('routes a created event to a container + content fact', () => {
    const result = connector.normalizeWebhook({
      type: 'notification_event',
      payload: makeConversationCreatedEvent(),
    });
    expect(result.containers).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('ignores a payload missing the notification envelope', () => {
    const result = connector.normalizeWebhook({ type: 'notification_event', payload: {} });
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('ignores a payload whose data.item is absent', () => {
    const result = connector.normalizeWebhook({
      type: 'notification_event',
      payload: { type: 'notification_event', topic: 'conversation.user.created', data: {} },
    });
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });
});

class FakeIntercomClient implements IntercomApiClient {
  updatedSinceArgs: Array<number | undefined> = [];

  constructor(private readonly conversations: IntercomConversation[]) {}

  async listConversations(updatedSince?: number): Promise<IntercomConversation[]> {
    this.updatedSinceArgs.push(updatedSince);
    return this.conversations;
  }
}

function makeConversation(id: string, createdAt: number, updatedAt: number): IntercomConversation {
  return {
    type: 'conversation',
    id,
    created_at: createdAt,
    updated_at: updatedAt,
    conversation_message: {
      type: 'conversation_message',
      body: `opening message for ${id}`,
      author: { type: 'user', id: `user-${id}` },
      created_at: createdAt,
    },
  };
}

describe('IntercomConnector.pull', () => {
  const context = { logger: new PinoLogger({ level: 'silent' }) };

  it('seeds a container + content fact per conversation and reports no further pages', async () => {
    const client = new FakeIntercomClient([
      makeConversation('conv-a', UNIX_TS, UNIX_TS + 10),
      makeConversation('conv-b', UNIX_TS + 20, UNIX_TS + 30),
    ]);
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: null });

    expect(result.containers).toHaveLength(2);
    expect(result.facts.filter((f) => f.kind === 'content')).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });

  it('advances the cursor to the max updated_at across the batch', async () => {
    const client = new FakeIntercomClient([
      makeConversation('conv-a', UNIX_TS, UNIX_TS + 10),
      makeConversation('conv-b', UNIX_TS + 20, UNIX_TS + 300),
    ]);
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: null });

    expect(result.cursor.value).toBe(String(UNIX_TS + 300));
  });

  it('passes a stored cursor through to the client as the updatedSince epoch', async () => {
    const client = new FakeIntercomClient([]);
    const connector = new IntercomConnector(context, client);

    await connector.pull({ value: String(UNIX_TS) });

    expect(client.updatedSinceArgs[0]).toBe(UNIX_TS);
  });

  it('derives updatedSince from options.since (epoch seconds) when no cursor is stored', async () => {
    const client = new FakeIntercomClient([]);
    const connector = new IntercomConnector(context, client);

    await connector.pull({ value: null }, { since: new Date((UNIX_TS + 5) * 1000) });

    expect(client.updatedSinceArgs[0]).toBe(UNIX_TS + 5);
  });

  it('preserves the incoming cursor when the batch is empty', async () => {
    const client = new FakeIntercomClient([]);
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: String(UNIX_TS) });

    expect(result.cursor.value).toBe(String(UNIX_TS));
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });
});
