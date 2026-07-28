import type { Cache, Closable, LogContext, Logger } from '@folklore/core';
import type { ErrorReport } from '@folklore/errors';
import type { TelemetryClient } from '@folklore/telemetry';
export interface RecordedLog {
    level: string;
    message: string;
    context?: LogContext;
    bindings: LogContext;
}
export declare class RecordingLogger implements Logger {
    readonly records: RecordedLog[];
    private readonly bindings;
    constructor(records?: RecordedLog[], bindings?: LogContext);
    trace(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    fatal(message: string, context?: LogContext): void;
    child(bindings: LogContext): Logger;
    private record;
}
export interface RecordedCacheWrite {
    key: string;
    value: unknown;
    ttlSeconds?: number;
}
export declare class RecordingCache implements Cache {
    readonly writes: RecordedCacheWrite[];
    private readonly store;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<number>;
    close(): Promise<void>;
}
export type RecordedTelemetry = {
    kind: 'track';
    event: string;
    distinctId: string;
    properties: unknown;
} | {
    kind: 'captureError';
    report: ErrorReport;
    distinctId?: string;
};
export declare class RecordingTelemetryClient implements TelemetryClient {
    readonly calls: RecordedTelemetry[];
    track(event: string, distinctId: string, properties: unknown): void;
    captureError(report: ErrorReport, distinctId?: string): void;
    flush(): Promise<void>;
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
export declare class RecordingS3Client implements Closable {
    readonly puts: RecordedS3Put[];
    send(command: {
        input?: S3CommandInput;
    }): Promise<Record<string, never>>;
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=recording-sinks.d.ts.map