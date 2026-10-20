// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { INFERENCE_MODEL_CATALOG, INFERENCE_MODEL_IDS } from '../src/inference-catalog.js';
import { UNKNOWN_MODEL_PRICES, pricesFor, usageCostMicros } from '../src/inference-pricing.js';

const TOKENS_PER_MTOK = 1_000_000;
const PRICE_CLASSES = ['input', 'output', 'cacheWrite', 'cacheRead'] as const;

describe('usageCostMicros', () => {
  it('prices each catalog model exactly, per token class', () => {
    for (const model of INFERENCE_MODEL_IDS) {
      const { prices } = INFERENCE_MODEL_CATALOG[model];
      const base = { model, promptTokens: 0, completionTokens: 0 };
      expect(usageCostMicros({ ...base, promptTokens: TOKENS_PER_MTOK }), model).toBe(prices.input);
      expect(usageCostMicros({ ...base, completionTokens: TOKENS_PER_MTOK }), model).toBe(
        prices.output,
      );
      expect(usageCostMicros({ ...base, cacheReadTokens: TOKENS_PER_MTOK }), model).toBe(
        prices.cacheRead,
      );
      expect(usageCostMicros({ ...base, cacheWriteTokens: TOKENS_PER_MTOK }), model).toBe(
        prices.cacheWrite,
      );
    }
    expect(INFERENCE_MODEL_CATALOG['claude-sonnet-5-5'].prices.output).toBe(11_000_000);
  });

  it('prices Sonnet cache reads at 0.05x base input with the US uplift', () => {
    expect(INFERENCE_MODEL_CATALOG['claude-sonnet-5-5'].prices.cacheRead).toBe(110_000);
  });

  it('sums the classes at their own prices and rounds the total up', () => {
    expect(
      usageCostMicros({
        model: 'claude-sonnet-5-5',
        promptTokens: 1_000,
        completionTokens: 500,
        cacheReadTokens: 10_000,
        cacheWriteTokens: 2_000,
      }),
    ).toBe(2_200 + 5_500 + 1_100 + 5_500);
    expect(
      usageCostMicros({
        model: 'claude-haiku-5-5',
        promptTokens: 0,
        completionTokens: 0,
        cacheReadTokens: 1,
      }),
    ).toBe(1);
  });

  it('is exact where float arithmetic would round a whole total up', () => {
    expect(
      usageCostMicros({ model: 'claude-opus-5-5', promptTokens: 5, completionTokens: 0 }),
    ).toBe(22);
  });

  it('prices a Phala model from the catalog instead of 0', () => {
    expect(
      usageCostMicros({
        model: 'z-ai/glm-5.2',
        promptTokens: TOKENS_PER_MTOK,
        completionTokens: TOKENS_PER_MTOK,
      }),
    ).toBe(1_260_000 + 3_000_000);
  });

  it('prices embedding usage at the listed embedding rate', () => {
    expect(
      usageCostMicros({
        model: 'qwen/qwen3-embedding-8b',
        promptTokens: TOKENS_PER_MTOK,
        completionTokens: 0,
      }),
    ).toBe(10_000);
  });

  it('prices an unknown model at the per-class maximum, never 0', () => {
    for (const model of ['unknown', 'toString', '__proto__', 'phala/glm-5.3']) {
      for (const priceClass of PRICE_CLASSES) {
        const counts = {
          input: { promptTokens: TOKENS_PER_MTOK, completionTokens: 0 },
          output: { promptTokens: 0, completionTokens: TOKENS_PER_MTOK },
          cacheWrite: { promptTokens: 0, completionTokens: 0, cacheWriteTokens: TOKENS_PER_MTOK },
          cacheRead: { promptTokens: 0, completionTokens: 0, cacheReadTokens: TOKENS_PER_MTOK },
        }[priceClass];
        const cost = usageCostMicros({ model, ...counts });
        expect(cost, `${model} ${priceClass}`).toBe(UNKNOWN_MODEL_PRICES[priceClass]);
        expect(cost).toBeGreaterThan(0);
      }
    }
  });

  it('folds the per-class maximum over every entry and long-context tier', () => {
    expect(UNKNOWN_MODEL_PRICES.output).toBe(22_000_000);
    for (const entry of Object.values(INFERENCE_MODEL_CATALOG)) {
      const tiers = [entry.prices, ...(entry.longContext ? [entry.longContext.prices] : [])];
      for (const prices of tiers) {
        for (const priceClass of PRICE_CLASSES) {
          expect(UNKNOWN_MODEL_PRICES[priceClass]).toBeGreaterThanOrEqual(prices[priceClass]);
        }
      }
    }
  });

  it('resolves pricesFor by own property only', () => {
    expect(pricesFor('claude-opus-5-5')).toBe(INFERENCE_MODEL_CATALOG['claude-opus-5-5'].prices);
    expect(pricesFor('toString')).toBe(UNKNOWN_MODEL_PRICES);
    expect(pricesFor('__proto__')).toBe(UNKNOWN_MODEL_PRICES);
    expect(pricesFor('constructor')).toBe(UNKNOWN_MODEL_PRICES);
  });

  it.each([
    ['a negative prompt count', { promptTokens: -1, completionTokens: 0 }],
    ['a negative completion count', { promptTokens: 0, completionTokens: -1 }],
    ['a fractional count', { promptTokens: 1.5, completionTokens: 0 }],
    ['NaN', { promptTokens: Number.NaN, completionTokens: 0 }],
    ['Infinity', { promptTokens: Number.POSITIVE_INFINITY, completionTokens: 0 }],
    ['an unsafe integer', { promptTokens: Number.MAX_SAFE_INTEGER + 1, completionTokens: 0 }],
    ['a negative cache read', { promptTokens: 0, completionTokens: 0, cacheReadTokens: -1 }],
    ['a fractional cache write', { promptTokens: 0, completionTokens: 0, cacheWriteTokens: 0.5 }],
  ])('throws claude_usage_tokens_invalid for %s', (_name, counts) => {
    expect(() => usageCostMicros({ model: 'claude-sonnet-5-5', ...counts })).toThrow(
      'claude_usage_tokens_invalid',
    );
    expect(() => usageCostMicros({ model: 'phala/glm-5.3', ...counts })).toThrow(
      'claude_usage_tokens_invalid',
    );
  });

  it('accepts zero counts and the largest safe integer', () => {
    expect(
      usageCostMicros({ model: 'claude-haiku-5-5', promptTokens: 0, completionTokens: 0 }),
    ).toBe(0);
    expect(
      usageCostMicros({
        model: 'claude-haiku-5-5',
        promptTokens: Number.MAX_SAFE_INTEGER,
        completionTokens: 0,
      }),
    ).toBeGreaterThan(0);
  });
});
