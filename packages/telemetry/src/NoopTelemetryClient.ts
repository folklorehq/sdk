// SPDX-License-Identifier: Apache-2.0
import type { BrowserEventRelay, TelemetryClient } from './ports.js';

export class NoopTelemetryClient implements TelemetryClient, BrowserEventRelay {
  track(): void {}
  relayBrowserEvent(): boolean {
    return false;
  }
  captureError(): void {}
  async flush(): Promise<void> {}
}
