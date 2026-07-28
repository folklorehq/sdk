/** Broad failure classes, each with a sensible default HTTP status. */
export type ErrorCategory = 'validation' | 'not_found' | 'forbidden' | 'conflict' | 'rate_limit' | 'external' | 'unavailable' | 'internal';
export interface AppErrorOptions {
    /** The underlying error/value that triggered this one. */
    cause?: unknown;
    /** Local-only structured detail for logging/debugging — NEVER sent to the control plane. */
    context?: Record<string, unknown>;
    /** Subsystem this error is attributed to, for fleet telemetry (ADL #18). */
    component?: string;
    /** Expected/handled failure (true) vs. a bug or unknown state (false). */
    isOperational?: boolean;
    /** Override the category's default HTTP status. */
    httpStatus?: number;
}
interface AppErrorParams extends AppErrorOptions {
    code: string;
    category: ErrorCategory;
}
/** Content-free shape that may be reported to the control plane (ADL #18). */
export interface ErrorTelemetry {
    error_type: string;
    component: string;
}
/** Base class for all application errors — only `toTelemetry()` is safe to send outward. */
export declare abstract class AppError extends Error {
    /** Stable machine-readable code; doubles as the telemetry `error_type`. */
    readonly code: string;
    readonly category: ErrorCategory;
    readonly httpStatus: number;
    readonly context?: Readonly<Record<string, unknown>>;
    readonly component?: string;
    readonly isOperational: boolean;
    protected constructor(message: string, params: AppErrorParams);
    /** Content-free classification for the control-plane check-in (ADL #18). */
    toTelemetry(): ErrorTelemetry;
    /** Structured fields for local logging. Stays inside the box. */
    toLogContext(): Record<string, unknown>;
}
export {};
//# sourceMappingURL=app-error.d.ts.map