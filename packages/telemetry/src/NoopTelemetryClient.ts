// SPDX-License-Identifier: Apache-2.0
import type { TelemetryClient } from './ports.js';

export class NoopTelemetryClient implements TelemetryClient {
  track(): void {}
  captureError(): void {}
  async flush(): Promise<void> {}
}
