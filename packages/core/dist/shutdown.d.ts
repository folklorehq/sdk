export type ShutdownHandler = () => void | Promise<void>;
export interface ShutdownOptions {
    /** Signals that trigger shutdown. Defaults to SIGINT + SIGTERM. */
    signals?: NodeJS.Signals[];
    /** Hard-exit deadline in ms if handlers hang. Defaults to 10s. */
    timeoutMs?: number;
    /** Called if a handler throws (remaining handlers still run). */
    onError?: (error: unknown) => void;
    /** Called once when a shutdown signal is received. */
    onSignal?: (signal: NodeJS.Signals) => void;
}
/** Collects cleanup callbacks and runs them once on process shutdown; `register()` each resource's `close()`, then `install()` to bind signal handlers. */
export declare class ShutdownManager {
    private readonly options;
    private readonly handlers;
    private installed;
    private shuttingDown;
    constructor(options?: ShutdownOptions);
    /** Register a cleanup callback. Handlers run in reverse order (LIFO). */
    register(handler: ShutdownHandler): this;
    /** Bind process signal handlers. Idempotent. */
    install(): this;
    /** Run every registered handler once. Safe to call directly (e.g. from tests) — unlike the signal path, it does not exit the process. */
    shutdown(signal?: NodeJS.Signals): Promise<void>;
}
//# sourceMappingURL=shutdown.d.ts.map