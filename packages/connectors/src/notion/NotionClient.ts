// SPDX-License-Identifier: Apache-2.0
import { APIErrorCode, Client, isNotionClientError } from '@notionhq/client';
import { BaseApiClient } from '../BaseApiClient.js';
import type { NotionApiClient, NotionListPagesInput, NotionPageListing } from './client.js';
import type { NotionPage } from './types.js';

const SEARCH_PAGE_SIZE = 100;
export const NOTION_MAX_RETRIES = 5;

type SearchResponse = Awaited<ReturnType<Client['search']>>;

export class NotionClient extends BaseApiClient implements NotionApiClient {
  private readonly sdk: Client;

  constructor(token: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch) {
    super(token);
    // No-op logger: the SDK logs error.message at WARN and response bodies at DEBUG.
    this.sdk = new Client({
      auth: this.token,
      fetch: fetchImpl,
      logger: () => {},
      retry: { maxRetries: NOTION_MAX_RETRIES },
    });
  }

  async listPages(input: NotionListPagesInput): Promise<NotionPageListing> {
    const floorMs = input.stopBefore === undefined ? null : Date.parse(input.stopBefore);
    const pages: NotionPage[] = [];
    let cursor = input.startCursor;
    let calls = 0;
    while (calls < input.maxCalls) {
      calls += 1;
      const response = await this.searchOnce(input.direction, cursor);
      if (response === null) return { pages: [], nextCursor: null, calls, cursorRejected: true };
      for (const result of response.results) {
        if (result.object !== 'page') continue;
        const page = result as unknown as NotionPage;
        if (floorMs !== null && Date.parse(page.last_edited_time) < floorMs) {
          return { pages, nextCursor: null, calls };
        }
        pages.push(page);
      }
      if (!response.has_more || !response.next_cursor) return { pages, nextCursor: null, calls };
      cursor = response.next_cursor;
    }
    return { pages, nextCursor: cursor, calls };
  }

  private async searchOnce(
    direction: NotionListPagesInput['direction'],
    cursor: string | null,
  ): Promise<SearchResponse | null> {
    try {
      return await this.sdk.search({
        filter: { property: 'object', value: 'page' },
        sort: { direction, timestamp: 'last_edited_time' },
        page_size: SEARCH_PAGE_SIZE,
        ...(cursor === null ? {} : { start_cursor: cursor }),
      });
    } catch (error) {
      if (cursor !== null && this.isCursorRejection(error)) return null;
      throw error;
    }
  }

  private isCursorRejection(error: unknown): boolean {
    return isNotionClientError(error) && error.code === APIErrorCode.ValidationError;
  }
}
