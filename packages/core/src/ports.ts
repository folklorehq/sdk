// SPDX-License-Identifier: Apache-2.0
/** Temporary compatibility context for public-mirror runtimes pending P2.7. */
export interface LogContext {
  [key: string]: unknown;
}

/** A primitive value that is safe to pass through the structured logging boundary. */
export type SafeLogValue = string | number | boolean | null;

/** Operational field names permitted at the structured logging boundary. */
export const SAFE_LOG_FIELDS = Object.freeze([
  'accountId',
  'aggregateRewrites',
  'agentReadThemes7d',
  'apiCalls',
  'approval_key_count',
  'attempt',
  'backfill',
  'bindMaxMs',
  'bindMs',
  'bothFlagged',
  'brakeLevel',
  'bytes',
  'cacheReadTokens',
  'cacheWriteTokens',
  'cachedCalls',
  'calls',
  'candidates',
  'chatsDeleted',
  'checkFlagged',
  'checkItems',
  'checkOnly',
  'citationSupportBp',
  'component',
  'completionTokens',
  'conflicts',
  'costMicros',
  'count',
  'coverageMissing',
  'dailyPass',
  'daysAgo',
  'deferrals',
  'deletion_armed',
  'deploymentId',
  'derivedAccountId',
  'docCharsBucket',
  'dropped',
  'duration',
  'durationMs',
  'embedCharsBucket',
  'emitted',
  'entries',
  'errorCode',
  'error_type',
  'escalated',
  'exitCode',
  'facts',
  'faithfulnessOpusFlagged',
  'faithfulnessOpusOnly',
  'fanout1',
  'fanout2',
  'fanout3plus',
  'flagKey',
  'generation',
  'halt_break_glass_armed',
  'halt_quorum_armed',
  'hasMore',
  'httpStatus',
  'humanReadThemes30d',
  'humanReadThemes72h',
  'humanReadThemes7d',
  'importantCoverageBp',
  'isOperational',
  'itemsDropped',
  'lastFailure',
  'listed',
  'listingRestarts',
  'loopDelayMaxMs',
  'loopDelayP50Ms',
  'loopDelayP99Ms',
  'loopSamples',
  'membersPurged',
  'messageId',
  'misattributionCandidates',
  'missing',
  'model',
  'nonTransitionFacts',
  'operation',
  'operationId',
  'opusFlagged',
  'opusOnly',
  'orgId',
  'outcome',
  'outlineBytes',
  'outlineReused',
  'overclaims',
  'pace',
  'percent',
  'phase',
  'port',
  'promptTokens',
  'purpose',
  'quoteMismatches',
  'reads1d',
  'reason',
  'redrafted',
  'rejected_key_count',
  'requestId',
  'required',
  'requestMaxMs',
  'requestMs',
  'responseMaxMs',
  'responseMs',
  'restarts',
  'retried',
  'revision',
  'reviewFlagRateBp',
  'reviewTriggers',
  'revisionRateBp',
  'reused',
  'rewrites',
  'rewritesPerThemeMax',
  'rewritesPerThemeP50',
  'rewritesPerThemeP95',
  'role',
  'rotation_armed',
  'route',
  'seconds',
  'seq',
  'signals',
  'skippedArchived',
  'skippedBodyFetchFailed',
  'skippedBudgetDeferred',
  'skippedCommentCap',
  'skippedDeletionUnresolved',
  'skippedExported',
  'skippedListingIncomplete',
  'skippedOutOfWindow',
  'sourceSha',
  'spansDropped',
  'startOffsetMs',
  'status',
  'statusCode',
  'themeKind',
  'themesWithPages',
  'trigger',
  'truncated',
  'trustedTimeMaxMs',
  'trustedTimeMs',
  'unanswered',
  'uncitedCutBp',
  'unsupportedItems',
  'untaggedCalls',
  'usageEntries',
  'verifyMaxMs',
  'verifyMs',
  'wouldSkip',
] as const);

export type SafeLogField = (typeof SAFE_LOG_FIELDS)[number];

/** Flat context accepted by the structured logging boundary. */
export type SafeLogContext = Readonly<Partial<Record<SafeLogField, SafeLogValue>>>;

/** A stable, bounded code identifying a log event. */
export type SafeLogEvent = string;

/** Logging port — app code depends on this interface, never a concrete logger. */
export interface Logger {
  trace(event: SafeLogEvent, context?: SafeLogContext | LogContext): void;
  debug(event: SafeLogEvent, context?: SafeLogContext | LogContext): void;
  info(event: SafeLogEvent, context?: SafeLogContext | LogContext): void;
  warn(event: SafeLogEvent, context?: SafeLogContext | LogContext): void;
  error(event: SafeLogEvent, context?: SafeLogContext | LogContext): void;
  fatal(event: SafeLogEvent, context?: SafeLogContext | LogContext): void;
  /** Return a child logger that includes `bindings` on every line. */
  child(bindings: SafeLogContext | LogContext): Logger;
}

/** Anything holding resources that must be released on shutdown. */
export interface Closable {
  close(): Promise<void>;
}

/** Cache port — a small JSON-oriented key/value contract. */
export interface Cache extends Closable {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<number>;
}

export interface MonotonicCache extends Cache {
  setMaxAndSet(floorKey: string, floor: number, valueKey: string, value: unknown): Promise<boolean>;
}
