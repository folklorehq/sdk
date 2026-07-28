// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  assertContentFree,
  checkContentFree,
  checkDistinctId,
  ContentFreeViolationError,
  PostHogTelemetryClient,
} from '@folklore/telemetry';
import { contentKey, contentString, contentPayload } from '../src/content-arbitraries.js';
import { makeSentinel } from '../src/sentinel.js';

const SENTINEL = makeSentinel('telemetry').value;

interface CaptureStub {
  captured: Array<{ event: string; distinctId: string; properties: Record<string, unknown> }>;
  capture(args: { event: string; distinctId: string; properties: Record<string, unknown> }): void;
  shutdown(): Promise<void>;
}

function captureStub(): CaptureStub {
  const captured: CaptureStub['captured'] = [];
  return {
    captured,
    capture: (args) => captured.push(args),
    shutdown: async () => {},
  };
}

function withStub(): { client: PostHogTelemetryClient; stub: CaptureStub } {
  const client = new PostHogTelemetryClient('phc_test_key_offline');
  const stub = captureStub();
  (client as unknown as { client: CaptureStub }).client = stub;
  return { client, stub };
}

describe('content-free telemetry guard — property-based', () => {
  it('rejects any property under a content-named key', () => {
    fc.assert(
      fc.property(contentKey(), contentString(), (key, value) => {
        return checkContentFree('any.event', { [key]: value }) !== null;
      }),
      { numRuns: 500 },
    );
  });

  it('rejects any value that is not a short primitive (nested / long)', () => {
    const nonPrimitive = fc.oneof(
      fc.array(fc.string(), { minLength: 1 }),
      fc.dictionary(fc.string({ minLength: 1 }), fc.string(), { minKeys: 1 }),
      fc.string({ minLength: 257, maxLength: 600 }),
    );
    fc.assert(
      fc.property(nonPrimitive, (value) => {
        return checkContentFree('any.event', { detail: value }) !== null;
      }),
      { numRuns: 400 },
    );
  });

  it('accepts genuinely content-free metadata (ids, counts, enums, bools)', () => {
    const metadataValue = fc.oneof(
      fc.uuid(),
      fc.integer(),
      fc.boolean(),
      fc.constantFrom('active', 'high', 'slack', 'github'),
    );
    const metadataKey = fc.constantFrom('orgId', 'count', 'status', 'sourceKind', 'confidence');
    fc.assert(
      fc.property(fc.dictionary(metadataKey, metadataValue, { maxKeys: 6 }), (props) => {
        return checkContentFree('fact.ingested', props) === null;
      }),
      { numRuns: 300 },
    );
  });

  it('rejects an email-shaped or over-long distinctId', () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => checkDistinctId(email) !== null),
      { numRuns: 200 },
    );
    expect(checkDistinctId('a'.repeat(257))).not.toBeNull();
    expect(checkDistinctId('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('assertContentFree throws a content-free violation for content payloads', () => {
    fc.assert(
      fc.property(contentKey(), contentString(), (key, value) => {
        try {
          assertContentFree('x', { [key]: value });
          return false;
        } catch (err) {
          return err instanceof ContentFreeViolationError && (err as Error).message.includes(key);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('the sentinel never survives the guard under a content key', () => {
    for (const key of ['message', 'body', 'content', 'text', 'summary', 'prompt']) {
      expect(checkContentFree('leak', { [key]: SENTINEL })).not.toBeNull();
    }
  });
});

describe('PostHogTelemetryClient — fail-closed at the send boundary', () => {
  it('never forwards a content-bearing payload to the transport (property)', () => {
    fc.assert(
      fc.property(contentKey(), contentString(), (key, value) => {
        const { client, stub } = withStub();
        client.track('fact.ingested' as never, 'system', { [key]: value } as never);
        client.captureError({ message: value } as never, 'system');
        return stub.captured.length === 0;
      }),
      { numRuns: 300 },
    );
  });

  it('never forwards when the distinctId is content (property)', () => {
    fc.assert(
      fc.property(contentPayload(), fc.emailAddress(), (props, email) => {
        const { client, stub } = withStub();
        client.track('fact.ingested' as never, email, props as never);
        return stub.captured.length === 0;
      }),
      { numRuns: 200 },
    );
  });

  it('does forward a genuinely content-free event (control)', () => {
    const { client, stub } = withStub();
    client.track('fact.ingested', 'org-123', { orgId: 'org-123', sourceKind: 'slack' });
    expect(stub.captured).toHaveLength(1);
  });
});
