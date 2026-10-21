// SPDX-License-Identifier: Apache-2.0
import type { NotionPage } from './types.js';

export type NotionListDirection = 'ascending' | 'descending';

export interface NotionListPagesInput {
  direction: NotionListDirection;
  startCursor: string | null;
  maxCalls: number;
  /** Descending only: stop at the first page edited before this ISO time. */
  stopBefore?: string;
}

export interface NotionPageListing {
  pages: NotionPage[];
  /** Where the next call resumes, or null when the listing reached its end or its floor. */
  nextCursor: string | null;
  calls: number;
  /** Notion refused the start cursor, so the caller restarts the listing. */
  cursorRejected?: true;
}

export interface NotionApiClient {
  listPages(input: NotionListPagesInput): Promise<NotionPageListing>;
}
