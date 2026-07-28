// SPDX-License-Identifier: Apache-2.0
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
export class ShutdownManager {
  private readonly handlers: ShutdownHandler[] = [];
  private installed = false;
  private shuttingDown = false;

  constructor(private readonly options: ShutdownOptions = {}) {}

  /** Register a cleanup callback. Handlers run in reverse order (LIFO). */
  register(handler: ShutdownHandler): this {
    this.handlers.push(handler);
    return this;
  }

  /** Bind process signal handlers. Idempotent. */
  install(): this {
    if (this.installed) return this;
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
  async shutdown(signal?: NodeJS.Signals): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    const { timeoutMs = 10_000, onError, onSignal } = this.options;
    if (signal) onSignal?.(signal);

    const timer = setTimeout(() => process.exit(1), timeoutMs);
    timer.unref();

    for (const handler of [...this.handlers].reverse()) {
      try {
        await handler();
      } catch (error) {
        onError?.(error);
      }
    }

    clearTimeout(timer);
  }
}
