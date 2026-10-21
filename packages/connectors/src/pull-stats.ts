// SPDX-License-Identifier: Apache-2.0
// UNWIRED: body_fetch_failed, comment_cap and deletion_unresolved have no producer yet.
export type PullSkipReason =
  | 'archived'
  | 'out_of_window'
  | 'budget_deferred'
  | 'body_fetch_failed'
  | 'exported'
  | 'listing_incomplete'
  | 'comment_cap'
  | 'deletion_unresolved';

export interface PullStats {
  /** Set by a connector that knows a chunk belongs to a backfill whose continuation messages do not say so. */
  backfillChunk?: true;
  listed: number;
  emitted: number;
  apiCalls: number;
  listingRestarts: number;
  skipped: Partial<Record<PullSkipReason, number>>;
  bodyCharsBucket?: number;
  // UNWIRED: only bodyMeasured sets it.
  truncatedBodies?: number;
}

export const BODY_CHARS_BUCKET = 10_000;

/** Counts only: nothing here may carry an id, title, path or body. */
export class PullStatsCounter {
  private listed = 0;
  private emitted = 0;
  private apiCalls = 0;
  private listingRestarts = 0;
  private readonly skipped = new Map<PullSkipReason, number>();
  private bodyChars: number | null = null;
  private truncatedBodies = 0;
  private backfillChunk = false;

  listedItem(count = 1): void {
    this.listed += count;
  }

  emittedItem(count = 1): void {
    this.emitted += count;
  }

  apiCall(count = 1): void {
    this.apiCalls += count;
  }

  markBackfill(): void {
    this.backfillChunk = true;
  }

  listingRestarted(): void {
    this.listingRestarts += 1;
  }

  skip(reason: PullSkipReason): void {
    this.skipped.set(reason, (this.skipped.get(reason) ?? 0) + 1);
  }

  // UNWIRED: no connector reports body sizes yet.
  bodyMeasured(chars: number, truncated: boolean): void {
    this.bodyChars = (this.bodyChars ?? 0) + chars;
    if (truncated) this.truncatedBodies += 1;
  }

  snapshot(): PullStats {
    return {
      listed: this.listed,
      emitted: this.emitted,
      apiCalls: this.apiCalls,
      listingRestarts: this.listingRestarts,
      skipped: Object.fromEntries(this.skipped),
      ...(this.backfillChunk ? { backfillChunk: true as const } : {}),
      ...(this.bodyChars === null
        ? {}
        : {
            bodyCharsBucket: Math.ceil(this.bodyChars / BODY_CHARS_BUCKET) * BODY_CHARS_BUCKET,
            truncatedBodies: this.truncatedBodies,
          }),
    };
  }
}
