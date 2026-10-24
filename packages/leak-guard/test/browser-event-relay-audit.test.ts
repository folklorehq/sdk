// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  auditBrowserEventRelaySource,
  auditBrowserEventRelayTree,
} from '../src/browser-event-relay-audit.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const COLLECT_FILE = 'apps/control-plane-server/src/analytics/collect/AnalyticsCollectHandler.ts';

describe('browser event relay audit', () => {
  it('flags a server track of a browser event name outside the collect handler', () => {
    expect(
      auditBrowserEventRelaySource(
        'apps/worker/src/x.ts',
        "telemetry.track('page_viewed', id, { eventSchemaVersion: 1, page: '/' });",
      ),
    ).toEqual([{ file: 'apps/worker/src/x.ts', line: 1 }]);
  });

  it('allows the same call under the collect handler directory', () => {
    expect(
      auditBrowserEventRelaySource(
        COLLECT_FILE,
        "telemetry.track('page_viewed', id, { eventSchemaVersion: 1, page: '/' });",
      ),
    ).toEqual([]);
  });

  it.each([
    "this.deps.telemetry.track('route_viewed', id, props);",
    'telemetry.track(`client_error`, id, props);',
    "telemetry['track']('sign_in_completed', id, {});",
    'telemetry.track(BrowserTelemetryEvent.PageViewed, id, props);',
    "telemetry.track('source.connect_started', id, props, { timestamp });",
  ])('flags %s', (statement) => {
    expect(auditBrowserEventRelaySource('apps/api/src/x.ts', statement)).toHaveLength(1);
  });

  it.each([
    "client.track('client_error', { origin: 'window_error', errorName: 'other' });",
    "telemetry.track('fact.ingested', id, props);",
    'telemetry.track(TelemetryEvent.ApiRequest, id, props);',
    "telemetry.track('page_viewed');",
    "logger.info('page_viewed', id, props);",
  ])('allows %s', (statement) => {
    expect(auditBrowserEventRelaySource('apps/api/src/x.ts', statement)).toEqual([]);
  });

  it('reports the line of each violation', () => {
    expect(
      auditBrowserEventRelaySource(
        'apps/api/src/x.ts',
        "const a = 1;\n\ntelemetry.track('page_viewed', id, props);",
      ),
    ).toEqual([{ file: 'apps/api/src/x.ts', line: 3 }]);
  });

  it('accepts the production source tree', () => {
    expect(auditBrowserEventRelayTree(ROOT)).toEqual([]);
  });
});
