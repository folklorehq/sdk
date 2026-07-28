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
import type { IntercomApiClient } from './client.js';
import { normalizeIntercomEvent } from './normalize.js';
import type { IntercomNotificationEvent } from './types.js';

export class IntercomConnector extends BaseConnector {
  readonly kind = 'intercom';

  constructor(
    context: ConnectorContext,
    private readonly client: IntercomApiClient,
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    return [];
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const sinceEpoch = cursor.value
      ? Number(cursor.value)
      : options?.since
        ? Math.floor(options.since.getTime() / 1000)
        : undefined;

    const conversations = await this.call('listConversations', () =>
      this.client.listConversations(sinceEpoch),
    );

    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];
    let maxUpdatedAt = cursor.value;

    for (const conv of conversations) {
      const event: IntercomNotificationEvent = {
        type: 'notification_event',
        topic: 'conversation.user.created',
        data: { item: conv },
        created_at: conv.created_at,
      };
      const normalized = normalizeIntercomEvent(event);
      facts.push(...normalized.facts);
      containers.push(...normalized.containers);

      const updatedAtStr = String(conv.updated_at);
      if (maxUpdatedAt === null || updatedAtStr > maxUpdatedAt) {
        maxUpdatedAt = updatedAtStr;
      }
    }

    this.logger.debug('intercom pull complete', {
      facts: facts.length,
      conversations: conversations.length,
    });
    return { facts, containers, cursor: { value: maxUpdatedAt }, hasMore: false };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const payload = event.payload as IntercomNotificationEvent;
    if (!payload.type || !payload.topic || !payload.data?.item) {
      return { containers: [], facts: [] };
    }
    return normalizeIntercomEvent(payload);
  }
}
