import type { LogContext, Logger } from '@folklore/core';
export interface PinoLoggerOptions {
    /** Minimum level to emit. Defaults to 'info'. Use 'silent' to disable. */
    level?: string;
    /** Pretty-print via pino-pretty (for local dev). Defaults to false. */
    pretty?: boolean;
    /** Optional logger name added to every line. */
    name?: string;
    /** Initial bindings merged into every line. */
    bindings?: LogContext;
}
/** Pino-backed adapter for the `Logger` port. */
export declare class PinoLogger implements Logger {
    private pino;
    constructor(options?: PinoLoggerOptions);
    private static fromInstance;
    trace(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, context?: LogContext): void;
    fatal(message: string, context?: LogContext): void;
    child(bindings: LogContext): Logger;
}
//# sourceMappingURL=index.d.ts.map