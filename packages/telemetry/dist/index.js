export { TelemetryEvent } from './events.js';
export { checkContentFree, checkDistinctId, assertContentFree, ContentFreeViolationError, } from './content-free.js';
export { installGlobalErrorReporting } from './global-errors.js';
export { NoopTelemetryClient } from './NoopTelemetryClient.js';
export { PostHogTelemetryClient } from './PostHogTelemetryClient.js';
import { NoopTelemetryClient } from './NoopTelemetryClient.js';
import { PostHogTelemetryClient } from './PostHogTelemetryClient.js';
export function createTelemetryClient() {
    const apiKey = process.env['POSTHOG_API_KEY'];
    if (apiKey) {
        return new PostHogTelemetryClient(apiKey, process.env['POSTHOG_HOST']);
    }
    return new NoopTelemetryClient();
}
//# sourceMappingURL=index.js.map