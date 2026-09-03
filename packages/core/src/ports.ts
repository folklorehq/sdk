// SPDX-License-Identifier: Apache-2.0
/** Temporary compatibility context for public-mirror runtimes pending P2.7. */
export interface LogContext {
  [key: string]: unknown;
}

/** A primitive value that is safe to pass through the structured logging boundary. */
export type SafeLogValue = string | number | boolean | null;

/** Operational field names permitted at the structured logging boundary. */
export const SAFE_LOG_FIELDS = Object.freeze([
  'attempt',
  'bytes',
  'cachedCalls',
  'calls',
  'component',
  'completionTokens',
  'count',
  'duration',
  'errorCode',
  'error_type',
  'generation',
  'httpStatus',
  'isOperational',
  'messageId',
  'model',
  'operation',
  'orgId',
  'outcome',
  'phase',
  'port',
  'promptTokens',
  'requestId',
  'retried',
  'route',
  'status',
  'statusCode',
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
