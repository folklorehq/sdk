// SPDX-License-Identifier: Apache-2.0
export type { TelemetryClient, TelemetryTrackOptions } from './ports.js';
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
  areBrowserTelemetryPropertiesValid,
  BROWSER_SURFACES,
  BrowserTelemetryEvent,
  CATALOG_BACKED_BROWSER_EVENTS,
  CLIENT_ERROR_NAMES,
  clientErrorName,
  isBrowserEventAllowedFrom,
  isBrowserTelemetryEvent,
  TelemetryEvent,
} from './events.js';
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
