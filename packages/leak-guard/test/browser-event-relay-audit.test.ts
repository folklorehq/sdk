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

  it.each([
    "relay.relayBrowserEvent('page_viewed', 'web', id, props, catalog);",
    "relay['relayBrowserEvent'](event, surface, id, props, catalog);",
    'relay.relayBrowserEvent.call(relay, event, surface, id, props, catalog);',
    'const send = relay.relayBrowserEvent.bind(relay);',
    'relay.relayBrowserEvent.apply(relay, args);',
    'const { relayBrowserEvent } = relay;',
    'const { relayBrowserEvent: send } = relay;',
    "const key = 'relayBrowserEvent'; relay[key](event);",
  ])('flags any reference to the relay outside the collect handler: %s', (statement) => {
    expect(auditBrowserEventRelaySource('apps/worker/src/x.ts', statement).length).toBeGreaterThan(
      0,
    );
    expect(auditBrowserEventRelaySource(COLLECT_FILE, statement)).toEqual([]);
  });

  it('allows the telemetry package source to define and call the relay', () => {
    expect(
      auditBrowserEventRelaySource(
        'packages/telemetry/src/PostHogTelemetryClient.ts',
        'relayBrowserEvent(event: string) { return true; }',
      ),
    ).toEqual([]);
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
