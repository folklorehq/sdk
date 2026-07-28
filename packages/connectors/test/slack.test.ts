// SPDX-License-Identifier: Apache-2.0
import { Agent } from 'node:https';
import { describe, expect, it } from 'vitest';
import {
  SlackConnector,
  normalizeSlackMessage,
  normalizeSlackReaction,
  slackThreadId,
} from '../src/slack/index.js';
import { HttpSlackClient } from '../src/slack/HttpSlackClient.js';
import type { SlackClient } from '../src/slack/index.js';
import type { Logger } from '@folklore/core';
import type { SlackMessage, SlackReactionEvent } from '../src/slack/index.js';

describe('HttpSlackClient egress agent', () => {
  it('hands the supplied agent to the underlying WebClient (axios sets proxy: false)', () => {
    const agent = new Agent();
    const client = new HttpSlackClient('xoxb-token', agent) as unknown as {
      client: { axios: { defaults: { httpsAgent?: unknown; httpAgent?: unknown } } };
    };
    expect(client.client.axios.defaults.httpsAgent).toBe(agent);
    expect(client.client.axios.defaults.httpAgent).toBe(agent);
  });

  it('constructs without an agent for non-enclave callers', () => {
    expect(() => new HttpSlackClient('xoxb-token')).not.toThrow();
  });
});

function makeMessage(overrides: Partial<SlackMessage> = {}): SlackMessage {
  return {
    type: 'message',
    channel: 'C12345',
    user: 'U99999',
    text: 'Hello world',
    ts: '1700000000.000001',
    ...overrides,
  };
}

describe('slackThreadId', () => {
  it('formats as slack:{channelId}:{ts}', () => {
    expect(slackThreadId('C123', '1700000000.000001')).toBe('slack:C123:1700000000.000001');
  });
});

describe('normalizeSlackMessage — parent message', () => {
  it('produces one container and one fact', () => {
    const result = normalizeSlackMessage(makeMessage());
    expect(result.containers).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
  });

  it('container has label slack_thread and shape flat', () => {
    const result = normalizeSlackMessage(makeMessage());
    expect(result.containers[0]).toMatchObject({
      label: 'slack_thread',
      shape: 'flat',
    });
  });

  it('container sourceContainerId matches thread ID format', () => {
    const msg = makeMessage({ ts: '1700000000.000001' });
    const result = normalizeSlackMessage(msg);
    expect(result.containers[0]!.sourceContainerId).toBe('slack:C12345:1700000000.000001');
  });

  it('fact sourceFactId uses slack:msg:{ts}', () => {
    const msg = makeMessage({ ts: '1700000000.000002' });
    const result = normalizeSlackMessage(msg);
    expect(result.facts[0]!.sourceFactId).toBe('slack:msg:1700000000.000002');
  });

  it('fact occurredAt is derived from ts (Unix seconds × 1000)', () => {
    const msg = makeMessage({ ts: '1700000000.000000' });
    const result = normalizeSlackMessage(msg);
    expect(result.facts[0]!.occurredAt.getTime()).toBe(1700000000 * 1000);
  });

  it('fact sourceThreadId matches container sourceContainerId', () => {
    const result = normalizeSlackMessage(makeMessage());
    expect(result.facts[0]!.sourceThreadId).toBe(result.containers[0]!.sourceContainerId);
  });

  it('fact containerRefs contains the thread ID', () => {
    const result = normalizeSlackMessage(makeMessage());
    expect(result.facts[0]!.containerRefs).toContain(result.containers[0]!.sourceContainerId);
  });
});

describe('normalizeSlackMessage — reply', () => {
  it('produces no container and one fact', () => {
    const msg = makeMessage({ ts: '1700000001.000001', thread_ts: '1700000000.000001' });
    const result = normalizeSlackMessage(msg);
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
  });

  it('reply fact references the parent thread container', () => {
    const msg = makeMessage({ ts: '1700000001.000001', thread_ts: '1700000000.000001' });
    const result = normalizeSlackMessage(msg);
    expect(result.facts[0]!.sourceThreadId).toBe('slack:C12345:1700000000.000001');
    expect(result.facts[0]!.containerRefs).toContain('slack:C12345:1700000000.000001');
  });
});

