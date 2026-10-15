// SPDX-License-Identifier: Apache-2.0
import type { SlackMessage, SlackReactionEvent } from '../../src/slack/index.js';

export function makeMessage(overrides: Partial<SlackMessage> = {}): SlackMessage {
  return {
    type: 'message',
    channel: 'C12345',
    user: 'U99999',
    text: 'Hello world',
    ts: '1700000000.000001',
    ...overrides,
  };
}

export function makeReaction(overrides: Partial<SlackReactionEvent> = {}): SlackReactionEvent {
  return {
    type: 'reaction_added',
    user: 'U55555',
    reaction: 'thumbsup',
    item: { type: 'message', channel: 'C12345', ts: '1700000000.000001' },
    event_ts: '1700000300.000000',
    ...overrides,
  };
}
