// SPDX-License-Identifier: Apache-2.0
export type { BrowserEventRelay, TelemetryClient, TelemetryTrackOptions } from './ports.js';
export type {
  BrowserCatalog,
  BrowserEventProperties,
  BrowserSurface,
  BrowserTelemetryEventName,
  ClientErrorName,
  InvitePresetLabel,
  InviteRevocationCause,
  TelemetryEventMap,
  TelemetryEventName,
} from './events.js';
export {
  AGENT_ACCESS_TELEMETRY_CONFIG_CODES,
  AGENT_ACCESS_TELEMETRY_MODES,
  AGENT_ACCESS_TELEMETRY_SENSITIVITIES,
  AGENT_ACCESS_TELEMETRY_WRITE_DENIALS,
  areBrowserTelemetryPropertiesValid,
  BROWSER_SURFACES,
  browserTelemetryPropertyKeys,
  BrowserTelemetryEvent,
  CATALOG_BACKED_BROWSER_EVENTS,
  CLIENT_ERROR_NAMES,
  clientErrorName,
  isBrowserEventAllowedFrom,
  isBrowserTelemetryEvent,
  TelemetryEvent,
} from './events.js';
export {
  ANALYTICS_COLLECT_ENVELOPE_KEYS,
  ANALYTICS_COLLECT_PATH,
  ANALYTICS_COLLECT_WIRE_VERSION,
  parseCollectEnvelope,
  type CollectEnvelope,
} from './collect-envelope.js';
export {
  checkContentFree,
  checkDistinctId,
  assertContentFree,
  ContentFreeViolationError,
} from './content-free.js';
export { installGlobalErrorReporting, type GlobalErrorReportingOptions } from './global-errors.js';
export { NoopTelemetryClient } from './NoopTelemetryClient.js';
export { PostHogTelemetryClient } from './PostHogTelemetryClient.js';

import type { BrowserEventRelay, TelemetryClient } from './ports.js';
import { NoopTelemetryClient } from './NoopTelemetryClient.js';
import { PostHogTelemetryClient } from './PostHogTelemetryClient.js';

export function createTelemetryClient(): TelemetryClient & BrowserEventRelay {
  const apiKey = process.env['POSTHOG_API_KEY'];
  if (apiKey) {
    return new PostHogTelemetryClient(apiKey, process.env['POSTHOG_HOST']);
  }
  return new NoopTelemetryClient();
}
