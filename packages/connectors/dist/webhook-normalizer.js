import { normalizeWebhookEvent as normalizeWithRegistry } from './registry/index.js';
const noop = () => { };
const noopLogger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child() {
        return noopLogger;
    },
};
const webhookCtx = { logger: noopLogger };
export function normalizeWebhookEvent(source, eventType, payload) {
    return normalizeWithRegistry(source, eventType, payload, webhookCtx);
}
//# sourceMappingURL=webhook-normalizer.js.map