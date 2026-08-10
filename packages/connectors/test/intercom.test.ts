// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import {
  IntercomConnector,
  IntercomSdkClient,
  intercomConversationId,
  normalizeIntercomConversationParts,
  normalizeIntercomEvent,
} from '../src/intercom/index.js';
import type { IntercomApiClient, IntercomConversationPage } from '../src/intercom/index.js';
import type {
  IntercomConversation,
  IntercomConversationPart,
  IntercomNotificationEvent,
} from '../src/intercom/index.js';

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

  it('sourceFactId keys on the part id, not the (collision-prone) whole-second timestamp', () => {
    const result = normalizeIntercomEvent(makeReplyEvent());
    expect(result.facts[0]!.sourceFactId).toBe('intercom:part:part-1');
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
          id: 'part-1',
          part_type: 'comment',
          body: 'first reply',
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
        {
          type: 'conversation_part',
          id: 'part-2',
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
    expect(result.facts[0]!.sourceFactId).toBe('intercom:part:part-2');
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
          id: 'part-1',
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

  it('returns empty when the latest part is an internal note, not a customer-facing reply', () => {
    const event = makeReplyEvent();
    event.data.item.conversation_parts = {
      conversation_parts: [
        {
          type: 'conversation_part',
          id: 'part-1',
          part_type: 'note',
          body: 'internal escalation detail',
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
      ],
    };
    const result = normalizeIntercomEvent(event);
    expect(result.facts).toHaveLength(0);
  });

  it('skips same-second id-less replies rather than assigning them a colliding dedup key', () => {
    const first = makeReplyEvent();
    const second = makeReplyEvent();
    first.data.item.conversation_parts = {
      conversation_parts: [
        {
          type: 'conversation_part',
          part_type: 'comment',
          body: 'first id-less reply',
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
      ],
    };
    second.data.item.conversation_parts = {
      conversation_parts: [
        {
          type: 'conversation_part',
          part_type: 'comment',
          body: 'second id-less reply',
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
      ],
    };

    expect(normalizeIntercomEvent(first).facts).toHaveLength(0);
    expect(normalizeIntercomEvent(second).facts).toHaveLength(0);
  });

  it('returns empty when the latest part has been redacted', () => {
    const event = makeReplyEvent();
    event.data.item.conversation_parts = {
      conversation_parts: [
        {
          type: 'conversation_part',
          id: 'part-1',
          part_type: 'comment',
          body: 'obscured',
          redacted: true,
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
      ],
    };
    const result = normalizeIntercomEvent(event);
    expect(result.facts).toHaveLength(0);
  });
});

function makePart(overrides: Partial<IntercomConversationPart> = {}): IntercomConversationPart {
  return {
    type: 'conversation_part',
    id: 'part-1',
    part_type: 'comment',
    body: 'a reply',
    author: { type: 'admin', id: 'admin-1' },
    created_at: UNIX_TS + 60,
    ...overrides,
  };
}

function makeConvoWithParts(parts: IntercomConversationPart[]): IntercomConversation {
  return {
    type: 'conversation',
    id: 'conv-42',
    created_at: UNIX_TS,
    updated_at: UNIX_TS + 60,
    conversation_parts: { conversation_parts: parts },
  };
}

describe('normalizeIntercomConversationParts', () => {
  it('emits one fact per part, keyed by the part id — same-second parts do not collide', () => {
    const convo = makeConvoWithParts([
      makePart({ id: 'part-a', body: 'a bot auto-reply', created_at: UNIX_TS + 60 }),
      makePart({ id: 'part-b', body: 'an admin reply, same second', created_at: UNIX_TS + 60 }),
    ]);

    const facts = normalizeIntercomConversationParts(convo);

    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.sourceFactId)).toEqual([
      'intercom:part:part-a',
      'intercom:part:part-b',
    ]);
    expect(facts.map((f) => f.content?.body)).toEqual([
      'a bot auto-reply',
      'an admin reply, same second',
    ]);
  });

  it('skips internal notes', () => {
    const convo = makeConvoWithParts([makePart({ part_type: 'note' })]);
    expect(normalizeIntercomConversationParts(convo)).toHaveLength(0);
  });

  it('skips redacted parts', () => {
    const convo = makeConvoWithParts([makePart({ redacted: true })]);
    expect(normalizeIntercomConversationParts(convo)).toHaveLength(0);
  });

  it('skips parts with no body', () => {
    const convo = makeConvoWithParts([makePart({ body: '' })]);
    expect(normalizeIntercomConversationParts(convo)).toHaveLength(0);
  });

  it('skips a part with no id, rather than collapsing it onto a shared fallback key', () => {
    const convo = makeConvoWithParts([makePart({ id: undefined })]);
    expect(normalizeIntercomConversationParts(convo)).toHaveLength(0);
  });

  it('keeps a customer-facing comment', () => {
    const convo = makeConvoWithParts([makePart()]);
    expect(normalizeIntercomConversationParts(convo)).toHaveLength(1);
  });

  it('filters emitted parts to those newer than sinceEpoch when provided', () => {
    const convo = makeConvoWithParts([
      makePart({ id: 'part-old', created_at: UNIX_TS + 10, body: 'old' }),
      makePart({ id: 'part-new', created_at: UNIX_TS + 100, body: 'new' }),
    ]);
    const facts = normalizeIntercomConversationParts(convo, UNIX_TS + 50);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.content?.body).toBe('new');
  });

  it('includes parts created at the incremental watermark', () => {
    const convo = makeConvoWithParts([
      makePart({ id: 'part-boundary', created_at: UNIX_TS + 50, body: 'at the boundary' }),
    ]);

    const facts = normalizeIntercomConversationParts(convo, UNIX_TS + 50);

    expect(facts).toHaveLength(1);
    expect(facts[0]!.sourceFactId).toBe('intercom:part:part-boundary');
  });

  it('emits every part when sinceEpoch is omitted (cold-start/full-history pull)', () => {
    const convo = makeConvoWithParts([
      makePart({ id: 'part-old', created_at: UNIX_TS + 10, body: 'old' }),
      makePart({ id: 'part-new', created_at: UNIX_TS + 100, body: 'new' }),
    ]);
    expect(normalizeIntercomConversationParts(convo)).toHaveLength(2);
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

  it('fails closed (structural rejection) when a reply part id is the wrong type instead of silently coercing it', () => {
    const event = makeReplyEvent();
    const payload = {
      ...event,
      data: {
        item: {
          ...event.data.item,
          conversation_parts: {
            conversation_parts: [
              { ...event.data.item.conversation_parts!.conversation_parts[0], id: 12345 },
            ],
          },
        },
      },
    };
    const result = connector.normalizeWebhook({ type: 'notification_event', payload });
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('routes a well-formed reply event with a valid part id to a single content fact', () => {
    const result = connector.normalizeWebhook({
      type: 'notification_event',
      payload: makeReplyEvent(),
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.sourceFactId).toBe('intercom:part:part-1');
  });
});

interface FakeCall {
  updatedSince: number | undefined;
  startingAfter: string | undefined;
}

class FakeIntercomClient implements IntercomApiClient {
  calls: FakeCall[] = [];

  constructor(private readonly pages: IntercomConversationPage[]) {}

  async listConversations(
    updatedSince: number | undefined,
    startingAfter: string | undefined,
  ): Promise<IntercomConversationPage> {
    this.calls.push({ updatedSince, startingAfter });
    return (
      this.pages[this.calls.length - 1] ?? {
        conversations: [],
        retrieveFailedConversationIds: [],
      }
    );
  }
}

function onePage(conversations: IntercomConversation[]): IntercomConversationPage[] {
  return [{ conversations, retrieveFailedConversationIds: [] }];
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds a container + content fact per conversation and reports no further pages', async () => {
    const client = new FakeIntercomClient(
      onePage([
        makeConversation('conv-a', UNIX_TS, UNIX_TS + 10),
        makeConversation('conv-b', UNIX_TS + 20, UNIX_TS + 30),
      ]),
    );
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: null });

    expect(result.containers).toHaveLength(2);
    expect(result.facts.filter((f) => f.kind === 'content')).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });

  it('advances the cursor to the max updated_at across the batch', async () => {
    const client = new FakeIntercomClient(
      onePage([
        makeConversation('conv-a', UNIX_TS, UNIX_TS + 10),
        makeConversation('conv-b', UNIX_TS + 20, UNIX_TS + 300),
      ]),
    );
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: null });

    expect(result.cursor.value).toBe(String(UNIX_TS + 300));
  });

  it('passes a stored cursor through to the client as the updatedSince epoch', async () => {
    const client = new FakeIntercomClient(onePage([]));
    const connector = new IntercomConnector(context, client);

    await connector.pull({ value: String(UNIX_TS) });

    expect(client.calls[0]?.updatedSince).toBe(UNIX_TS);
  });

  it('derives updatedSince from options.since (epoch seconds) when no cursor is stored', async () => {
    const client = new FakeIntercomClient(onePage([]));
    const connector = new IntercomConnector(context, client);

    await connector.pull({ value: null }, { since: new Date((UNIX_TS + 5) * 1000) });

    expect(client.calls[0]?.updatedSince).toBe(UNIX_TS + 5);
  });

  it('preserves the incoming cursor when the batch is empty', async () => {
    const client = new FakeIntercomClient(onePage([]));
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: String(UNIX_TS) });

    expect(result.cursor.value).toBe(String(UNIX_TS));
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('emits a fact for every reply part a pulled conversation carries, not just the opening message', async () => {
    const conv = makeConversation('conv-a', UNIX_TS, UNIX_TS + 120);
    conv.conversation_parts = {
      conversation_parts: [
        {
          type: 'conversation_part',
          id: 'part-1',
          part_type: 'comment',
          body: 'first reply',
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + 60,
        },
        {
          type: 'conversation_part',
          id: 'part-2',
          part_type: 'comment',
          body: 'second reply',
          author: { type: 'admin', id: 'admin-2' },
          created_at: UNIX_TS + 120,
        },
      ],
    };
    const client = new FakeIntercomClient(onePage([conv]));
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: null });

    const bodies = result.facts.map((f) => f.content?.body);
    expect(bodies).toEqual(['opening message for conv-a', 'first reply', 'second reply']);
  });

  it('logs (content-free) and keeps the pull when some conversations had a failed Retrieve', async () => {
    const client = new FakeIntercomClient([
      {
        conversations: [makeConversation('conv-a', UNIX_TS, UNIX_TS + 10)],
        retrieveFailedConversationIds: ['missing-1', 'missing-2'],
      },
    ]);
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: null });

    expect(result.containers).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('logs loudly (content-free — counts only) when a conversation exceeded the 500-part Retrieve cap, known Intercom API limitation', async () => {
    const warnSpy = vi.spyOn(context.logger, 'warn');
    const client = new FakeIntercomClient([
      {
        conversations: [makeConversation('conv-a', UNIX_TS, UNIX_TS + 10)],
        retrieveFailedConversationIds: [],
        truncatedConversations: 1,
      },
    ]);
    const connector = new IntercomConnector(context, client);

    const result = await connector.pull({ value: null });

    expect(result.containers).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith('intercom_conversation_truncated', { count: 1 });
  });

  it('does not warn when no conversation was truncated', async () => {
    const warnSpy = vi.spyOn(context.logger, 'warn');
    const client = new FakeIntercomClient(
      onePage([makeConversation('conv-a', UNIX_TS, UNIX_TS + 10)]),
    );
    const connector = new IntercomConnector(context, client);

    await connector.pull({ value: null });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  describe('resumable pagination across pull-due cycles', () => {
    it('saves a startingAfter + in-progress watermark cursor when a page is truncated', async () => {
      const client = new FakeIntercomClient([
        {
          conversations: [makeConversation('conv-a', UNIX_TS, UNIX_TS + 10)],
          nextStartingAfter: 'page-2-cursor',
          retrieveFailedConversationIds: [],
        },
      ]);
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null }, { since: new Date(UNIX_TS * 1000) });

      expect(result.hasMore).toBe(true);
      expect(JSON.parse(result.cursor.value!)).toEqual({
        startingAfter: 'page-2-cursor',
        watermark: String(UNIX_TS + 10),
        cold: true,
        queryFloor: UNIX_TS,
      });
    });

    it('resumes a truncated drain from the saved startingAfter + persisted query floor — never a freshly recomputed options.since', async () => {
      const client = new FakeIntercomClient(onePage([]));
      const connector = new IntercomConnector(context, client);
      const resumeCursor = JSON.stringify({
        startingAfter: 'page-2-cursor',
        watermark: String(UNIX_TS + 10),
        cold: true,
        queryFloor: UNIX_TS - 500,
      });

      // options.since moved forward since the drain started (it's always "now - 12mo", recomputed
      // every pull-due cycle) — the persisted queryFloor must win, not this fresh value.
      await connector.pull({ value: resumeCursor }, { since: new Date((UNIX_TS - 100) * 1000) });

      expect(client.calls[0]).toEqual({
        updatedSince: UNIX_TS - 500,
        startingAfter: 'page-2-cursor',
      });
    });

    it('falls back to a freshly computed floor when resuming a legacy cursor saved before queryFloor existed', async () => {
      const client = new FakeIntercomClient(onePage([]));
      const connector = new IntercomConnector(context, client);
      const resumeCursor = JSON.stringify({
        startingAfter: 'page-2-cursor',
        watermark: String(UNIX_TS + 10),
      });

      await connector.pull({ value: resumeCursor }, { since: new Date((UNIX_TS - 100) * 1000) });

      expect(client.calls[0]).toEqual({
        updatedSince: UNIX_TS - 100,
        startingAfter: 'page-2-cursor',
      });
    });

    it('fails closed to a cold restart when a stored cursor is malformed JSON', async () => {
      const client = new FakeIntercomClient(onePage([]));
      const connector = new IntercomConnector(context, client);

      await connector.pull({ value: '{not valid json' }, { since: new Date(UNIX_TS * 1000) });

      expect(client.calls[0]).toEqual({ updatedSince: UNIX_TS, startingAfter: undefined });
    });

    it('fails closed to a cold restart when a stored cursor has the wrong field types, instead of letting a stringly-typed retryStreak compare wrong', async () => {
      const client = new FakeIntercomClient(onePage([]));
      const connector = new IntercomConnector(context, client);
      const corruptCursor = JSON.stringify({
        watermark: String(UNIX_TS + 10),
        retryFloor: String(UNIX_TS + 10),
        retryStreak: '4', // corrupted: should be a number
      });

      await connector.pull({ value: corruptCursor }, { since: new Date(UNIX_TS * 1000) });

      // Not `updatedSince: UNIX_TS + 10` (the corrupt cursor's own watermark) — the whole cursor is
      // discarded, not partially trusted, so this reads as a genuine cold start.
      expect(client.calls[0]).toEqual({ updatedSince: UNIX_TS, startingAfter: undefined });
    });

    it('collapses back to a plain watermark cursor once the drain completes (no more pages)', async () => {
      const client = new FakeIntercomClient(
        onePage([makeConversation('conv-b', UNIX_TS, UNIX_TS + 50)]),
      );
      const connector = new IntercomConnector(context, client);
      const resumeCursor = JSON.stringify({
        startingAfter: 'page-2-cursor',
        watermark: String(UNIX_TS + 10),
        cold: true,
        queryFloor: UNIX_TS - 500,
      });

      const result = await connector.pull({ value: resumeCursor });

      expect(result.hasMore).toBe(false);
      expect(result.cursor.value).toBe(String(UNIX_TS + 50));
    });
  });

  describe('fact budget per pull', () => {
    it('stops consuming further conversations once the fact budget is reached, resuming from a fresh watermark next cycle instead of Intercom-native pagination', async () => {
      const FACT_BUDGET = 750;
      const conversations = Array.from({ length: FACT_BUDGET + 10 }, (_, i) =>
        makeConversation(`conv-${i}`, UNIX_TS, UNIX_TS + i + 1),
      );
      const client = new FakeIntercomClient(onePage(conversations));
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null });

      expect(result.facts).toHaveLength(FACT_BUDGET);
      expect(result.hasMore).toBe(true);
      const cursor = JSON.parse(result.cursor.value!);
      // Every conversation here emits exactly one fact (opening message only), so the budget cuts
      // off exactly at the FACT_BUDGETth conversation's watermark — the tail is never touched.
      expect(cursor.watermark).toBe(String(UNIX_TS + FACT_BUDGET));
      expect(cursor.startingAfter).toBeUndefined();
      expect(cursor.queryFloor).toBeUndefined();
      expect(cursor.cold).toBe(true);
    });

    it('does not cut off before the budget when the batch is smaller than it', async () => {
      const client = new FakeIntercomClient(
        onePage([
          makeConversation('conv-a', UNIX_TS, UNIX_TS + 10),
          makeConversation('conv-b', UNIX_TS, UNIX_TS + 20),
        ]),
      );
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null });

      expect(result.facts).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('watermark exclusion on Retrieve failure', () => {
    it('caps the watermark below a failed conversation even when a later, successful conversation has a higher updated_at', async () => {
      const client = new FakeIntercomClient([
        {
          conversations: [
            makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10),
            makeConversation('conv-ok', UNIX_TS, UNIX_TS + 50),
          ],
          retrieveFailedConversationIds: ['conv-failed'],
        },
      ]);
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null });

      // NOT UNIX_TS + 50 (conv-ok's updated_at) — that would let the next pull's floor skip past
      // the failed conversation forever. The cursor stays JSON (not the bare watermark string)
      // because `retryFloor` must survive to the next pull too — otherwise the retried
      // conversation's parts get filtered out by the very watermark that re-includes it.
      const cursor = JSON.parse(result.cursor.value!);
      expect(cursor.watermark).toBe(String(UNIX_TS + 10));
      expect(cursor.retryFloor).toBe(String(UNIX_TS + 10));
      expect(cursor.retryStreak).toBe(1);
    });

    it('revisits the failed conversation on the next pull once the capped watermark is used as the floor', async () => {
      const firstPull = new FakeIntercomClient([
        {
          conversations: [
            makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10),
            makeConversation('conv-ok', UNIX_TS, UNIX_TS + 50),
          ],
          retrieveFailedConversationIds: ['conv-failed'],
        },
      ]);
      const connector = new IntercomConnector(context, firstPull);
      const first = await connector.pull({ value: null });

      const secondPull = new FakeIntercomClient(onePage([]));
      const retryConnector = new IntercomConnector(context, secondPull);
      await retryConnector.pull({ value: first.cursor.value });

      // Search's `>` behaves inclusive (this file's own documented assumption), so a floor equal
      // to conv-failed's own updated_at still re-includes it next time.
      expect(secondPull.calls[0]?.updatedSince).toBe(UNIX_TS + 10);
    });

    it('does not cap the watermark when nothing failed', async () => {
      const client = new FakeIntercomClient(
        onePage([
          makeConversation('conv-a', UNIX_TS, UNIX_TS + 10),
          makeConversation('conv-b', UNIX_TS, UNIX_TS + 50),
        ]),
      );
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null });

      expect(result.cursor.value).toBe(String(UNIX_TS + 50));
    });
  });

  describe('retry-after-failure part exemption', () => {
    it('threads two pull cycles: a conversation whose Retrieve fails, then succeeds with real parts, and those replies actually appear', async () => {
      const firstPull = new FakeIntercomClient([
        {
          conversations: [makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10)],
          retrieveFailedConversationIds: ['conv-failed'],
        },
      ]);
      const connector = new IntercomConnector(context, firstPull);
      const first = await connector.pull({ value: null });

      // Second cycle: Retrieve for conv-failed now succeeds and returns its real parts — created
      // BEFORE the conversation's own updated_at, like every part always is. A partsFloor derived
      // from the watermark that re-includes this conversation (UNIX_TS + 10, capped below it on the
      // first pull) would filter every one of these parts back out, silently dropping a retried
      // conversation's replies. The exemption is derived from `retryFloor` (whole-drain scoped)
      // rather than a per-conversation id set.
      const conv = makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10);
      conv.conversation_parts = {
        conversation_parts: [
          {
            type: 'conversation_part',
            id: 'part-retry-1',
            part_type: 'comment',
            body: 'the reply that a naive incremental floor would drop',
            author: { type: 'admin', id: 'admin-1' },
            created_at: UNIX_TS + 8,
          },
        ],
      };
      const secondPull = new FakeIntercomClient([
        { conversations: [conv], retrieveFailedConversationIds: [] },
      ]);
      const retryConnector = new IntercomConnector(context, secondPull);
      const second = await retryConnector.pull({ value: first.cursor.value });

      const bodies = second.facts.map((f) => f.content?.body);
      expect(bodies).toContain('the reply that a naive incremental floor would drop');
    });

    it('collapses back to a bare watermark cursor (retryFloor cleared) once a whole fresh drain re-covers the range with zero failures', async () => {
      const firstPull = new FakeIntercomClient([
        {
          conversations: [makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10)],
          retrieveFailedConversationIds: ['conv-failed'],
        },
      ]);
      const connector = new IntercomConnector(context, firstPull);
      const first = await connector.pull({ value: null });

      const secondPull = new FakeIntercomClient([
        {
          conversations: [makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10)],
          retrieveFailedConversationIds: [],
        },
      ]);
      const retryConnector = new IntercomConnector(context, secondPull);
      const second = await retryConnector.pull({ value: first.cursor.value });

      expect(second.cursor.value).toBe(String(UNIX_TS + 10));
    });
  });

  describe('incremental parts-only filtering', () => {
    function conversationWithOldAndNewParts(): IntercomConversation {
      const convo = makeConversation('conv-a', UNIX_TS, UNIX_TS + 200);
      convo.conversation_parts = {
        conversation_parts: [
          {
            type: 'conversation_part',
            id: 'part-old',
            part_type: 'comment',
            body: 'already ingested on a prior pull',
            author: { type: 'admin', id: 'admin-1' },
            created_at: UNIX_TS + 50,
          },
          {
            type: 'conversation_part',
            id: 'part-new',
            part_type: 'comment',
            body: 'new since the last pull',
            author: { type: 'admin', id: 'admin-1' },
            created_at: UNIX_TS + 200,
          },
        ],
      };
      return convo;
    }

    it('on an incremental (non-cold-start) pull, only emits parts newer than the stored watermark', async () => {
      const client = new FakeIntercomClient(onePage([conversationWithOldAndNewParts()]));
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: String(UNIX_TS + 100) });

      const bodies = result.facts.map((f) => f.content?.body);
      expect(bodies).toContain('new since the last pull');
      expect(bodies).not.toContain('already ingested on a prior pull');
    });

    it('on a cold-start pull (no stored cursor), emits every part regardless of created_at', async () => {
      const client = new FakeIntercomClient(onePage([conversationWithOldAndNewParts()]));
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null });

      const bodies = result.facts.map((f) => f.content?.body);
      expect(bodies).toContain('new since the last pull');
      expect(bodies).toContain('already ingested on a prior pull');
    });

    it('keeps emitting full history across a budget-truncated cold-start drain (cold flag survives the pause)', async () => {
      const FACT_BUDGET = 750;
      const firstBatch = Array.from({ length: FACT_BUDGET + 1 }, (_, i) =>
        makeConversation(`conv-${i}`, UNIX_TS, UNIX_TS + i + 1),
      );
      const firstPage = new FakeIntercomClient(onePage(firstBatch));
      const connector = new IntercomConnector(context, firstPage);
      const first = await connector.pull({ value: null });
      expect(first.hasMore).toBe(true);
      expect(JSON.parse(first.cursor.value!).cold).toBe(true);

      const secondPage = new FakeIntercomClient(onePage([conversationWithOldAndNewParts()]));
      const resumedConnector = new IntercomConnector(context, secondPage);
      const second = await resumedConnector.pull({ value: first.cursor.value });

      const bodies = second.facts.map((f) => f.content?.body);
      expect(bodies).toContain('already ingested on a prior pull');
    });
  });

  describe('budget-cutoff resume does not depend on Search result order', () => {
    function bigConversation(
      id: string,
      updatedAt: number,
      partCount: number,
    ): IntercomConversation {
      const convo = makeConversation(id, UNIX_TS, updatedAt);
      convo.conversation_parts = {
        conversation_parts: Array.from({ length: partCount }, (_, i) => ({
          type: 'conversation_part',
          id: `${id}-part-${i}`,
          part_type: 'comment',
          body: `${id} reply ${i}`,
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + i,
        })),
      };
      return convo;
    }

    it('re-fetching the same page in a DIFFERENT order after a budget cutoff still emits every conversation exactly once, none skipped', async () => {
      const convA = bigConversation('conv-a', UNIX_TS + 10, 400);
      const convB = bigConversation('conv-b', UNIX_TS + 20, 400);
      const convC = bigConversation('conv-c', UNIX_TS + 30, 10);

      // A resume strategy based on `Search(updated_at > watermark)` alone is correct only if results
      // arrive in ascending order — an assumption the SDK's SearchRequest type can't even request,
      // let alone verify. This double simulates the SAME already-fetched page coming back in a
      // DIFFERENT order on the resumed call, which such a strategy would silently and permanently
      // skip conversations against.
      const client = new FakeIntercomClient([
        { conversations: [convA, convB, convC], retrieveFailedConversationIds: [] },
        { conversations: [convC, convB, convA], retrieveFailedConversationIds: [] },
      ]);
      const connector = new IntercomConnector(context, client);

      const first = await connector.pull({ value: null });
      expect(first.hasMore).toBe(true);

      const second = await connector.pull(first.cursor);
      expect(second.hasMore).toBe(false);

      const allBodies = new Set([...first.facts, ...second.facts].map((f) => f.content?.body));
      for (const conv of [convA, convB, convC]) {
        for (const part of conv.conversation_parts!.conversation_parts) {
          expect(allBodies.has(part.body)).toBe(true);
        }
      }
    });

    it('never re-emits a conversation already captured before the cutoff, even though the resumed fetch returns it again', async () => {
      const convA = bigConversation('conv-a', UNIX_TS + 10, 400);
      const convB = bigConversation('conv-b', UNIX_TS + 20, 400);
      const convC = bigConversation('conv-c', UNIX_TS + 30, 10);
      const client = new FakeIntercomClient([
        { conversations: [convA, convB, convC], retrieveFailedConversationIds: [] },
        { conversations: [convC, convB, convA], retrieveFailedConversationIds: [] },
      ]);
      const connector = new IntercomConnector(context, client);

      const first = await connector.pull({ value: null });
      const second = await connector.pull(first.cursor);

      const convASourceFactIds = second.facts
        .filter((f) => f.entities?.includes('conv-a'))
        .map((f) => f.sourceFactId);
      expect(convASourceFactIds).toHaveLength(0);
    });
  });

  describe('fact budget ceiling is a soft cap, not exact', () => {
    it('one additional conversation can push a single call to ~budget + 500 facts, since the check runs before each conversation, not before each fact', async () => {
      const FACT_BUDGET = 750;
      const filler = Array.from({ length: FACT_BUDGET - 1 }, (_, i) =>
        makeConversation(`conv-filler-${i}`, UNIX_TS, UNIX_TS + i + 1),
      );
      const bigConvo = makeConversation('conv-big', UNIX_TS, UNIX_TS + FACT_BUDGET + 1);
      bigConvo.conversation_parts = {
        conversation_parts: Array.from({ length: 500 }, (_, i) => ({
          type: 'conversation_part',
          id: `part-${i}`,
          part_type: 'comment',
          body: `reply ${i}`,
          author: { type: 'admin', id: 'admin-1' },
          created_at: UNIX_TS + i,
        })),
      };
      const client = new FakeIntercomClient(onePage([...filler, bigConvo]));
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null });

      // 749 filler facts + conv-big's own opening message + its 500 parts = 1,250 — the real
      // ceiling for one call, not FACT_BUDGET_PER_PULL's nominal 750.
      expect(result.facts).toHaveLength(FACT_BUDGET - 1 + 1 + 500);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('parts-floor / query-floor conflation on a multi-page drain', () => {
    it("emits a page-2+ conversation's parts created after the drain's stable start floor, even though page 1 already advanced the persisted watermark past them", async () => {
      const driftedWatermark = UNIX_TS + 500; // what page 1's own processing already advanced watermark to
      const stableQueryFloor = UNIX_TS; // the drain's true, never-moving start floor
      const conv = makeConversation('conv-late', UNIX_TS, UNIX_TS + 50); // its own updated_at predates driftedWatermark
      conv.conversation_parts = {
        conversation_parts: [
          {
            type: 'conversation_part',
            id: 'part-drifted',
            part_type: 'comment',
            body: 'a reply after the drain floor but before the drifted watermark',
            author: { type: 'admin', id: 'admin-1' },
            created_at: UNIX_TS + 30, // after stableQueryFloor, but before driftedWatermark
          },
        ],
      };
      const client = new FakeIntercomClient(onePage([conv]));
      const connector = new IntercomConnector(context, client);
      const resumeCursor = JSON.stringify({
        startingAfter: 'page-2-cursor',
        watermark: String(driftedWatermark),
        cold: false,
        queryFloor: stableQueryFloor,
      });

      const result = await connector.pull({ value: resumeCursor });

      const bodies = result.facts.map((f) => f.content?.body);
      expect(bodies).toContain('a reply after the drain floor but before the drifted watermark');
    });
  });

  describe('retry floor survives a multi-page drain', () => {
    it("keeps the persisted watermark capped at the failed conversation's updated_at across the whole drain, not overwritten by a later page with no failures of its own", async () => {
      const client = new FakeIntercomClient([
        {
          conversations: [
            makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10),
            makeConversation('conv-ok-1', UNIX_TS, UNIX_TS + 30),
          ],
          nextStartingAfter: 'page-2-cursor',
          retrieveFailedConversationIds: ['conv-failed'],
        },
        {
          conversations: [makeConversation('conv-ok-2', UNIX_TS, UNIX_TS + 999)],
          retrieveFailedConversationIds: [],
        },
      ]);
      const connector = new IntercomConnector(context, client);

      const first = await connector.pull({ value: null }, { since: new Date(UNIX_TS * 1000) });
      expect(first.hasMore).toBe(true);

      const second = await connector.pull(first.cursor);
      expect(second.hasMore).toBe(false);

      // NOT UNIX_TS + 999 (conv-ok-2's updated_at from page 2) — page 2 has zero failures of its
      // own, and a per-page-only cap would silently overwrite page 1's cap.
      const cursor = JSON.parse(second.cursor.value!);
      expect(cursor.watermark).toBe(String(UNIX_TS + 10));
    });
  });

  describe("cursor size stays within SSM's 4096-char Standard-tier parameter limit", () => {
    function realisticId(n: number): string {
      // Intercom conversation ids are large decimal numbers; ~19 digits is the documented worst
      // case. Built by string padding, not numeric addition — 1e18-scale numbers exceed
      // Number.MAX_SAFE_INTEGER, so `1e18 + n` silently collides distinct `n` onto the same id.
      return `1000000000000${String(n).padStart(6, '0')}`;
    }

    function conversationWithParts(id: string, updatedAt: number, extraParts: number) {
      const convo = makeConversation(id, UNIX_TS, updatedAt);
      if (extraParts > 0) {
        convo.conversation_parts = {
          conversation_parts: Array.from({ length: extraParts }, (_, i) => ({
            type: 'conversation_part' as const,
            id: `${id}-part-${i}`,
            part_type: 'comment',
            body: `${id} reply ${i}`,
            author: { type: 'admin' as const, id: 'admin-1' },
            created_at: UNIX_TS + i,
          })),
        };
      }
      return convo;
    }

    it('the true worst-case cursor (mid-drain, startingAfter + queryFloor + retryFloor + retryStreak all populated, 150 ~19-digit ids) encodes under the SSM limit', async () => {
      const CURSOR_SAFETY_MARGIN_CHARS = 4096; // must match the source constant of the same name
      // 5 facts each (1 opening + 4 parts) x 150 = exactly 750, so the budget trips on the 151st
      // (sentinel) item — leaving all 150 real ids, the true worst case, in pageEmittedIds. A real
      // page can never exceed 150 conversations (CONVERSATIONS_PAGE_SIZE); the sentinel here only
      // exists to make the FakeIntercomClient hit that boundary deterministically. Resuming from a
      // cursor that already carries startingAfter/queryFloor/retryFloor/retryStreak (not a bare
      // cold-start cursor) is what makes this the actual largest shape `encodeCursor` ever sees.
      const filler = Array.from({ length: 150 }, (_, i) =>
        conversationWithParts(realisticId(i), UNIX_TS + i + 1, 4),
      );
      const sentinel = makeConversation(realisticId(999), UNIX_TS, UNIX_TS + 1000);
      const client = new FakeIntercomClient(onePage([...filler, sentinel]));
      const connector = new IntercomConnector(context, client);
      const resumeCursor = JSON.stringify({
        startingAfter: 'page-3-cursor',
        watermark: String(UNIX_TS - 100),
        cold: true,
        queryFloor: UNIX_TS - 500,
        retryFloor: String(UNIX_TS - 200),
        retryStreak: 2,
      });

      const result = await connector.pull({ value: resumeCursor });

      expect(result.hasMore).toBe(true);
      const cursor = JSON.parse(result.cursor.value!);
      expect(cursor.pageEmittedIds).toHaveLength(150);
      expect(cursor.startingAfter).toBe('page-3-cursor');
      expect(cursor.queryFloor).toBe(UNIX_TS - 500);
      expect(cursor.retryFloor).toBe(String(UNIX_TS - 200));
      expect(cursor.retryStreak).toBe(2);
      expect(result.cursor.value!.length).toBeLessThan(CURSOR_SAFETY_MARGIN_CHARS);
    });

    it('falls back to restarting the whole drain from its stable floor (never throwing) if a cursor would still exceed the SSM limit', async () => {
      const warnSpy = vi.spyOn(context.logger, 'warn');
      // Deliberately far beyond any real page's bound, to prove the fallback (not the size
      // calculation) is what keeps `saveCursor` from ever throwing — an oversized cursor would
      // fail to persist and force endless redelivery of the same pull — if that bound is ever
      // violated by a future change.
      const filler = Array.from({ length: 800 }, (_, i) =>
        makeConversation(realisticId(i), UNIX_TS, UNIX_TS + i + 1),
      );
      const sentinel = makeConversation(realisticId(9999), UNIX_TS, UNIX_TS + 99999);
      const client = new FakeIntercomClient(onePage([...filler, sentinel]));
      const connector = new IntercomConnector(context, client);

      const result = await connector.pull({ value: null }, { since: new Date(UNIX_TS * 1000) });

      expect(() => JSON.parse(result.cursor.value!)).not.toThrow();
      const cursor = JSON.parse(result.cursor.value!);
      // Both progress fields are dropped, not just pageEmittedIds — keeping startingAfter alone
      // would re-fetch the identical page with an empty skip set and trip the same overflow again.
      expect(cursor.pageEmittedIds).toBeUndefined();
      expect(cursor.startingAfter).toBeUndefined();
      // The watermark resets to the drain's own stable floor rather than the value this page's
      // partial processing had already advanced it to, so the restart can't silently skip anything.
      expect(cursor.watermark).toBe(String(UNIX_TS));
      expect(result.cursor.value!.length).toBeLessThan(4096);
      expect(warnSpy).toHaveBeenCalledWith(
        'intercom_cursor_oversize',
        expect.objectContaining({ bytes: expect.any(Number) }),
      );
    });

    it('a restarted drain after an overflow fallback re-queries from the stable floor, not the abandoned partial progress', async () => {
      const filler = Array.from({ length: 800 }, (_, i) =>
        makeConversation(realisticId(i), UNIX_TS, UNIX_TS + i + 1),
      );
      const sentinel = makeConversation(realisticId(9999), UNIX_TS, UNIX_TS + 99999);
      const overflowingPage = new FakeIntercomClient(onePage([...filler, sentinel]));
      const connector = new IntercomConnector(context, overflowingPage);
      const first = await connector.pull({ value: null }, { since: new Date(UNIX_TS * 1000) });

      const resumedClient = new FakeIntercomClient(onePage([]));
      const resumedConnector = new IntercomConnector(context, resumedClient);
      await resumedConnector.pull({ value: first.cursor.value });

      expect(resumedClient.calls[0]).toEqual({
        updatedSince: UNIX_TS,
        startingAfter: undefined,
      });
    });
  });

  describe('bounded give-up on a permanently failing conversation', () => {
    it('advances the watermark past a conversation that has failed Retrieve for RETRY_GIVE_UP_THRESHOLD consecutive pulls, logging prominently', async () => {
      const RETRY_GIVE_UP_THRESHOLD = 5; // must match the source constant of the same name
      const client = new FakeIntercomClient(
        Array.from({ length: RETRY_GIVE_UP_THRESHOLD }, () => ({
          conversations: [
            makeConversation('conv-broken', UNIX_TS, UNIX_TS + 10),
            makeConversation('conv-ok', UNIX_TS, UNIX_TS + 50),
          ],
          retrieveFailedConversationIds: ['conv-broken'],
        })),
      );
      const connector = new IntercomConnector(context, client);
      const warnSpy = vi.spyOn(context.logger, 'warn');

      let cursorValue: string | null = null;
      for (let i = 0; i < RETRY_GIVE_UP_THRESHOLD; i++) {
        const result = await connector.pull({ value: cursorValue });
        cursorValue = result.cursor.value;
      }

      // conv-ok's updated_at, not conv-broken's — the give-up finally let the watermark through.
      expect(cursorValue).toBe(String(UNIX_TS + 50));
      expect(warnSpy).toHaveBeenCalledWith('intercom_retrieve_give_up', {
        attempt: RETRY_GIVE_UP_THRESHOLD,
      });
    });

    it('keeps capping the watermark before the give-up threshold is reached', async () => {
      const client = new FakeIntercomClient(
        Array.from({ length: 3 }, () => ({
          conversations: [
            makeConversation('conv-broken', UNIX_TS, UNIX_TS + 10),
            makeConversation('conv-ok', UNIX_TS, UNIX_TS + 50),
          ],
          retrieveFailedConversationIds: ['conv-broken'],
        })),
      );
      const connector = new IntercomConnector(context, client);

      let cursorValue: string | null = null;
      for (let i = 0; i < 3; i++) {
        const result = await connector.pull({ value: cursorValue });
        cursorValue = result.cursor.value;
      }

      const cursor = JSON.parse(cursorValue!);
      expect(cursor.watermark).toBe(String(UNIX_TS + 10));
      expect(cursor.retryStreak).toBe(3);
    });

    it('does not prematurely give up when a single drain spans more pages than the give-up threshold', async () => {
      const RETRY_GIVE_UP_THRESHOLD = 5; // must match the source constant of the same name
      const pageCount = RETRY_GIVE_UP_THRESHOLD + 2; // more pull() calls than the threshold, one drain
      const pages: IntercomConversationPage[] = Array.from({ length: pageCount }, (_, i) =>
        i === 0
          ? {
              conversations: [
                makeConversation('conv-failed', UNIX_TS, UNIX_TS + 10),
                makeConversation('conv-ok-0', UNIX_TS, UNIX_TS + 20),
              ],
              nextStartingAfter: 'page-1',
              retrieveFailedConversationIds: ['conv-failed'],
            }
          : {
              conversations: [makeConversation(`conv-ok-${i}`, UNIX_TS, UNIX_TS + 20 + i)],
              nextStartingAfter: `page-${i + 1}`,
              retrieveFailedConversationIds: [],
            },
      );
      const client = new FakeIntercomClient(pages);
      const connector = new IntercomConnector(context, client);

      let cursorValue: string | null = null;
      for (let i = 0; i < pageCount; i++) {
        const result = await connector.pull(
          { value: cursorValue },
          { since: new Date(UNIX_TS * 1000) },
        );
        cursorValue = result.cursor.value;
        expect(result.hasMore).toBe(true);
      }

      // Still capped at conv-failed, not let through, even after more pull() calls than
      // RETRY_GIVE_UP_THRESHOLD — every page after the first belongs to the SAME drain and never
      // gave conv-failed an actual chance to be re-fetched, so only one real attempt has been made.
      const cursor = JSON.parse(cursorValue!);
      expect(cursor.watermark).toBe(String(UNIX_TS + 10));
      expect(cursor.retryStreak).toBe(1);
    });

    it('eventually gives up after RETRY_GIVE_UP_THRESHOLD genuine drain-restart cycles, even when each restart itself spans multiple pages', async () => {
      const RETRY_GIVE_UP_THRESHOLD = 5; // must match the source constant of the same name
      const pages: IntercomConversationPage[] = [];
      for (let cycle = 0; cycle < RETRY_GIVE_UP_THRESHOLD; cycle++) {
        pages.push({
          conversations: [
            makeConversation('conv-broken', UNIX_TS, UNIX_TS + 10),
            makeConversation(`conv-mid-${cycle}`, UNIX_TS, UNIX_TS + 20),
          ],
          nextStartingAfter: `page-${cycle}-b`,
          retrieveFailedConversationIds: ['conv-broken'],
        });
        pages.push({
          conversations: [makeConversation(`conv-ok-${cycle}`, UNIX_TS, UNIX_TS + 900 + cycle)],
          retrieveFailedConversationIds: [],
        });
      }
      const client = new FakeIntercomClient(pages);
      const connector = new IntercomConnector(context, client);
      const warnSpy = vi.spyOn(context.logger, 'warn');

      let cursorValue: string | null = null;
      for (let i = 0; i < pages.length; i++) {
        const result = await connector.pull(
          { value: cursorValue },
          { since: new Date(UNIX_TS * 1000) },
        );
        cursorValue = result.cursor.value;
      }

      // conv-ok's own watermark from the final cycle, not capped at conv-broken's — the give-up
      // let it through after RETRY_GIVE_UP_THRESHOLD genuine drain restarts, even though this
      // scenario spans twice that many pull() calls (two pages per restart).
      expect(cursorValue).toBe(String(UNIX_TS + 900 + RETRY_GIVE_UP_THRESHOLD - 1));
      expect(warnSpy).toHaveBeenCalledWith('intercom_retrieve_give_up', {
        attempt: RETRY_GIVE_UP_THRESHOLD,
      });
    });
  });
});

