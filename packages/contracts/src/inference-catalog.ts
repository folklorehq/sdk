// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { deepFreeze } from '@folklore/utils/deep-freeze';
import type { InferenceEffort, InferencePurpose } from './inference-routing.js';

export const INFERENCE_PROVIDER_IDS = ['anthropic', 'phala', 'openai'] as const;
export type InferenceProviderId = (typeof INFERENCE_PROVIDER_IDS)[number];
export const inferenceProviderIdSchema = z.enum(INFERENCE_PROVIDER_IDS);

/** Micros per million tokens; `input` is uncached input. */
export interface InferenceTokenPrices {
  readonly input: number;
  readonly output: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
}

export interface InferenceLongContextTier {
  readonly thresholdTokens: number;
  readonly prices: InferenceTokenPrices;
}

export const INFERENCE_TRUST_CLASSES = [
  'contractual',
  'contractual_zdr',
  'attested_delegated',
  'attested',
] as const;
export type InferenceTrustClass = (typeof INFERENCE_TRUST_CLASSES)[number];
export const inferenceTrustClassSchema = z.enum(INFERENCE_TRUST_CLASSES);

export function trustRank(trust: InferenceTrustClass): number {
  return INFERENCE_TRUST_CLASSES.indexOf(trust);
}

export const INFERENCE_PURPOSE_CLASSES = ['interactive', 'small', 'medium', 'large'] as const;
export type InferencePurposeClass = (typeof INFERENCE_PURPOSE_CLASSES)[number];

export type StructuredOutputMode =
  | 'anthropic_json_schema'
  | 'openai_json_schema'
  | 'forced_tool_call';
export type PromptCachingMode = 'anthropic_cache_control' | 'automatic_prefix' | 'none';
export type InferenceProcessingRegion = 'us' | 'unverified';

export interface InferenceModelCatalogEntry {
  readonly provider: InferenceProviderId;
  readonly wireModel: string;
  readonly contextWindowTokens: number;
  readonly prices: InferenceTokenPrices;
  readonly longContext: InferenceLongContextTier | null;
  readonly longPurposeCapped: boolean;
  readonly trustClass: InferenceTrustClass;
  readonly routable: boolean;
  readonly structuredOutput: StructuredOutputMode;
  readonly caching: PromptCachingMode;
  readonly efforts: Readonly<Partial<Record<InferenceEffort, string>>>;
  readonly timeoutsMs: Readonly<Partial<Record<InferencePurposeClass, number>>>;
  readonly purposeTimeoutsMs?: Readonly<Partial<Record<InferencePurpose, number>>>;
  readonly weights: string;
  readonly processingRegion: InferenceProcessingRegion;
}

export const PHALA_POLICY_GENERATE_MODEL_ID = 'phala/policy-generate';
export const PHALA_POLICY_CHECK_MODEL_ID = 'phala/policy-check';
export const PHALA_POLICY_PSEUDO_MODEL_IDS = [
  PHALA_POLICY_GENERATE_MODEL_ID,
  PHALA_POLICY_CHECK_MODEL_ID,
] as const;

const CLAUDE_ROW = {
  provider: 'anthropic',
  trustClass: 'contractual',
  routable: true,
  structuredOutput: 'anthropic_json_schema',
  caching: 'anthropic_cache_control',
  efforts: { low: 'low', medium: 'medium', high: 'high' },
  processingRegion: 'us',
  longPurposeCapped: false,
} as const;

const PHALA_ROW = {
  provider: 'phala',
  trustClass: 'attested_delegated',
  routable: false,
  structuredOutput: 'forced_tool_call',
  caching: 'none',
  efforts: {},
  timeoutsMs: {},
  processingRegion: 'unverified',
  longPurposeCapped: false,
} as const;

const OPENAI_ROW = {
  ...PHALA_ROW,
  provider: 'openai',
  trustClass: 'contractual',
  routable: false,
  processingRegion: 'unverified',
  caching: 'none',
} as const;

const OPUS_TIMEOUTS_MS = { interactive: 40_000, small: 120_000, medium: 300_000, large: 480_000 };
const KIMI_K3_PRICES = {
  input: 3_000_000,
  output: 15_000_000,
  cacheWrite: 3_000_000,
  cacheRead: 300_000,
};

const PHALA_POLICY_ROW = {
  ...PHALA_ROW,
  wireModel: '',
  contextWindowTokens: 1_048_576,
  prices: KIMI_K3_PRICES,
  longContext: null,
  routable: true,
  efforts: { low: 'policy', medium: 'policy', high: 'policy' },
  timeoutsMs: OPUS_TIMEOUTS_MS,
} as const;

