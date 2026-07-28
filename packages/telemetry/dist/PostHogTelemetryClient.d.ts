import type { ErrorReport } from '@folklore/errors';
import type { TelemetryClient } from './ports.js';
import type { TelemetryEventName, TelemetryEventMap } from './events.js';
export declare class PostHogTelemetryClient implements TelemetryClient {
    private readonly client;
    constructor(apiKey: string, host?: string);
    track<K extends TelemetryEventName>(event: K, distinctId: string, properties: TelemetryEventMap[K]): void;
    captureError(report: ErrorReport, distinctId?: string): void;
    private capture;
    flush(): Promise<void>;
}
//# sourceMappingURL=PostHogTelemetryClient.d.ts.map