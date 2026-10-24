// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  BrowserTelemetryEvent,
  CATALOG_BACKED_BROWSER_EVENTS,
  PostHogTelemetryClient,
  TelemetryEvent,
  type TelemetryEventMap,
  type TelemetryEventName,
} from '@folklore/telemetry';
import { findSentinel } from '../src/deep-scan.js';
import { makeSentinel, sentinelSentence } from '../src/sentinel.js';

const SENTINEL = makeSentinel('relay');
const HOSTILE_TEXT = sentinelSentence(SENTINEL);
const MARKETING_DISTINCT_ID = 'b3c1a9e2-5f47-4d8b-9e16-2a7c4f0d8e53';

const RELAYED_EVENT_FIXTURES = {
  [BrowserTelemetryEvent.PageViewed]: { eventSchemaVersion: 1, page: '/pricing' },
  [BrowserTelemetryEvent.CtaClicked]: {
    eventSchemaVersion: 1,
    cta: 'hero_get_started',
    page: '/',
  },
  [BrowserTelemetryEvent.RouteViewed]: {
    eventSchemaVersion: 1,
    surface: 'console',
    routeTemplate: '/members',
  },
  [BrowserTelemetryEvent.OnboardingStepViewed]: { eventSchemaVersion: 1, step: 'sources' },
  [BrowserTelemetryEvent.SignInCompleted]: {},
  [BrowserTelemetryEvent.ClientError]: { origin: 'error_boundary', errorName: 'TypeError' },
  [BrowserTelemetryEvent.SourceConnectStarted]: { eventSchemaVersion: 1, sourceKind: 'github' },
  [BrowserTelemetryEvent.SourceConnectFailed]: {
    eventSchemaVersion: 1,
    sourceKind: 'github',
    reason: 'network',
  },
  [TelemetryEvent.ApiRequest]: {
    method: 'GET',
    routeTemplate: '/v1/orgs/:id/members',
    statusCode: 200,
    durationBucket: 'lt_100ms',
  },
} satisfies Partial<{ [K in TelemetryEventName]: TelemetryEventMap[K] }>;

type RelayedEvent = keyof typeof RELAYED_EVENT_FIXTURES;

interface CaptureStub {
  captured: Array<{ event: string; distinctId: string; properties: Record<string, unknown> }>;
  capture(args: CaptureStub['captured'][number]): void;
  shutdown(): Promise<void>;
}

function withStub(): { client: PostHogTelemetryClient; stub: CaptureStub } {
  const client = new PostHogTelemetryClient('phc_test_key_offline');
  const captured: CaptureStub['captured'] = [];
  const stub: CaptureStub = {
    captured,
    capture: (args) => captured.push(args),
    shutdown: async () => {},
  };
  (client as unknown as { client: CaptureStub }).client = stub;
  return { client, stub };
}

const relayedEvents = Object.keys(RELAYED_EVENT_FIXTURES) as RelayedEvent[];
const stringLeaves = relayedEvents.flatMap((event) =>
  Object.entries(RELAYED_EVENT_FIXTURES[event])
    .filter(([, value]) => typeof value === 'string')
    .map(([key]) => [event, key] as const),
);

describe('analytics relay: closed contracts fail closed on content', () => {
  const catalogFreeEvents = relayedEvents.filter(
    (event) => !CATALOG_BACKED_BROWSER_EVENTS.has(event),
  );
  const catalogBackedEvents = relayedEvents.filter((event) =>
    CATALOG_BACKED_BROWSER_EVENTS.has(event),
  );

  it.each(catalogBackedEvents)(
    'refuses a valid %s because the relay supplies no catalog',
    (event) => {
      const { client, stub } = withStub();

      client.track(event, MARKETING_DISTINCT_ID, RELAYED_EVENT_FIXTURES[event] as never);

      expect(stub.captured).toEqual([]);
    },
  );

  it.each(catalogFreeEvents)('captures the valid %s fixture without the sentinel', (event) => {
    const { client, stub } = withStub();

    client.track(event, MARKETING_DISTINCT_ID, RELAYED_EVENT_FIXTURES[event] as never);

    expect(stub.captured).toHaveLength(1);
    expect(findSentinel(stub.captured, SENTINEL)).toEqual([]);
  });

  it.each(stringLeaves)('%s drops a payload whose %s value is content', (event, key) => {
    const { client, stub } = withStub();

    client.track(event, MARKETING_DISTINCT_ID, {
      ...RELAYED_EVENT_FIXTURES[event],
      [key]: HOSTILE_TEXT,
    } as never);

    expect(stub.captured).toEqual([]);
  });

  it.each(relayedEvents)('%s drops a payload with an added content key', (event) => {
    const { client, stub } = withStub();

    client.track(event, MARKETING_DISTINCT_ID, {
      ...RELAYED_EVENT_FIXTURES[event],
      note: HOSTILE_TEXT,
    } as never);

    expect(stub.captured).toEqual([]);
  });

  it.each(relayedEvents)('%s drops a payload sent under a content distinct id', (event) => {
    const { client, stub } = withStub();

    client.track(event, HOSTILE_TEXT, RELAYED_EVENT_FIXTURES[event] as never);

    expect(stub.captured).toEqual([]);
  });

  it('drops a relayed event name that is not in the closed catalog', () => {
    const { client, stub } = withStub();

    client.track(HOSTILE_TEXT as never, MARKETING_DISTINCT_ID, {} as never);

    expect(stub.captured).toEqual([]);
  });
});
