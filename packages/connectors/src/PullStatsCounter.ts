// SPDX-License-Identifier: Apache-2.0
import {
  PULL_CHARS_BUCKET,
  type PullSkipReason as ContractPullSkipReason,
  type PullStatsSignal,
} from '@folklore/contracts';

export type PullSkipReason = ContractPullSkipReason;

// UNWIRED: the skip reasons body_fetch_failed, comment_cap and deletion_unresolved have no producer yet.
export type PullStats = Pick<
  PullStatsSignal,
  'listed' | 'emitted' | 'apiCalls' | 'listingRestarts' | 'bodyCharsBucket' | 'truncatedBodies'
> & {
  skipped: Partial<Record<PullSkipReason, number>>;
  /** Set by a connector that knows a chunk belongs to a backfill whose continuation messages do not say so. */
  backfillChunk?: true;
};

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

  // UNWIRED: no connector reports body sizes or truncations (truncatedBodies) yet.
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
            bodyCharsBucket: Math.ceil(this.bodyChars / PULL_CHARS_BUCKET) * PULL_CHARS_BUCKET,
            truncatedBodies: this.truncatedBodies,
          }),
    };
  }
}
