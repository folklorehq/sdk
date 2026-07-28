// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '@folklore/connectors';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '@folklore/connectors';
import type { NormalizedFact, NormalizedRecords, NormalizedResource } from '@folklore/connectors';

interface StandupPayload {
  id: string;
  author: string;
  text: string;
  postedAt: string;
}

export class StandupConnector extends BaseConnector {
  readonly kind = 'standup_bot';

  constructor(context: ConnectorContext) {
    super(context);
  }

  listResources(): Promise<NormalizedResource[]> {
    return Promise.resolve([
      { externalId: 'standup-channel', resourceType: 'channel', isPublic: false },
    ]);
  }

  pull(_cursor: SyncCursor, _options?: PullOptions): Promise<PullResult> {
    return Promise.resolve({
      facts: [],
      containers: [],
      cursor: { value: null },
      hasMore: false,
    });
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const payload = event.payload as StandupPayload;
    const fact: NormalizedFact = {
      sourceFactId: `standup:${payload.id}`,
      kind: 'content',
      occurredAt: new Date(payload.postedAt),
      resourceExternalId: 'standup-channel',
      authors: [{ sourceUserId: payload.author, role: 'author' }],
      containerRefs: [`standup-thread:${payload.id}`],
      content: { body: payload.text, explicitLinks: [] },
      raw: payload,
    };
    return {
      facts: [fact],
      containers: [
        {
          sourceContainerId: `standup-thread:${payload.id}`,
          shape: 'flat',
          label: 'standup_thread',
          resourceExternalId: 'standup-channel',
        },
      ],
    };
  }
}