describe('normalizeSlackMessage — structural entities', () => {
  it('emits the channel id and thread id from typed fields', () => {
    const result = normalizeSlackMessage(makeMessage({ ts: '1700000000.000001' }));
    expect(result.facts[0]!.entities).toEqual(['C12345', 'slack:C12345:1700000000.000001']);
  });

  it('a reply carries the parent thread id, not its own timestamp', () => {
    const msg = makeMessage({ ts: '1700000001.000001', thread_ts: '1700000000.000001' });
    const result = normalizeSlackMessage(msg);
    expect(result.facts[0]!.entities).toEqual(['C12345', 'slack:C12345:1700000000.000001']);
  });
});

describe('normalizeSlackMessage — bot/subtype filtering', () => {
  it('skips messages with subtype other than bot_message', () => {
    const msg = makeMessage({ subtype: 'channel_join' });
    const result = normalizeSlackMessage(msg);
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(0);
  });

  it('includes bot_message subtype', () => {
    const msg = makeMessage({ subtype: 'bot_message' });
    const result = normalizeSlackMessage(msg);
    expect(result.facts).toHaveLength(1);
  });
});

describe('normalizeSlackMessage — edits', () => {
  function editEnvelope(overrides: Partial<SlackMessage> = {}): SlackMessage {
    return {
      type: 'message',
      subtype: 'message_changed',
      channel: 'C12345',
      ts: '1700000100.000000',
      message: {
        type: 'message',
        channel: 'C12345',
        user: 'U99999',
        text: 'edited body',
        ts: '1700000000.000001',
        edited: { user: 'U99999', ts: '1700000100.000000' },
      },
      previous_message: {
        type: 'message',
        channel: 'C12345',
        user: 'U99999',
        text: 'original body',
        ts: '1700000000.000001',
      },
      ...overrides,
    };
  }

  it('produces a new content Fact and never mutates or re-creates the container', () => {
    const result = normalizeSlackMessage(editEnvelope());
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
    expect(result.facts[0]!.content?.body).toBe('edited body');
  });

  it('gives the edit a distinct sourceFactId from the original message', () => {
    const result = normalizeSlackMessage(editEnvelope());
    expect(result.facts[0]!.sourceFactId).toBe(
      'slack:msg:edited:1700000000.000001:1700000100.000000',
    );
    expect(result.facts[0]!.sourceFactId).not.toBe('slack:msg:1700000000.000001');
  });

  it('threads the edit onto the original message container', () => {
    const result = normalizeSlackMessage(editEnvelope());
    expect(result.facts[0]!.sourceThreadId).toBe('slack:C12345:1700000000.000001');
  });

  it('attributes the edit to the edited message author, timestamped at the edit', () => {
    const result = normalizeSlackMessage(editEnvelope());
    expect(result.facts[0]!.authors).toEqual([{ sourceUserId: 'U99999', role: 'author' }]);
    expect(result.facts[0]!.occurredAt.getTime()).toBe(1700000100 * 1000);
  });

  it('drops an edit envelope with no inner message', () => {
    const result = normalizeSlackMessage(editEnvelope({ message: undefined }));
    expect(result.facts).toHaveLength(0);
  });
});

describe('normalizeSlackMessage — deletions', () => {
  function deleteEnvelope(overrides: Partial<SlackMessage> = {}): SlackMessage {
    return {
      type: 'message',
      subtype: 'message_deleted',
      channel: 'C12345',
      ts: '1700000200.000000',
      deleted_ts: '1700000000.000001',
      previous_message: {
        type: 'message',
        channel: 'C12345',
        user: 'U99999',
        text: 'gone now',
        ts: '1700000000.000001',
      },
      ...overrides,
    };
  }

  it('produces a transition Fact of type deleted', () => {
    const result = normalizeSlackMessage(deleteEnvelope());
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('transition');
    expect(result.facts[0]!.transition?.transitionType).toBe('deleted');
  });

  it('carries no message body in the content-free transition detail', () => {
    const result = normalizeSlackMessage(deleteEnvelope());
    expect(result.facts[0]!.content).toBeUndefined();
    expect(result.facts[0]!.transition?.detail).toEqual({ field: 'message' });
  });

  it('references the deleted message thread and its author', () => {
    const result = normalizeSlackMessage(deleteEnvelope());
    expect(result.facts[0]!.sourceThreadId).toBe('slack:C12345:1700000000.000001');
    expect(result.facts[0]!.authors).toEqual([{ sourceUserId: 'U99999', role: 'author' }]);
  });

  it('drops a deletion with no deleted_ts or previous message', () => {
    const result = normalizeSlackMessage(
      deleteEnvelope({ deleted_ts: undefined, previous_message: undefined }),
    );
    expect(result.facts).toHaveLength(0);
  });
});

