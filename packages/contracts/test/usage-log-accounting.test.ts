// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { paidCallsOf, type TokenUsage } from '../src/enclave.js';
import { USAGE_LOG_COST_BUCKET_MICROS } from '../src/inference-pricing.js';

const entry = (calls: number, cachedCalls: number): TokenUsage => ({
  model: 'claude-sonnet-5-5',
  operation: 'generate',
  calls,
  cachedCalls,
  promptTokens: 0,
  completionTokens: 0,
});

describe('USAGE_LOG_COST_BUCKET_MICROS', () => {
  it('is 10,000 micros, one cent', () => {
    expect(USAGE_LOG_COST_BUCKET_MICROS).toBe(10_000);
  });
});

describe('paidCallsOf', () => {
  it.each([
    [3, 0, 3],
    [3, 2, 1],
    [2, 2, 0],
    [1, 4, 0],
    [0, 0, 0],
  ])('%i calls with %i cached is %i paid', (calls, cached, paid) => {
    expect(paidCallsOf(entry(calls, cached))).toBe(paid);
  });
});
