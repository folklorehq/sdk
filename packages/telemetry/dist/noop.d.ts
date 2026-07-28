import type { TelemetryClient } from './ports.js';
export declare class NoopTelemetryClient implements TelemetryClient {
    track(): void;
    captureError(): void;
    flush(): Promise<void>;
}
//# sourceMappingURL=noop.d.ts.map