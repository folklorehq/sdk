/** Structured context attached to a log line. */
export interface LogContext {
    [key: string]: unknown;
}
/** Logging port — app code depends on this interface, never a concrete logger. */
export interface Logger {
    trace(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    fatal(message: string, context?: LogContext): void;
    /** Return a child logger that includes `bindings` on every line. */
    child(bindings: LogContext): Logger;
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
//# sourceMappingURL=ports.d.ts.map