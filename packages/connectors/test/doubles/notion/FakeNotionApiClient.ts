// SPDX-License-Identifier: Apache-2.0
import type {
  NotionApiClient,
  NotionListPagesInput,
  NotionPage,
  NotionPageListing,
} from '../../../src/notion/index.js';

const CURSOR_PREFIX = 'c:';
const DEFAULT_PAGE_SIZE = 100;

export interface FakeNotionApiClientOptions {
  pageSize?: number;
  /** Start cursors Notion refuses; each is refused once, then accepted. */
  rejectOnce?: readonly string[];
  /** Every non-null start cursor is refused. */
  rejectAllCursors?: boolean;
  /** Every descending listing reports a rejected cursor. */
  rejectDescending?: boolean;
}

/** Search stand-in: a fixed page set, 100 per call, cursors that encode an offset. */
export class FakeNotionApiClient implements NotionApiClient {
  readonly inputs: NotionListPagesInput[] = [];
  searchCalls = 0;
  private readonly pageSize: number;
  private readonly pendingRejections: Set<string>;

  constructor(
    private readonly pages: readonly NotionPage[],
    private readonly options: FakeNotionApiClientOptions = {},
  ) {
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.pendingRejections = new Set(options.rejectOnce ?? []);
  }

  async listPages(input: NotionListPagesInput): Promise<NotionPageListing> {
    this.inputs.push(input);
    if (this.isRejected(input)) {
      this.searchCalls += 1;
      return { pages: [], nextCursor: null, calls: 1, cursorRejected: true };
    }
    const sorted = this.sorted(input.direction);
    const collected: NotionPage[] = [];
    let offset =
      input.startCursor === null ? 0 : Number(input.startCursor.slice(CURSOR_PREFIX.length));
    let calls = 0;
    while (calls < input.maxCalls) {
      calls += 1;
      this.searchCalls += 1;
      for (const page of sorted.slice(offset, offset + this.pageSize)) {
        if (this.isBelowFloor(page, input)) return { pages: collected, nextCursor: null, calls };
        collected.push(page);
      }
      offset += this.pageSize;
      if (offset >= sorted.length) return { pages: collected, nextCursor: null, calls };
    }
    return { pages: collected, nextCursor: `${CURSOR_PREFIX}${offset}`, calls };
  }

  private isRejected(input: NotionListPagesInput): boolean {
    if (this.options.rejectDescending && input.direction === 'descending') return true;
    const startCursor = input.startCursor;
    if (startCursor === null) return false;
    if (this.options.rejectAllCursors) return true;
    return this.pendingRejections.delete(startCursor);
  }

  private isBelowFloor(page: NotionPage, input: NotionListPagesInput): boolean {
    if (input.direction !== 'descending' || input.stopBefore === undefined) return false;
    return Date.parse(page.last_edited_time) < Date.parse(input.stopBefore);
  }

  private sorted(direction: NotionListPagesInput['direction']): NotionPage[] {
    // Equal timestamps keep input order: Notion promises no order inside one.
    const ascending = [...this.pages].sort(
      (a, b) => Date.parse(a.last_edited_time) - Date.parse(b.last_edited_time),
    );
    return direction === 'ascending' ? ascending : ascending.reverse();
  }
}
