// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '../connector.js';
import type { NormalizedFact, NormalizedRecords, NormalizedResource } from '../normalized.js';
import { isCreateEvent } from '../pull-classification.js';
import type { NotionApiClient } from './client.js';
import { normalizeNotionCommentEvent, normalizeNotionPageEvent } from './normalize.js';
import type { NotionCommentEvent, NotionPageEvent } from './types.js';

export class NotionConnector extends BaseConnector {
  readonly kind = 'notion';

  constructor(
    context: ConnectorContext,
    private readonly client: NotionApiClient,
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    return [];
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const since = cursor.value ?? options?.since?.toISOString();
    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];

    const pages = await this.call('listPages', () => this.client.listPages(since));
    let maxEditedAt = cursor.value;

    for (const page of pages) {
      const type: NotionPageEvent['type'] = isCreateEvent(page.created_time, since)
        ? 'page.created'
        : 'page.updated';
      const normalized = normalizeNotionPageEvent({ type, page, workspace_id: '' });
      facts.push(...normalized.facts);
      containers.push(...normalized.containers);
      if (maxEditedAt === null || page.last_edited_time > maxEditedAt) {
        maxEditedAt = page.last_edited_time;
      }
    }

    this.logger.debug('notion pull complete', { facts: facts.length, pages: pages.length });
    return { facts, containers, cursor: { value: maxEditedAt }, hasMore: false };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const type = event.type as string;
    if (type === 'page.created' || type === 'page.updated') {
      return normalizeNotionPageEvent(event.payload as NotionPageEvent);
    }
    if (type === 'comment.created') {
      return normalizeNotionCommentEvent(event.payload as NotionCommentEvent);
    }
    return { containers: [], facts: [] };
  }
}
