// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { CLAUDE_ROUTE_MODEL_IDS } from '../src/claude-inference.js';
import {
  INFERENCE_MODEL_CATALOG,
  INFERENCE_MODEL_IDS,
  INFERENCE_PROVIDER_IDS,
  INFERENCE_TRUST_CLASSES,
  PHALA_POLICY_CHECK_MODEL_ID,
  PHALA_POLICY_GENERATE_MODEL_ID,
  inferenceProviderIdSchema,
  inferenceTrustClassSchema,
  isInferenceModelId,
  trustRank,
  type InferenceModelCatalogEntry,
} from '../src/inference-catalog.js';
import {
  INFERENCE_PURPOSE_CLASS,
  inferenceTimeoutMs,
  type InferencePurpose,
} from '../src/inference-routing.js';

const PHALA_MODEL_IDS = [
  'moonshotai/kimi-k3',
  'moonshotai/kimi-k2.6',
  'z-ai/glm-5.3',
  'z-ai/glm-5.2',
  'z-ai/glm-5.1',
  'qwen/qwen3-32b',
  'qwen/qwen3-embedding-8b',
] as const;

const POLICY_PSEUDO_IDS = [PHALA_POLICY_GENERATE_MODEL_ID, PHALA_POLICY_CHECK_MODEL_ID] as const;

