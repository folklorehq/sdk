// SPDX-License-Identifier: Apache-2.0
export type { TelemetryClient } from './ports.js';
export type { TelemetryEventMap, TelemetryEventName } from './events.js';
export { TelemetryEvent } from './events.js';
export {
  checkContentFree,
  checkDistinctId,
  assertContentFree,
  ContentFreeViolationError,
} from './content-free.js';
export { installGlobalErrorReporting, type GlobalErrorReportingOptions } from './global-errors.js';
export { NoopTelemetryClient } from './NoopTelemetryClient.js';
export { PostHogTelemetryClient } from './PostHogTelemetryClient.js';

import type { TelemetryClient } from './ports.js';
import { NoopTelemetryClient } from './NoopTelemetryClient.js';
import { PostHogTelemetryClient } from './PostHogTelemetryClient.js';

export function createTelemetryClient(): TelemetryClient {
  const apiKey = process.env['POSTHOG_API_KEY'];
  if (apiKey) {
    return new PostHogTelemetryClient(apiKey, process.env['POSTHOG_HOST']);
  }
  return new NoopTelemetryClient();
}