describe('normalizeSlackReaction', () => {
  function reaction(overrides: Partial<SlackReactionEvent> = {}): SlackReactionEvent {
    return {
      type: 'reaction_added',
      user: 'U55555',
      reaction: 'thumbsup',
      item: { type: 'message', channel: 'C12345', ts: '1700000000.000001' },
      event_ts: '1700000300.000000',
      ...overrides,
    };
  }

  it('produces a transition Fact attributed to the reacting user', () => {
    const result = normalizeSlackReaction(reaction());
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('transition');
    expect(result.facts[0]!.transition?.transitionType).toBe('reaction_added');
    expect(result.facts[0]!.authors).toEqual([{ sourceUserId: 'U55555', role: 'author' }]);
  });

  it('keeps the emoji name out of the shared-Postgres metadata detail', () => {
    const result = normalizeSlackReaction(reaction({ reaction: 'shipit' }));
    expect(JSON.stringify(result.facts[0]!.transition?.detail)).not.toContain('shipit');
    expect(result.facts[0]!.transition?.detail).toEqual({ field: 'reaction' });
  });

  it('links the reaction to the reacted message and creates no container', () => {
    const result = normalizeSlackReaction(reaction());
    expect(result.containers).toHaveLength(0);
    expect(result.facts[0]!.sourceThreadId).toBe('slack:C12345:1700000000.000001');
  });

  it('distinguishes add from remove and dedups per user+emoji+moment', () => {
    const added = normalizeSlackReaction(reaction());
    const removed = normalizeSlackReaction(reaction({ type: 'reaction_removed' }));
    expect(added.facts[0]!.sourceFactId).not.toBe(removed.facts[0]!.sourceFactId);
    expect(removed.facts[0]!.transition?.transitionType).toBe('reaction_removed');
  });

  it('drops a reaction missing its item target', () => {
    const result = normalizeSlackReaction(
      reaction({ item: { type: 'message', channel: '', ts: '' } }),
    );
    expect(result.facts).toHaveLength(0);
  });
});

describe('SlackConnector.normalizeWebhook routing', () => {
  const noop = () => {};
  const logger: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => logger,
  };
  const connector = new SlackConnector({ logger }, null as unknown as SlackClient);

  it('routes an event-wrapped message to the message normalizer', () => {
    const result = connector.normalizeWebhook({
      type: 'event_callback',
      payload: { event: makeMessage() },
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('routes a reaction_added event to the reaction normalizer', () => {
    const result = connector.normalizeWebhook({
      type: 'event_callback',
      payload: {
        event: {
          type: 'reaction_added',
          user: 'U55555',
          reaction: 'eyes',
          item: { type: 'message', channel: 'C12345', ts: '1700000000.000001' },
          event_ts: '1700000300.000000',
        },
      },
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.transition?.transitionType).toBe('reaction_added');
  });

  it('routes a message_changed event to an edit Fact', () => {
    const result = connector.normalizeWebhook({
      type: 'event_callback',
      payload: {
        event: {
          type: 'message',
          subtype: 'message_changed',
          channel: 'C12345',
          ts: '1700000100.000000',
          message: {
            type: 'message',
            channel: 'C12345',
            user: 'U99999',
            text: 'edited',
            ts: '1700000000.000001',
            edited: { user: 'U99999', ts: '1700000100.000000' },
          },
        },
      },
    });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.sourceFactId).toContain('slack:msg:edited:');
  });
});
