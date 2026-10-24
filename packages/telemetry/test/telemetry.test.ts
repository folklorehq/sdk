// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  NoopTelemetryClient,
  PostHogTelemetryClient,
  createTelemetryClient,
} from '../src/index.js';

const posthogMock = vi.hoisted(() => ({
  constructed: [] as Array<{ apiKey: string; options: Record<string, unknown> }>,
  captured: [] as Array<Record<string, unknown>>,
}));

vi.mock('posthog-node', () => ({
  PostHog: class {
    constructor(apiKey: string, options: Record<string, unknown>) {
      posthogMock.constructed.push({ apiKey, options });
    }
    capture(message: Record<string, unknown>): void {
      posthogMock.captured.push(message);
    }
    async shutdown(): Promise<void> {}
  },
}));

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-24T12:00:00.000Z');
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

describe('NoopTelemetryClient', () => {
  it('track does not throw', () => {
    const client = new NoopTelemetryClient();
    expect(() =>
      client.track('fact.ingested', 'org-1', { orgId: 'org-1', sourceKind: 'github' }),
    ).not.toThrow();
  });

  it('flush resolves', async () => {
    const client = new NoopTelemetryClient();
    await expect(client.flush()).resolves.toBeUndefined();
  });

  it('captureError does not throw', () => {
    const client = new NoopTelemetryClient();
    expect(() =>
      client.captureError({
        error_type: 'internal_error',
        error_name: 'InternalError',
        category: 'internal',
        http_status: 500,
        operational: false,
        component: 'worker',
        origin: 'uncaught',
        fingerprint: 'abc123',
      }),
    ).not.toThrow();
  });
});

describe('createTelemetryClient', () => {
  it('returns NoopTelemetryClient when POSTHOG_API_KEY is absent', () => {
    const original = process.env['POSTHOG_API_KEY'];
    delete process.env['POSTHOG_API_KEY'];
    const client = createTelemetryClient();
    expect(client).toBeInstanceOf(NoopTelemetryClient);
    if (original !== undefined) process.env['POSTHOG_API_KEY'] = original;
  });

  it('returns PostHogTelemetryClient when POSTHOG_API_KEY is present', async () => {
    process.env['POSTHOG_API_KEY'] = 'phc_test';
    const { createTelemetryClient: create, PostHogTelemetryClient } =
      await import('../src/index.js');
    const client = create();
    expect(client).toBeInstanceOf(PostHogTelemetryClient);
    delete process.env['POSTHOG_API_KEY'];
  });
});

describe('PostHogTelemetryClient transport options', () => {
  beforeEach(() => {
    posthogMock.constructed.length = 0;
    posthogMock.captured.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('constructs the SDK with GeoIP disabled', () => {
    new PostHogTelemetryClient('phc_test', 'https://us.i.posthog.com');

    expect(posthogMock.constructed).toEqual([
      {
        apiKey: 'phc_test',
        options: {
          host: 'https://us.i.posthog.com',
          flushAt: 20,
          flushInterval: 10_000,
          disableGeoip: true,
        },
      },
    ]);
  });

  function captureWithTimestamp(timestamp: Date | undefined): Record<string, unknown> | undefined {
    posthogMock.captured.length = 0;
    const client = new PostHogTelemetryClient('phc_test');
    client.track(
      'fact.ingested',
      ORGANIZATION_ID,
      { orgId: ORGANIZATION_ID, sourceKind: 'github' },
      timestamp === undefined ? undefined : { timestamp },
    );
    return posthogMock.captured[0];
  }

  it.each([
    ['one hour old', new Date(NOW.getTime() - HOUR_MS)],
    ['exactly 24 hours old', new Date(NOW.getTime() - 24 * HOUR_MS)],
    ['five minutes ahead', new Date(NOW.getTime() + 5 * MINUTE_MS)],
  ])('passes a timestamp that is %s', (_case, timestamp) => {
    expect(captureWithTimestamp(timestamp)).toMatchObject({ timestamp });
  });

  it.each([
    ['25 hours old', new Date(NOW.getTime() - 25 * HOUR_MS)],
    ['six minutes ahead', new Date(NOW.getTime() + 6 * MINUTE_MS)],
    ['invalid', new Date(Number.NaN)],
  ])('omits a timestamp that is %s but still captures the event', (_case, timestamp) => {
    const captured = captureWithTimestamp(timestamp);

    expect(captured).toBeDefined();
    expect(captured).not.toHaveProperty('timestamp');
  });

  it('omits the timestamp when none is given', () => {
    expect(captureWithTimestamp(undefined)).not.toHaveProperty('timestamp');
  });

  it('passes a fresh Date, not a hostile subclass instance, and never calls its toJSON', () => {
    class HostileDate extends Date {
      override toJSON(): string {
        throw new Error('customer content');
      }
      override getTime(): number {
        throw new Error('customer content');
      }
    }
    const hostile = new HostileDate(NOW.getTime() - HOUR_MS);

    const captured = captureWithTimestamp(hostile);

    expect(captured?.['timestamp']).toEqual(new Date(NOW.getTime() - HOUR_MS));
    expect(captured?.['timestamp']).not.toBeInstanceOf(HostileDate);
  });

  it('drops a Date-prototype object that has no time value, and still captures', () => {
    const captured = captureWithTimestamp(Object.create(Date.prototype) as Date);

    expect(captured).toBeDefined();
    expect(captured).not.toHaveProperty('timestamp');
  });

  it('never throws out of track when the options bag is hostile', () => {
    posthogMock.captured.length = 0;
    const client = new PostHogTelemetryClient('phc_test');
    const options = {
      get timestamp(): Date {
        throw new Error('customer content');
      },
    };

    expect(() =>
      client.track(
        'fact.ingested',
        ORGANIZATION_ID,
        { orgId: ORGANIZATION_ID, sourceKind: 'github' },
        options,
      ),
    ).not.toThrow();
    expect(posthogMock.captured[0]).not.toHaveProperty('timestamp');
  });

  it('omits a timestamp that is not a Date', () => {
    posthogMock.captured.length = 0;
    const client = new PostHogTelemetryClient('phc_test');

    client.track(
      'fact.ingested',
      ORGANIZATION_ID,
      { orgId: ORGANIZATION_ID, sourceKind: 'github' },
      { timestamp: '2026-10-24T11:00:00Z' } as never,
    );

    expect(posthogMock.captured[0]).not.toHaveProperty('timestamp');
  });
});
