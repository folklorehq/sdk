// SPDX-License-Identifier: Apache-2.0
import type { ErrorReport } from '@folklore/errors';
import type {
  BrowserCatalog,
  BrowserSurface,
  BrowserTelemetryEventName,
  TelemetryEventMap,
  TelemetryEventName,
} from './events.js';

export interface TelemetryTrackOptions {
  timestamp?: Date;
}

export interface TelemetryClient {
  track<K extends TelemetryEventName>(
    event: K,
    distinctId: string,
    properties: TelemetryEventMap[K],
    options?: TelemetryTrackOptions,
  ): void;
  /** Records a content-free error as a PostHog event — the Sentry alternative. */
  captureError(report: ErrorReport, distinctId?: string): void;
  flush(): Promise<void>;
}

export interface BrowserEventRelay {
  relayBrowserEvent(
    event: BrowserTelemetryEventName,
    surface: BrowserSurface,
    distinctId: string,
    properties: Record<string, unknown>,
    catalog: BrowserCatalog,
  ): boolean;
}
