// SPDX-License-Identifier: Apache-2.0
import { notionPageKey } from '@folklore/utils';
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

export interface NotionConnectorOptions {
  /** Pages the product created in this workspace; they are never read back as source material. */
  exportedPageIds?: ReadonlySet<string>;
}

export class NotionConnector extends BaseConnector {
  readonly kind = 'notion';
  private readonly exportedPageKeys: ReadonlySet<string>;

  constructor(
    context: ConnectorContext,
    private readonly client: NotionApiClient,
    options: NotionConnectorOptions = {},
  ) {
    super(context);
    this.exportedPageKeys = this.pageKeys(options.exportedPageIds ?? new Set());
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
    let exported = 0;

    for (const page of pages) {
      if (maxEditedAt === null || page.last_edited_time > maxEditedAt) {
        maxEditedAt = page.last_edited_time;
      }
      if (this.isExported(page.id)) {
        exported += 1;
        continue;
      }
      const type: NotionPageEvent['type'] = isCreateEvent(page.created_time, since)
        ? 'page.created'
        : 'page.updated';
      const normalized = normalizeNotionPageEvent({ type, page, workspace_id: '' });
      facts.push(...normalized.facts);
      containers.push(...normalized.containers);
    }

    this.logger.debug('notion_pull_complete');
    return {
      facts,
      containers,
      cursor: { value: maxEditedAt },
      hasMore: false,
      ...(exported > 0 ? { skipped: { exported } } : {}),
    };
  }

  private isExported(pageId: string): boolean {
    const key = notionPageKey(pageId);
    return key !== null && this.exportedPageKeys.has(key);
  }

  // An id that is not a Notion page id is left out, so it can never match a page.
  private pageKeys(ids: ReadonlySet<string>): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const id of ids) {
      const key = notionPageKey(id);
      if (key !== null) keys.add(key);
    }
    return keys;
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const parsed = notionWebhookEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn('notion_webhook_unrecognized_payload_shape');
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
        this.logger.warn('notion_webhook_page_created_without_a_resolvable_page_id');
        return { containers: [], facts: [] };
      }
      return normalizeNotionPageSeed(pageId);
    }
    this.logger.warn('notion_webhook_event_skipped');
    return { containers: [], facts: [] };
  }
}