const PER_PAIR_CLAUDE_TIMEOUT_MS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  wiki_outline: {
    'claude-haiku-5-5': 180_000,
    'claude-sonnet-5-5': 180_000,
    'claude-opus-5-5': 300_000,
  },
  wiki_section: {
    'claude-haiku-5-5': 180_000,
    'claude-sonnet-5-5': 180_000,
    'claude-opus-5-5': 300_000,
  },
  wiki_revise: { 'claude-sonnet-5-5': 420_000, 'claude-opus-5-5': 480_000 },
  wiki_visual_warrant: { 'claude-sonnet-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  wiki_visual_draw: { 'claude-sonnet-5-5': 180_000, 'claude-opus-5-5': 300_000 },
  wiki_article: {
    'claude-haiku-5-5': 420_000,
    'claude-sonnet-5-5': 420_000,
    'claude-opus-5-5': 480_000,
  },
  team_onboarding: {
    'claude-haiku-5-5': 420_000,
    'claude-sonnet-5-5': 420_000,
    'claude-opus-5-5': 480_000,
  },
  wiki_review: { 'claude-sonnet-5-5': 420_000, 'claude-opus-5-5': 300_000 },
  wiki_critique: { 'claude-sonnet-5-5': 420_000, 'claude-opus-5-5': 300_000 },
  citation_check: { 'claude-sonnet-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  theme_merge: { 'claude-sonnet-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  wiki_relevance: { 'claude-haiku-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  wiki_recovery: { 'claude-haiku-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  wiki_repair: { 'claude-haiku-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  theme_tagging: { 'claude-haiku-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  theme_topic_naming: { 'claude-sonnet-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  theme_aggregate_naming: { 'claude-sonnet-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  theme_doctype: { 'claude-haiku-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  association_judge: { 'claude-sonnet-5-5': 60_000, 'claude-opus-5-5': 120_000 },
  answer: { 'claude-sonnet-5-5': 40_000, 'claude-opus-5-5': 40_000 },
  wiki_delta: {
    'claude-haiku-5-5': 180_000,
    'claude-sonnet-5-5': 180_000,
    'claude-opus-5-5': 300_000,
  },
  wiki_section_add: {
    'claude-haiku-5-5': 180_000,
    'claude-sonnet-5-5': 180_000,
    'claude-opus-5-5': 300_000,
  },
  wiki_section_long: { 'claude-sonnet-5-5': 180_000, 'claude-opus-5-5': 300_000 },
  wiki_outline_long: { 'claude-sonnet-5-5': 180_000, 'claude-opus-5-5': 300_000 },
  wiki_page_check: { 'claude-sonnet-5-5': 420_000, 'claude-opus-5-5': 300_000 },
  wiki_page_revise: {
    'claude-haiku-5-5': 420_000,
    'claude-sonnet-5-5': 420_000,
    'claude-opus-5-5': 480_000,
  },
  wiki_article_check: { 'claude-sonnet-5-5': 420_000, 'claude-opus-5-5': 300_000 },
  wiki_article_long: { 'claude-sonnet-5-5': 420_000, 'claude-opus-5-5': 480_000 },
  team_onboarding_long: { 'claude-sonnet-5-5': 420_000, 'claude-opus-5-5': 480_000 },
};

const PRICE_CLASSES = ['input', 'output', 'cacheWrite', 'cacheRead'] as const;

describe('INFERENCE_MODEL_CATALOG', () => {
  it('lists every Phala verified model with provider phala', () => {
    for (const id of PHALA_MODEL_IDS) {
      expect(isInferenceModelId(id), id).toBe(true);
      expect(INFERENCE_MODEL_CATALOG[id].provider).toBe('phala');
    }
  });

  it('lists every Claude route model with provider anthropic', () => {
    for (const id of CLAUDE_ROUTE_MODEL_IDS) {
      expect(INFERENCE_MODEL_CATALOG[id].provider).toBe('anthropic');
    }
  });

  it('has exactly the Claude and Phala models and no others', () => {
    expect([...INFERENCE_MODEL_IDS].sort()).toEqual(
      [...CLAUDE_ROUTE_MODEL_IDS, ...PHALA_MODEL_IDS, ...POLICY_PSEUDO_IDS].sort(),
    );
  });

  it('keeps every provider id in the provider enum', () => {
    for (const entry of Object.values(INFERENCE_MODEL_CATALOG)) {
      expect(inferenceProviderIdSchema.safeParse(entry.provider).success).toBe(true);
    }
    expect(INFERENCE_PROVIDER_IDS).toEqual(['anthropic', 'phala']);
  });

  it('prices every class as a non-negative safe integer and keeps thresholds inside the window', () => {
    for (const [id, entry] of Object.entries(INFERENCE_MODEL_CATALOG)) {
      const tiers = [entry.prices, ...(entry.longContext ? [entry.longContext.prices] : [])];
      for (const prices of tiers) {
        for (const priceClass of PRICE_CLASSES) {
          const price = prices[priceClass];
          expect(Number.isSafeInteger(price) && price >= 0, `${id} ${priceClass}`).toBe(true);
        }
      }
      if (entry.longContext) {
        expect(entry.longContext.thresholdTokens).toBeLessThan(entry.contextWindowTokens);
      }
    }
  });

  it('carries the Claude US prices with the inference_geo uplift', () => {
    expect(INFERENCE_MODEL_CATALOG['claude-opus-5-5'].prices).toEqual({
      input: 4_400_000,
      output: 22_000_000,
      cacheWrite: 5_500_000,
      cacheRead: 220_000,
    });
    expect(INFERENCE_MODEL_CATALOG['claude-sonnet-5-5'].prices).toEqual({
      input: 2_200_000,
      output: 11_000_000,
      cacheWrite: 2_750_000,
      cacheRead: 110_000,
    });
    expect(INFERENCE_MODEL_CATALOG['claude-haiku-5-5'].prices).toEqual({
      input: 110_000,
      output: 550_000,
      cacheWrite: 137_500,
      cacheRead: 11_000,
    });
    expect(INFERENCE_MODEL_CATALOG['claude-haiku-5-5'].longContext).toEqual({
      thresholdTokens: 100_000,
      prices: { input: 550_000, output: 2_750_000, cacheWrite: 687_500, cacheRead: 55_000 },
    });
    expect(INFERENCE_MODEL_CATALOG['claude-opus-5-5'].longContext).toBeNull();
    expect(INFERENCE_MODEL_CATALOG['claude-sonnet-5-5'].longContext).toBeNull();
  });

  it('prices Phala rows from the gateway list, with cache write equal to input', () => {
    expect(INFERENCE_MODEL_CATALOG['z-ai/glm-5.2'].prices).toEqual({
      input: 1_260_000,
      output: 3_000_000,
      cacheWrite: 1_260_000,
      cacheRead: 220_000,
    });
    expect(INFERENCE_MODEL_CATALOG['qwen/qwen3-embedding-8b'].prices).toEqual({
      input: 10_000,
      output: 0,
      cacheWrite: 10_000,
      cacheRead: 10_000,
    });
    for (const id of PHALA_MODEL_IDS) {
      const { prices } = INFERENCE_MODEL_CATALOG[id];
      expect(prices.cacheWrite, id).toBe(prices.input);
    }
  });

  it('answers isInferenceModelId by own property only', () => {
    for (const probe of ['toString', '__proto__', 'constructor', 'unknown', 'phala/glm-5.3']) {
      expect(isInferenceModelId(probe), probe).toBe(false);
    }
  });

  it('orders the trust classes ascending and ranks them by position', () => {
    expect(INFERENCE_TRUST_CLASSES).toEqual([
      'contractual',
      'contractual_zdr',
      'attested_delegated',
      'attested',
    ]);
    expect(INFERENCE_TRUST_CLASSES.map(trustRank)).toEqual([0, 1, 2, 3]);
    expect(inferenceTrustClassSchema.safeParse('attested_delegated').success).toBe(true);
    expect(inferenceTrustClassSchema.safeParse('tee').success).toBe(false);
  });

  it('classifies Claude rows contractual and US, Phala rows attested_delegated and unverified', () => {
    for (const id of CLAUDE_ROUTE_MODEL_IDS) {
      const entry: InferenceModelCatalogEntry = INFERENCE_MODEL_CATALOG[id];
      expect(entry.trustClass, id).toBe('contractual');
      expect(entry.processingRegion, id).toBe('us');
      expect(entry.weights, id).toBe(`anthropic/${id}`);
      expect(entry.routable, id).toBe(true);
    }
    for (const id of [...PHALA_MODEL_IDS, ...POLICY_PSEUDO_IDS]) {
      const entry: InferenceModelCatalogEntry = INFERENCE_MODEL_CATALOG[id];
      expect(entry.trustClass, id).toBe('attested_delegated');
      expect(entry.processingRegion, id).toBe('unverified');
    }
    for (const entry of Object.values<InferenceModelCatalogEntry>(INFERENCE_MODEL_CATALOG)) {
      expect(entry.trustClass).not.toBe('attested');
    }
  });

  it('gives each Phala wire row its wire id as weights and each pseudo-id its own role', () => {
    for (const id of PHALA_MODEL_IDS) {
      expect(INFERENCE_MODEL_CATALOG[id].weights, id).toBe(id);
      expect(INFERENCE_MODEL_CATALOG[id].routable, id).toBe(false);
    }
    expect(INFERENCE_MODEL_CATALOG[PHALA_POLICY_GENERATE_MODEL_ID].weights).toBe(
      'phala-role:generate',
    );
    expect(INFERENCE_MODEL_CATALOG[PHALA_POLICY_CHECK_MODEL_ID].weights).toBe('phala-role:check');
    for (const id of POLICY_PSEUDO_IDS) {
      expect(INFERENCE_MODEL_CATALOG[id].provider).toBe('phala');
      expect(INFERENCE_MODEL_CATALOG[id].wireModel).toBe('');
      expect(INFERENCE_MODEL_CATALOG[id].prices).toEqual(
        INFERENCE_MODEL_CATALOG['moonshotai/kimi-k3'].prices,
      );
      expect(INFERENCE_MODEL_CATALOG[id].timeoutsMs).toEqual(
        INFERENCE_MODEL_CATALOG['claude-opus-5-5'].timeoutsMs,
      );
    }
  });

  it('reproduces every Claude per-pair timeout from the class timeout or an explicit override', () => {
    for (const [purpose, byModel] of Object.entries(PER_PAIR_CLAUDE_TIMEOUT_MS)) {
      for (const [model, timeoutMs] of Object.entries(byModel)) {
        const entry: InferenceModelCatalogEntry =
          INFERENCE_MODEL_CATALOG[model as (typeof CLAUDE_ROUTE_MODEL_IDS)[number]];
        expect(inferenceTimeoutMs(entry, purpose as InferencePurpose), `${purpose} ${model}`).toBe(
          timeoutMs,
        );
      }
    }
  });

  it('keeps every override a timed pair that its class row would not already give', () => {
    for (const model of CLAUDE_ROUTE_MODEL_IDS) {
      const entry: InferenceModelCatalogEntry = INFERENCE_MODEL_CATALOG[model];
      for (const [purpose, timeoutMs] of Object.entries(entry.purposeTimeoutsMs ?? {})) {
        const classMs = entry.timeoutsMs[INFERENCE_PURPOSE_CLASS[purpose as InferencePurpose]];
        expect(PER_PAIR_CLAUDE_TIMEOUT_MS[purpose]?.[model], `${purpose} ${model}`).toBe(timeoutMs);
        expect(classMs, `${purpose} ${model}`).not.toBe(timeoutMs);
      }
    }
  });

  it('keeps Haiku off the large and interactive class rows', () => {
    const haiku: InferenceModelCatalogEntry = INFERENCE_MODEL_CATALOG['claude-haiku-5-5'];
    expect(Object.keys(haiku.timeoutsMs).sort()).toEqual(['medium', 'small']);
  });

  it('gives no non-Anthropic row an anthropic wire id', () => {
    for (const entry of Object.values<InferenceModelCatalogEntry>(INFERENCE_MODEL_CATALOG)) {
      if (entry.provider !== 'anthropic') {
        expect(entry.wireModel.startsWith('anthropic/')).toBe(false);
      }
    }
  });

  it('gives every routable row at least one effort and one purpose class', () => {
    for (const [id, entry] of Object.entries<InferenceModelCatalogEntry>(INFERENCE_MODEL_CATALOG)) {
      if (!entry.routable) continue;
      expect(Object.keys(entry.efforts).length, id).toBeGreaterThan(0);
      expect(Object.keys(entry.timeoutsMs).length, id).toBeGreaterThan(0);
    }
  });

  it('freezes the catalog, every row and the id list', () => {
    const frozen = (value: unknown): boolean =>
      typeof value !== 'object' ||
      value === null ||
      (Object.isFrozen(value) && Object.values(value).every(frozen));
    expect(frozen(INFERENCE_MODEL_CATALOG)).toBe(true);
    expect(Object.isFrozen(INFERENCE_MODEL_IDS)).toBe(true);
    const row = INFERENCE_MODEL_CATALOG['claude-opus-5-5'] as { trustClass: string };
    expect(() => {
      row.trustClass = 'attested';
    }).toThrow(TypeError);
  });
});
