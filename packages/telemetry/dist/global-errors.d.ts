import type { Logger } from '@folklore/core';
import type { TelemetryClient } from './ports.js';
export interface GlobalErrorReportingOptions {
    client: TelemetryClient;
    component: string;
    logger?: Logger;
    exit?: (code: number) => void;
}
/** Captures process-level crashes to PostHog (content-free, ADL #18) then terminates. */
export declare function installGlobalErrorReporting(opts: GlobalErrorReportingOptions): () => void;
//# sourceMappingURL=global-errors.d.ts.map