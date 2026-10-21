// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@folklore/core';
import type { NormalizedRecords, NormalizedResource } from './normalized.js';
import type { PullStats } from './pull-stats.js';

/** Opaque, per-connector incremental sync position. */
export interface SyncCursor {
  value: string | null;
}

/** Options controlling a `pull()`: separates the pagination position (cursor) from the history horizon (`since`). */
export interface PullOptions {
  /** Oldest record timestamp to include; connectors MUST stop paginating once they cross this boundary (set by onboarding backfill). Undefined means incremental with no lower bound. */
  since?: Date;
  /** Fact budget for one pull; a connector that honors it returns the oldest updates first, its cursor at the last one taken, and `hasMore` while any remain. */
  maxFacts?: number;
  /** True when this pull starts a forced or onboarding backfill rather than resuming one. */
  backfill?: boolean;
}

/** An inbound webhook delivery, before source-specific decoding. */
export interface WebhookEvent {
  type: string; // e.g. 'pull_request' | 'issue_comment' | 'push'
  payload: unknown;
}

export interface PullResult extends NormalizedRecords {
  /** Cursor to pass to the next `pull()`. */
  cursor: SyncCursor;
  hasMore: boolean;
  /** Connector-internal early-return marker (rate-limited/enumeration-failed): the runner keeps the cursor and advances its tick exactly once. */
  earlyReturn?: true;
  /** Content-free counts for this pull. */
  stats?: PullStats;
}

/** Dependencies injected into every connector at construction. */
export interface ConnectorContext {
  logger: Logger;
}

/** The contract every source adapter implements: authenticate, discover resources, pull history, and decode webhooks into normalized records. Never persists anything. */
export interface Connector {
  /** Source kind, e.g. 'github'. Matches `sources.kind` in the DB. */
  readonly kind: string;
  /** Resources for permission sync (channels, repos, projects, ...). */
  listResources(): Promise<NormalizedResource[]>;
  /** Pull a batch of history from `cursor` forward, bounded by `options.since`. */
  pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
  /** Decode an inbound webhook into normalized records (synchronous, pure). */
  normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
