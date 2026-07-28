// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../base-connector.js';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '../connector.js';
import type { NormalizedFact, NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { SlackClient } from './client.js';
import { normalizeSlackMessage, normalizeSlackReaction } from './normalize.js';
import type { SlackMessage, SlackReactionEvent } from './types.js';

export class SlackConnector extends BaseConnector {
  readonly kind = 'slack';

  constructor(
    context: ConnectorContext,
    private readonly client: SlackClient,
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    const channels = await this.call('listConversations', () => this.client.listConversations());
    return channels.map((ch) => ({
      externalId: ch.id,
      resourceType: 'channel',
      // Fail closed on the source-access boundary (ADL #6): a channel is public only when Slack
      // explicitly says so; a missing is_private is treated as private.
      isPublic: ch.is_private === false,
    }));
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const oldest = cursor.value ?? options?.since?.getTime().toString();
    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];
    let maxTs = cursor.value;

    const channels = await this.call('listConversations', () => this.client.listConversations());

    for (const channel of channels) {
      let pageCursor: string | undefined;
      do {
        const result = await this.call('listMessages', () =>
          this.client.listMessages(channel.id, oldest, pageCursor),
        );
        for (const msg of result.messages) {
          const normalized = normalizeSlackMessage(msg as SlackMessage);
          facts.push(...normalized.facts);
          containers.push(...normalized.containers);
          if (maxTs === null || msg.ts > maxTs) maxTs = msg.ts;
        }
        pageCursor = result.nextCursor ?? undefined;
      } while (pageCursor);
    }

    this.logger.debug('slack pull complete', { facts: facts.length, channels: channels.length });
    return { facts, containers, cursor: { value: maxTs }, hasMore: false };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const payload = event.payload as { event?: { type?: string } };
    const inner = payload.event ?? (payload as { type?: string });
    if (inner.type === 'reaction_added' || inner.type === 'reaction_removed') {
      return normalizeSlackReaction(inner as SlackReactionEvent);
    }
    return normalizeSlackMessage(inner as SlackMessage);
  }
}
