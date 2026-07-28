export type { TelemetryClient } from './ports.js';
export type { TelemetryEventMap, TelemetryEventName } from './events.js';
export { TelemetryEvent } from './events.js';
export { checkContentFree, checkDistinctId, assertContentFree, ContentFreeViolationError, } from './content-free.js';
export { installGlobalErrorReporting, type GlobalErrorReportingOptions } from './global-errors.js';
export { NoopTelemetryClient } from './noop.js';
export { PostHogTelemetryClient } from './posthog.js';
import type { TelemetryClient } from './ports.js';
export declare function createTelemetryClient(): TelemetryClient;
//# sourceMappingURL=index.d.ts.map