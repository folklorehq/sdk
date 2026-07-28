// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { NoopTelemetryClient, createTelemetryClient } from '../src/index.js';

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
