/** Collects cleanup callbacks and runs them once on process shutdown; `register()` each resource's `close()`, then `install()` to bind signal handlers. */
export class ShutdownManager {
    options;
    handlers = [];
    installed = false;
    shuttingDown = false;
    constructor(options = {}) {
        this.options = options;
    }
    /** Register a cleanup callback. Handlers run in reverse order (LIFO). */
    register(handler) {
        this.handlers.push(handler);
        return this;
    }
    /** Bind process signal handlers. Idempotent. */
    install() {
        if (this.installed)
            return this;
        this.installed = true;
        const signals = this.options.signals ?? ['SIGINT', 'SIGTERM'];
        for (const signal of signals) {
            process.once(signal, () => {
                void this.shutdown(signal).then(() => process.exit(0));
            });
        }
        return this;
    }
    /** Run every registered handler once. Safe to call directly (e.g. from tests) — unlike the signal path, it does not exit the process. */
    async shutdown(signal) {
        if (this.shuttingDown)
            return;
        this.shuttingDown = true;
        const { timeoutMs = 10_000, onError, onSignal } = this.options;
        if (signal)
            onSignal?.(signal);
        const timer = setTimeout(() => process.exit(1), timeoutMs);
        timer.unref();
        for (const handler of [...this.handlers].reverse()) {
            try {
                await handler();
            }
            catch (error) {
                onError?.(error);
            }
        }
        clearTimeout(timer);
    }
}
//# sourceMappingURL=shutdown.js.map