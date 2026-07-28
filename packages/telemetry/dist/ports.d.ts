import type { ErrorReport } from '@folklore/errors';
import type { TelemetryEventMap, TelemetryEventName } from './events.js';
export interface TelemetryClient {
    track<K extends TelemetryEventName>(event: K, distinctId: string, properties: TelemetryEventMap[K]): void;
    /** Records a content-free error (ADL #18) as a PostHog event — the Sentry alternative. */
    captureError(report: ErrorReport, distinctId?: string): void;
    flush(): Promise<void>;
}
//# sourceMappingURL=ports.d.ts.map