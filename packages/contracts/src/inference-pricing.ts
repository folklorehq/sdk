// SPDX-License-Identifier: Apache-2.0
import {
  INFERENCE_MODEL_CATALOG,
  isInferenceModelId,
  type InferenceModelCatalogEntry,
  type InferenceTokenPrices,
} from './inference-catalog.js';

const MICROS_PER_MTOK_DIVISOR = 1_000_000n;
const TOKEN_PRICE_CLASSES = ['input', 'output', 'cacheWrite', 'cacheRead'] as const;

export interface PricedUsage {
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

function everyPriceTier(entry: InferenceModelCatalogEntry): readonly InferenceTokenPrices[] {
  return entry.longContext ? [entry.prices, entry.longContext.prices] : [entry.prices];
}

function maxPricesOverCatalog(): InferenceTokenPrices {
  const max = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (const entry of Object.values<InferenceModelCatalogEntry>(INFERENCE_MODEL_CATALOG)) {
    for (const tier of everyPriceTier(entry)) {
      for (const priceClass of TOKEN_PRICE_CLASSES) {
        max[priceClass] = Math.max(max[priceClass], tier[priceClass]);
      }
    }
  }
  return Object.freeze(max);
}

export const UNKNOWN_MODEL_PRICES: InferenceTokenPrices = maxPricesOverCatalog();

export function pricesFor(model: string): InferenceTokenPrices {
  return isInferenceModelId(model) ? INFERENCE_MODEL_CATALOG[model].prices : UNKNOWN_MODEL_PRICES;
}

function assertTokenCounts(usage: PricedUsage): void {
  const counts = [
    usage.promptTokens,
    usage.completionTokens,
    usage.cacheReadTokens ?? 0,
    usage.cacheWriteTokens ?? 0,
  ];
  if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0)) {
    throw new Error('claude_usage_tokens_invalid');
  }
}

export function usageCostMicros(usage: PricedUsage): number {
  assertTokenCounts(usage);
  const price = pricesFor(usage.model);
  const scaledMicros =
    BigInt(usage.promptTokens) * BigInt(price.input) +
    BigInt(usage.completionTokens) * BigInt(price.output) +
    BigInt(usage.cacheReadTokens ?? 0) * BigInt(price.cacheRead) +
    BigInt(usage.cacheWriteTokens ?? 0) * BigInt(price.cacheWrite);
  const wholeMicros = (scaledMicros + MICROS_PER_MTOK_DIVISOR - 1n) / MICROS_PER_MTOK_DIVISOR;
  return Number(wholeMicros);
}
