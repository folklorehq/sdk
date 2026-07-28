import { toErrorReport } from '@folklore/errors';
const FLUSH_TIMEOUT_MS = 2_000;
/** Captures process-level crashes to PostHog (content-free) then terminates. */
export function installGlobalErrorReporting(opts) {
    const onUncaught = (err) => void reportFatal(opts, 'uncaught', err);
    const onRejection = (reason) => void reportFatal(opts, 'unhandled_rejection', reason);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onRejection);
    return () => {
        process.off('uncaughtException', onUncaught);
        process.off('unhandledRejection', onRejection);
    };
}
async function reportFatal(opts, origin, err) {
    const errorReport = toErrorReport(err, { origin, component: opts.component });
    opts.client.captureError(errorReport);
    opts.logger?.error('process_error_captured', { ...errorReport });
    await flushWithTimeout(opts.client);
    (opts.exit ?? process.exit)(1);
}
async function flushWithTimeout(client) {
    const timer = new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS).unref());
    await Promise.race([client.flush().catch(() => undefined), timer]);
}
//# sourceMappingURL=global-errors.js.map