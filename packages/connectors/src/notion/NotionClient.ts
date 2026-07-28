// SPDX-License-Identifier: Apache-2.0
import { Client } from '@notionhq/client';
import { BaseApiClient } from '../BaseApiClient.js';
import type { NotionApiClient } from './client.js';
import type { NotionPage } from './types.js';

export class NotionClient extends BaseApiClient implements NotionApiClient {
  private readonly sdk: Client;

  constructor(token: string) {
    super(token);
    this.sdk = new Client({ auth: this.token });
  }

  async listPages(updatedSince?: string): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.sdk.search({
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });

      for (const result of response.results) {
        if (result.object !== 'page') continue;
        const page = result as unknown as NotionPage;
        if (updatedSince && page.last_edited_time <= updatedSince) {
          // Results are sorted descending — once we cross the boundary, we're done.
          return pages;
        }
        if (!page.archived) pages.push(page);
      }

      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return pages;
  }
}
