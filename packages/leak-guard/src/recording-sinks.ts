// SPDX-License-Identifier: Apache-2.0
import type { Cache, Closable, Logger, SafeLogContext } from '@folklore/core';
import type { ErrorReport } from '@folklore/errors';
import type { TelemetryClient } from '@folklore/telemetry';

export interface RecordedLog {
  level: string;
  message: string;
  context?: SafeLogContext;
  bindings: SafeLogContext;
}

export class RecordingLogger implements Logger {
  constructor(
    readonly records: RecordedLog[] = [],
    private readonly bindings: SafeLogContext = {},
  ) {}

  trace(message: string, context?: SafeLogContext): void {
    this.record('trace', message, context);
  }
  debug(message: string, context?: SafeLogContext): void {
    this.record('debug', message, context);
  }
  info(message: string, context?: SafeLogContext): void {
    this.record('info', message, context);
  }
  warn(message: string, context?: SafeLogContext): void {
    this.record('warn', message, context);
  }
  error(message: string, context?: SafeLogContext): void {
    this.record('error', message, context);
  }
  fatal(message: string, context?: SafeLogContext): void {
    this.record('fatal', message, context);
  }

  child(bindings: SafeLogContext): Logger {
    return new RecordingLogger(this.records, { ...this.bindings, ...bindings });
  }

  private record(level: string, message: string, context?: SafeLogContext): void {
    this.records.push({ level, message, context, bindings: this.bindings });
  }
}

export interface RecordedCacheWrite {
  key: string;
  value: unknown;
  ttlSeconds?: number;
}

export class RecordingCache implements Cache {
  readonly writes: RecordedCacheWrite[] = [];
  private readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T) ?? null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    this.writes.push({ key, value, ttlSeconds });
    this.store.set(key, value);
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed += 1;
    return removed;
  }

  async close(): Promise<void> {}
}

export type RecordedTelemetry =
  | { kind: 'track'; event: string; distinctId: string; properties: unknown }
  | { kind: 'captureError'; report: ErrorReport; distinctId?: string };

export class RecordingTelemetryClient implements TelemetryClient {
  readonly calls: RecordedTelemetry[] = [];

  track(event: string, distinctId: string, properties: unknown): void {
    this.calls.push({ kind: 'track', event, distinctId, properties });
  }

  captureError(report: ErrorReport, distinctId?: string): void {
    this.calls.push({ kind: 'captureError', report, distinctId });
  }

  async flush(): Promise<void> {}
}

export interface RecordedS3Put {
  bucket: string;
  key: string;
  body: unknown;
  contentType?: string;
  metadata?: Record<string, string>;
}

interface S3CommandInput {
  Bucket?: string;
  Key?: string;
  Body?: unknown;
  ContentType?: string;
  Metadata?: Record<string, string>;
}

/** Duck-typed stand-in for the AWS S3 client that captures every PutObject body. */
export class RecordingS3Client implements Closable {
  readonly puts: RecordedS3Put[] = [];

  async send(command: { input?: S3CommandInput }): Promise<Record<string, never>> {
    const input = command.input;
    if (input?.Bucket !== undefined && input.Key !== undefined && 'Body' in input) {
      this.puts.push({
        bucket: input.Bucket,
        key: input.Key,
        body: input.Body,
        contentType: input.ContentType,
        metadata: input.Metadata,
      });
    }
    return {};
  }

  async close(): Promise<void> {}
}
