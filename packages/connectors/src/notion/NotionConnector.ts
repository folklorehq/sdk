// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { notionWebhookEventSchema } from '@folklore/contracts';
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
import { normalizeNotionPageEvent, normalizeNotionPageSeed } from './normalize.js';
import type { NotionPageEvent } from './types.js';

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
    const parsed = notionWebhookEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn('notion webhook: unrecognized payload shape');
      return { containers: [], facts: [] };
    }
    const { type, entity, data } = parsed.data;
    if (type === 'page.created') {
      const pageId =
        typeof entity?.id === 'string'
          ? entity.id
          : typeof data.page_id === 'string'
            ? data.page_id
            : typeof data.id === 'string'
              ? data.id
              : undefined;
      if (pageId === undefined) {
        this.logger.warn('notion webhook: page.created without a resolvable page id', { type });
        return { containers: [], facts: [] };
      }
      return normalizeNotionPageSeed(pageId);
    }
    this.logger.warn('notion webhook: event skipped', { type });
    return { containers: [], facts: [] };
  }
}
