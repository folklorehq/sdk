// SPDX-License-Identifier: Apache-2.0
import { expect, expectTypeOf, it } from 'vitest';
import {
  areBrowserTelemetryPropertiesValid,
  isBrowserTelemetryProperty,
  isBrowserSourceKind,
  isBrowserTelemetryEvent,
  type BrowserTelemetryEventName,
  type TelemetryEventMap,
} from '../src/events.js';

it('keeps browser event properties closed and flat', () => {
  expectTypeOf<BrowserTelemetryEventName>().toEqualTypeOf<
    'source.connect_started' | 'source.connect_failed' | 'sign_in_completed' | 'client_error'
  >();
  expectTypeOf<TelemetryEventMap['source.connect_started']>().toEqualTypeOf<{
    eventSchemaVersion: 1;
    sourceKind:
      | 'github'
      | 'code'
      | 'slack'
      | 'linear'
      | 'notion'
      | 'jira'
      | 'intercom'
      | 'confluence'
      | 'google_drive'
      | 'gmail'
      | 'microsoft365'
      | 'microsoft365_mail'
      | 'google_calendar'
      | 'microsoft365_calendar';
  }>();
  expectTypeOf<TelemetryEventMap['sign_in_completed']>().toEqualTypeOf<Record<string, never>>();
  expectTypeOf<TelemetryEventMap['client_error']>().toEqualTypeOf<{
    origin: 'error_boundary' | 'window_error' | 'unhandled_rejection';
    errorName: string;
  }>();

  // @ts-expect-error The browser catalog accepts no ad-hoc event names.
  const unknownEvent: BrowserTelemetryEventName = 'source.connected';
  const unknownProperty: TelemetryEventMap['source.connect_started'] = {
    eventSchemaVersion: 1,
    sourceKind: 'github',
    // @ts-expect-error Browser event properties cannot include arbitrary keys.
    title: 'customer content',
  };
  const nestedValue: TelemetryEventMap['source.connect_started'] = {
    eventSchemaVersion: 1,
    // @ts-expect-error Browser event values remain flat primitives.
    sourceKind: { id: 'github' },
  };
  const arbitraryReason: TelemetryEventMap['source.connect_failed'] = {
    eventSchemaVersion: 1,
    sourceKind: 'github',
    // @ts-expect-error Failure reasons are a closed union, never an arbitrary dependency string.
    reason: 'OAuth error: token abc123',
  };
  const arbitraryOrigin: TelemetryEventMap['client_error'] = {
    // @ts-expect-error Client error origins are a closed union.
    origin: 'renderer',
    errorName: 'TypeError',
  };
  expect([unknownEvent, unknownProperty, nestedValue, arbitraryReason]).toHaveLength(4);
  expect([arbitraryOrigin]).toHaveLength(1);
});

it('rejects inherited and unknown browser event names at runtime', () => {
  expect(isBrowserTelemetryEvent('toString')).toBe(false);
  expect(isBrowserTelemetryEvent('constructor')).toBe(false);
  expect(isBrowserTelemetryEvent('source.connected')).toBe(false);
});

it('accepts only source kinds in the browser egress catalog', () => {
  expect(isBrowserSourceKind('github')).toBe(true);
  expect(isBrowserSourceKind('meeting')).toBe(false);
  expect(isBrowserSourceKind('email')).toBe(false);
});

it('keeps client error properties content-free at runtime', () => {
  expect(isBrowserTelemetryProperty('client_error', 'origin', 'window_error')).toBe(true);
  expect(isBrowserTelemetryProperty('client_error', 'origin', 'renderer')).toBe(false);
  expect(isBrowserTelemetryProperty('client_error', 'errorName', 'TypeError')).toBe(true);
  expect(
    isBrowserTelemetryProperty('client_error', 'errorName', 'TypeError: customer content'),
  ).toBe(false);
  expect(isBrowserTelemetryProperty('client_error', 'errorName', '')).toBe(false);
  expect(isBrowserTelemetryProperty('client_error', 'origin', 'window_error')).toBe(true);
});

it('keeps empty browser events property-free at runtime', () => {
  expect(areBrowserTelemetryPropertiesValid('sign_in_completed', {})).toBe(true);
  expect(areBrowserTelemetryPropertiesValid('sign_in_completed', { provider: 'google' })).toBe(
    false,
  );
  expect(areBrowserTelemetryPropertiesValid('sign_in_completed', { eventSchemaVersion: 1 })).toBe(
    false,
  );
});