// Phala bills no cache write, so cacheWrite equals input on its rows.
const CATALOG_ROWS = {
  'claude-opus-5-5': {
    ...CLAUDE_ROW,
    weights: 'anthropic/claude-opus-5-5',
    timeoutsMs: { interactive: 40_000, small: 120_000, medium: 300_000, large: 480_000 },
    wireModel: 'claude-opus-5-5',
    contextWindowTokens: 1_000_000,
    prices: { input: 4_400_000, output: 22_000_000, cacheWrite: 5_500_000, cacheRead: 220_000 },
    longContext: null,
  },
  'claude-sonnet-5-5': {
    ...CLAUDE_ROW,
    weights: 'anthropic/claude-sonnet-5-5',
    timeoutsMs: { interactive: 40_000, small: 60_000, medium: 180_000, large: 420_000 },
    purposeTimeoutsMs: {
      wiki_review: 420_000,
      wiki_critique: 420_000,
      wiki_page_check: 420_000,
      wiki_article_check: 420_000,
    },
    wireModel: 'claude-sonnet-5-5',
    contextWindowTokens: 1_000_000,
    prices: { input: 2_200_000, output: 11_000_000, cacheWrite: 2_750_000, cacheRead: 110_000 },
    longContext: null,
  },
  'claude-haiku-5-5': {
    ...CLAUDE_ROW,
    weights: 'anthropic/claude-haiku-5-5',
    timeoutsMs: { small: 60_000, medium: 180_000 },
    purposeTimeoutsMs: {
      wiki_article: 420_000,
      team_onboarding: 420_000,
      wiki_page_revise: 420_000,
    },
    wireModel: 'claude-haiku-5-5',
    contextWindowTokens: 1_000_000,
    prices: { input: 110_000, output: 550_000, cacheWrite: 137_500, cacheRead: 11_000 },
    longPurposeCapped: true,
    // Feeds only the UNKNOWN_MODEL_PRICES maximum; known models meter at base prices.
    longContext: {
      thresholdTokens: 100_000,
      prices: { input: 550_000, output: 2_750_000, cacheWrite: 687_500, cacheRead: 55_000 },
    },
  },
  'moonshotai/kimi-k3': {
    ...PHALA_ROW,
    weights: 'moonshotai/kimi-k3',
    wireModel: 'moonshotai/kimi-k3',
    contextWindowTokens: 1_048_576,
    prices: KIMI_K3_PRICES,
    longContext: null,
  },
  'moonshotai/kimi-k2.6': {
    ...PHALA_ROW,
    weights: 'moonshotai/kimi-k2.6',
    wireModel: 'moonshotai/kimi-k2.6',
    contextWindowTokens: 262_144,
    prices: { input: 1_090_000, output: 4_600_000, cacheWrite: 1_090_000, cacheRead: 370_000 },
    longContext: null,
  },
  'z-ai/glm-5.3': {
    ...PHALA_ROW,
    weights: 'z-ai/glm-5.3',
    wireModel: 'z-ai/glm-5.3',
    contextWindowTokens: 1_048_576,
    prices: { input: 1_400_000, output: 4_400_000, cacheWrite: 1_400_000, cacheRead: 260_000 },
    longContext: null,
  },
  'z-ai/glm-5.2': {
    ...PHALA_ROW,
    weights: 'z-ai/glm-5.2',
    wireModel: 'z-ai/glm-5.2',
    contextWindowTokens: 1_048_576,
    prices: { input: 1_260_000, output: 3_000_000, cacheWrite: 1_260_000, cacheRead: 220_000 },
    longContext: null,
  },
  'z-ai/glm-5.1': {
    ...PHALA_ROW,
    weights: 'z-ai/glm-5.1',
    wireModel: 'z-ai/glm-5.1',
    contextWindowTokens: 202_752,
    prices: { input: 1_210_000, output: 4_200_000, cacheWrite: 1_210_000, cacheRead: 600_000 },
    longContext: null,
  },
  'qwen/qwen3-32b': {
    ...PHALA_ROW,
    weights: 'qwen/qwen3-32b',
    wireModel: 'qwen/qwen3-32b',
    contextWindowTokens: 40_960,
    prices: { input: 120_000, output: 500_000, cacheWrite: 120_000, cacheRead: 52_000 },
    longContext: null,
  },
  'qwen/qwen3-embedding-8b': {
    ...PHALA_ROW,
    weights: 'qwen/qwen3-embedding-8b',
    wireModel: 'qwen/qwen3-embedding-8b',
    contextWindowTokens: 32_768,
    prices: { input: 10_000, output: 0, cacheWrite: 10_000, cacheRead: 10_000 },
    longContext: null,
  },
  'text-embedding-3-large': {
    ...OPENAI_ROW,
    weights: 'openai/text-embedding-3-large',
    wireModel: 'text-embedding-3-large',
    contextWindowTokens: 8_192,
    prices: { input: 130_000, output: 0, cacheWrite: 130_000, cacheRead: 130_000 },
    longContext: null,
  },
  [PHALA_POLICY_GENERATE_MODEL_ID]: { ...PHALA_POLICY_ROW, weights: 'phala-role:generate' },
  [PHALA_POLICY_CHECK_MODEL_ID]: { ...PHALA_POLICY_ROW, weights: 'phala-role:check' },
} as const satisfies Readonly<Record<string, InferenceModelCatalogEntry>>;

export const INFERENCE_MODEL_CATALOG = deepFreeze(CATALOG_ROWS);

export type InferenceModelId = keyof typeof INFERENCE_MODEL_CATALOG;
export const INFERENCE_MODEL_IDS: readonly InferenceModelId[] = Object.freeze(
  Object.keys(INFERENCE_MODEL_CATALOG) as InferenceModelId[],
);

export function isInferenceModelId(model: string): model is InferenceModelId {
  return Object.hasOwn(INFERENCE_MODEL_CATALOG, model);
}
