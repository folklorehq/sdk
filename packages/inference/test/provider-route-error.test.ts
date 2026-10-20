// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ProviderHttpError } from '../src/ProviderHttpError.js';
import { ProviderRouteError } from '../src/ProviderRouteError.js';

describe('ProviderRouteError', () => {
  it('uses the code as its message and keeps no upstream text', () => {
    const error = new ProviderRouteError({ provider: 'anthropic', code: 'claude_overloaded' });
    expect(error.message).toBe('claude_overloaded');
    expect(error.code).toBe('claude_overloaded');
    expect(error.provider).toBe('anthropic');
  });

  it('keeps the status, the requested wait, the deferral class and the slow mark', () => {
    const error = new ProviderRouteError({
      provider: 'anthropic',
      code: 'claude_rate_limited',
      status: 429,
      retryAfterMs: 1_500,
      deferral: 'outage',
      marksSlow: true,
    });
    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(1_500);
    expect(error.deferral).toBe('outage');
    expect(error.marksSlow).toBe(true);
  });

  it('defaults to status 0, no wait, no deferral, not slow and not fallback eligible', () => {
    const error = new ProviderRouteError({ provider: 'anthropic', code: 'claude_refusal' });
    expect(error.status).toBe(0);
    expect(error.retryAfterMs).toBeUndefined();
    expect(error.deferral).toBeUndefined();
    expect(error.marksSlow).toBe(false);
    expect(error.fallbackEligible).toBe(false);
  });

  it('keeps a fallback eligibility the caller sets', () => {
    const error = new ProviderRouteError({
      provider: 'anthropic',
      code: 'claude_overloaded',
      fallbackEligible: true,
    });
    expect(error.fallbackEligible).toBe(true);
  });

  it('is a ProviderHttpError and carries no cause', () => {
    const error = new ProviderRouteError({ provider: 'anthropic', code: 'claude_overloaded' });
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect(error).toBeInstanceOf(Error);
    expect(error.cause).toBeUndefined();
    expect(Object.hasOwn(error, 'cause')).toBe(false);
  });
});
