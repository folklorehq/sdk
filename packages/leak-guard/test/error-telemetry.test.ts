// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ExternalServiceError,
  InternalError,
  ValidationError,
  normalizeError,
  toErrorReport,
} from '@folklore/errors';
import { containsSentinel } from '../src/deep-scan.js';
import { makeSentinel } from '../src/sentinel.js';
import { markerEmbeddedIn } from '../src/content-arbitraries.js';

const SENTINEL = makeSentinel('errors').value;

// Content rides in .message / .context / a cause's stack — never in the outward-safe surfaces.
describe('AppError.toTelemetry() is content-free however the error is built (property)', () => {
  it('never leaks a message or context marker into toTelemetry()', () => {
    fc.assert(
      fc.property(markerEmbeddedIn(SENTINEL), markerEmbeddedIn(SENTINEL), (message, note) => {
        const err = new ValidationError(message, {
          component: 'ingestion',
          context: { note, raw: { body: message } },
        });
        return !containsSentinel(err.toTelemetry(), SENTINEL);
      }),
      { numRuns: 400 },
    );
  });

  it('never leaks into toErrorReport() (message, context, or cause stack)', () => {
    fc.assert(
      fc.property(markerEmbeddedIn(SENTINEL), (message) => {
        const cause = new Error(message);
        const err = new InternalError(message, {
          component: 'worker',
          context: { m: message },
          cause,
        });
        const report = toErrorReport(err, { origin: 'manual', component: 'worker' });
        return !containsSentinel(report, SENTINEL);
      }),
      { numRuns: 400 },
    );
  });

  it('scrubs a raw thrown native Error (normalizeError path)', () => {
    fc.assert(
      fc.property(markerEmbeddedIn(SENTINEL), (message) => {
        const report = toErrorReport(new Error(message), { origin: 'uncaught' });
        const normalized = normalizeError(new Error(message));
        return (
          !containsSentinel(report, SENTINEL) &&
          !containsSentinel(normalized.toTelemetry(), SENTINEL)
        );
      }),
      { numRuns: 400 },
    );
  });

  it('scrubs an external-service error carrying an upstream response body', () => {
    fc.assert(
      fc.property(markerEmbeddedIn(SENTINEL), (upstreamBody) => {
        const err = new ExternalServiceError('upstream failed', {
          component: 'slack',
          context: { responseBody: upstreamBody, url: `https://x/${upstreamBody}` },
        });
        return (
          !containsSentinel(err.toTelemetry(), SENTINEL) &&
          !containsSentinel(toErrorReport(err, { origin: 'http' }), SENTINEL)
        );
      }),
      { numRuns: 300 },
    );
  });

  it('toLogContext() remains content-free at the logging boundary', () => {
    const err = new ValidationError('bad', { context: { note: SENTINEL } });
    expect(containsSentinel(err.toLogContext(), SENTINEL)).toBe(false);
    expect(containsSentinel(err.toTelemetry(), SENTINEL)).toBe(false);
  });
});