function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

function sdkConversationSummary(id: string) {
  return {
    type: 'conversation',
    id,
    created_at: UNIX_TS,
    updated_at: UNIX_TS,
    source: { body: 'opening message', author: { type: 'user', id: 'user-1' } },
  };
}

describe('IntercomSdkClient — talks to the real intercom-client SDK over a stubbed fetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retrieves each conversation individually, since List/Search never carry conversation_parts', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse({
          ...sdkConversationSummary('conv-1'),
          conversation_parts: {
            conversation_parts: [
              {
                type: 'conversation_part',
                id: 'part-1',
                part_type: 'comment',
                body: 'the actual reply',
                author: { type: 'admin', id: 'admin-1' },
                created_at: UNIX_TS + 60,
              },
            ],
          },
        });
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.conversations).toHaveLength(1);
    expect(page.retrieveFailedConversationIds).toEqual([]);
    expect(page.conversations[0]!.conversation_parts?.conversation_parts).toHaveLength(1);
    expect(page.conversations[0]!.conversation_parts?.conversation_parts[0]!.body).toBe(
      'the actual reply',
    );
  });

  it('requests one bounded page (150, Search/List ceiling) and reports the next page cursor', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        expect(url).toContain('per_page=150');
        return jsonResponse({
          conversations: [sdkConversationSummary('conv-1')],
          pages: { next: { starting_after: 'next-page-cursor' } },
        });
      }
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse(sdkConversationSummary('conv-1'));
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.nextStartingAfter).toBe('next-page-cursor');
  });

  it('uses Search — not List — for an incremental pull, filtering updated_at server-side (inclusive: Intercom docs "greater or equal")', async () => {
    let searchBody: { query?: unknown; pagination?: unknown } | undefined;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === 'https://api.intercom.io/conversations/search') {
        searchBody = init?.body ? JSON.parse(String(init.body)) : undefined;
        return jsonResponse({ conversations: [sdkConversationSummary('conv-2')] });
      }
      if (url === 'https://api.intercom.io/conversations/conv-2') {
        return jsonResponse(sdkConversationSummary('conv-2'));
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    await client.listConversations(UNIX_TS, undefined);

    expect(searchBody).toMatchObject({
      query: { field: 'updated_at', operator: '>', value: UNIX_TS },
      pagination: { per_page: 150 },
    });
  });

  it('falls back to the list/search summary (no parts) when one conversation Retrieve fails, without failing the whole page', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse({ errors: [{ code: 'not_found' }] }, { status: 404 });
      }
      if (url === 'https://api.intercom.io/conversations/conv-2') {
        return jsonResponse(sdkConversationSummary('conv-2'));
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({
          conversations: [sdkConversationSummary('conv-1'), sdkConversationSummary('conv-2')],
        });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.conversations).toHaveLength(2);
    expect(page.retrieveFailedConversationIds).toEqual(['conv-1']);
    expect(page.conversations.find((c) => c.id === 'conv-1')?.conversation_parts).toBeUndefined();
    expect(page.conversations.find((c) => c.id === 'conv-2')?.conversation_parts).toBeUndefined();
  });

  it("reports truncatedConversations when Retrieve returns fewer parts than conversation_parts.total_count (Intercom's 500-part hard cap)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse({
          ...sdkConversationSummary('conv-1'),
          conversation_parts: {
            conversation_parts: [
              {
                type: 'conversation_part',
                id: 'part-1',
                part_type: 'comment',
                body: 'most recent reply',
                author: { type: 'admin', id: 'admin-1' },
                created_at: UNIX_TS + 60,
              },
            ],
            total_count: 501,
          },
        });
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.truncatedConversations).toBe(1);
    expect(page.conversations[0]!.conversation_parts?.conversation_parts).toHaveLength(1);
  });

  it('falls back to statistics.count_conversation_parts to detect truncation when conversation_parts.total_count is absent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse({
          ...sdkConversationSummary('conv-1'),
          statistics: { count_conversation_parts: 800 },
          conversation_parts: {
            conversation_parts: [
              {
                type: 'conversation_part',
                id: 'part-1',
                part_type: 'comment',
                body: 'most recent reply',
                author: { type: 'admin', id: 'admin-1' },
                created_at: UNIX_TS + 60,
              },
            ],
          },
        });
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.truncatedConversations).toBe(1);
  });

  it('does not report truncation when the reported total matches the returned parts', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse({
          ...sdkConversationSummary('conv-1'),
          conversation_parts: {
            conversation_parts: [
              {
                type: 'conversation_part',
                id: 'part-1',
                part_type: 'comment',
                body: 'the only reply',
                author: { type: 'admin', id: 'admin-1' },
                created_at: UNIX_TS + 60,
              },
            ],
            total_count: 1,
          },
        });
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.truncatedConversations).toBe(0);
  });

  it('drops a conversation part with no id rather than defaulting to a shared placeholder', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse({
          ...sdkConversationSummary('conv-1'),
          conversation_parts: {
            conversation_parts: [
              {
                type: 'conversation_part',
                // no id
                part_type: 'comment',
                body: 'a part Intercom sent with no id',
                author: { type: 'admin', id: 'admin-1' },
                created_at: UNIX_TS + 60,
              },
              {
                type: 'conversation_part',
                id: 'part-2',
                part_type: 'comment',
                body: 'a normal, id-bearing part',
                author: { type: 'admin', id: 'admin-1' },
                created_at: UNIX_TS + 61,
              },
            ],
          },
        });
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.partsMissingId).toBe(1);
    const parts = page.conversations[0]!.conversation_parts?.conversation_parts ?? [];
    expect(parts).toHaveLength(1);
    expect(parts[0]!.id).toBe('part-2');
  });

  it('reports truncation from the raw.length hard-cap backstop when both total_count and statistics are absent', async () => {
    const RETRIEVE_PARTS_HARD_CAP = 500;
    const parts = Array.from({ length: RETRIEVE_PARTS_HARD_CAP }, (_, i) => ({
      type: 'conversation_part',
      id: `part-${i}`,
      part_type: 'comment',
      body: `reply ${i}`,
      author: { type: 'admin', id: 'admin-1' },
      created_at: UNIX_TS + i,
    }));
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        // Deliberately no total_count and no statistics — the metadata-based signal alone would
        // fail open (reportedTotal defaults to 0, `0 > 500` is false) and never flag this.
        return jsonResponse({
          ...sdkConversationSummary('conv-1'),
          conversation_parts: { conversation_parts: parts },
        });
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.truncatedConversations).toBe(1);
  });

  it('does not report truncation below the hard cap when metadata is also absent', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://api.intercom.io/conversations/conv-1') {
        return jsonResponse({
          ...sdkConversationSummary('conv-1'),
          conversation_parts: {
            conversation_parts: [
              {
                type: 'conversation_part',
                id: 'part-1',
                part_type: 'comment',
                body: 'the only reply',
                author: { type: 'admin', id: 'admin-1' },
                created_at: UNIX_TS + 60,
              },
            ],
          },
        });
      }
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const page = await client.listConversations(undefined, undefined);

    expect(page.truncatedConversations).toBe(0);
  });

  it('retries a 429 honoring X-RateLimit-Reset, then succeeds', async () => {
    vi.useFakeTimers();
    const resetAt = Math.floor(Date.now() / 1000) + 1;
    let listCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://api.intercom.io/conversations?')) {
        listCalls += 1;
        if (listCalls === 1) {
          return jsonResponse(
            { errors: [{ code: 'rate_limit_exceeded' }] },
            { status: 429, headers: { 'X-RateLimit-Reset': String(resetAt) } },
          );
        }
        return jsonResponse({ conversations: [] });
      }
      throw new Error(`unexpected request to ${url}`);
    });

    const client = new IntercomSdkClient('token');
    const resultPromise = client.listConversations(undefined, undefined);
    await vi.advanceTimersByTimeAsync(2000);
    const page = await resultPromise;

    expect(page.conversations).toEqual([]);
    expect(listCalls).toBe(2);
  });

  describe('Retrieve fan-out escalates 401/403/429 instead of swallowing them', () => {
    it('propagates a 403 during Retrieve as a status-carrying error instead of counting it as a per-conversation failure', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://api.intercom.io/conversations/conv-1') {
          return jsonResponse({ errors: [{ code: 'forbidden' }] }, { status: 403 });
        }
        if (url.startsWith('https://api.intercom.io/conversations?')) {
          return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
        }
        throw new Error(`unexpected request to ${url}`);
      });

      const client = new IntercomSdkClient('token');

      await expect(client.listConversations(undefined, undefined)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('propagates a 401 during Retrieve as a status-carrying error instead of counting it as a per-conversation failure', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://api.intercom.io/conversations/conv-1') {
          return jsonResponse({ errors: [{ code: 'unauthorized' }] }, { status: 401 });
        }
        if (url.startsWith('https://api.intercom.io/conversations?')) {
          return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
        }
        throw new Error(`unexpected request to ${url}`);
      });

      const client = new IntercomSdkClient('token');

      await expect(client.listConversations(undefined, undefined)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('propagates a sustained 429 (retries exhausted) during Retrieve instead of counting it as a per-conversation failure', async () => {
      vi.useFakeTimers();
      const resetAt = Math.floor(Date.now() / 1000) + 1;
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://api.intercom.io/conversations/conv-1') {
          return jsonResponse(
            { errors: [{ code: 'rate_limit_exceeded' }] },
            { status: 429, headers: { 'X-RateLimit-Reset': String(resetAt) } },
          );
        }
        if (url.startsWith('https://api.intercom.io/conversations?')) {
          return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
        }
        throw new Error(`unexpected request to ${url}`);
      });

      const client = new IntercomSdkClient('token');
      const resultPromise = client.listConversations(undefined, undefined);
      resultPromise.catch(() => {});
      await vi.advanceTimersByTimeAsync(200000);

      await expect(resultPromise).rejects.toMatchObject({ status: 429 });
    });

    it('still treats a 404 (e.g. a deleted conversation) as a per-conversation failure, not an escalation', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url === 'https://api.intercom.io/conversations/conv-1') {
          return jsonResponse({ errors: [{ code: 'not_found' }] }, { status: 404 });
        }
        if (url.startsWith('https://api.intercom.io/conversations?')) {
          return jsonResponse({ conversations: [sdkConversationSummary('conv-1')] });
        }
        throw new Error(`unexpected request to ${url}`);
      });

      const client = new IntercomSdkClient('token');
      const page = await client.listConversations(undefined, undefined);

      expect(page.retrieveFailedConversationIds).toEqual(['conv-1']);
    });
  });
});
