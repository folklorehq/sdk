// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const CLAUDE_INFERENCE_PURPOSES = [
  'wiki_outline',
  'wiki_section',
  'wiki_revise',
  'wiki_visual_warrant',
  'wiki_visual_draw',
  'wiki_article',
  'team_onboarding',
  'wiki_review',
  'wiki_critique',
  'citation_check',
  'theme_merge',
  'wiki_relevance',
  'wiki_recovery',
  'wiki_repair',
  'theme_tagging',
  'theme_topic_naming',
  'theme_aggregate_naming',
  'theme_doctype',
  'association_judge',
  'answer',
] as const;
export type ClaudeInferencePurpose = (typeof CLAUDE_INFERENCE_PURPOSES)[number];
export const claudeInferencePurposeSchema = z.enum(CLAUDE_INFERENCE_PURPOSES);

export const CLAUDE_ZDR_MODEL_IDS = [
  'claude-haiku-5-5',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
] as const;
export type ClaudeModelId = (typeof CLAUDE_ZDR_MODEL_IDS)[number];

export const claudeEffortSchema = z.enum(['low', 'medium', 'high']);
export type ClaudeEffort = z.infer<typeof claudeEffortSchema>;
export const claudeArmSchema = z.enum(['D', 'R', 'B']);
export type ClaudeArmId = z.infer<typeof claudeArmSchema>;
export const inferenceUsageOutcomeSchema = z.enum(['ok', 'discarded', 'shadow']);
export type InferenceUsageOutcome = z.infer<typeof inferenceUsageOutcomeSchema>;

export const CLAUDE_DEFERRAL_REASONS = ['provider_outage', 'provider_slow'] as const;
export type ClaudeDeferralReason = (typeof CLAUDE_DEFERRAL_REASONS)[number];

// visible facts are a subset of the candidate cap, so every visible id fits
export const SHADOW_FACT_IDS_MAX = 400;

const MAX_BASIS_POINTS = 10_000;
const basisPointsSchema = z.number().int().min(0).max(MAX_BASIS_POINTS);

export const claudeQualityScoresSchema = z
  .object({
    arm: claudeArmSchema,
    audienceId: z.string().uuid().nullable(),
    citationSupportBp: basisPointsSchema,
    uncitedCutBp: basisPointsSchema,
    importantCoverageBp: basisPointsSchema,
    revisionRateBp: basisPointsSchema,
    reviewFlagRateBp: basisPointsSchema,
    reused: z.boolean().optional(),
  })
  .strict();
export type ClaudeQualityScores = z.infer<typeof claudeQualityScoresSchema>;

const MICROS_PER_MTOK_DIVISOR = 1_000_000n;

// US prices in micros per MTok; promptTokens are uncached input
export const CLAUDE_PRICE_MICROS_PER_MTOK = {
  'claude-opus-5-5': {
    input: 4_400_000,
    output: 22_000_000,
    cacheWrite: 5_500_000,
    cacheRead: 220_000,
  },
  'claude-sonnet-5-5': {
    input: 2_200_000,
    output: 11_000_000,
    cacheWrite: 2_750_000,
    cacheRead: 220_000,
  },
  'claude-haiku-5-5': { input: 110_000, output: 550_000, cacheWrite: 137_500, cacheRead: 11_000 },
} as const satisfies Record<
  ClaudeModelId,
  Record<'input' | 'output' | 'cacheWrite' | 'cacheRead', number>
>;

export interface PricedUsage {
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
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
  if (!Object.hasOwn(CLAUDE_PRICE_MICROS_PER_MTOK, usage.model)) return 0;
  const price = CLAUDE_PRICE_MICROS_PER_MTOK[usage.model as ClaudeModelId];
  const scaledMicros =
    BigInt(usage.promptTokens) * BigInt(price.input) +
    BigInt(usage.completionTokens) * BigInt(price.output) +
    BigInt(usage.cacheReadTokens ?? 0) * BigInt(price.cacheRead) +
    BigInt(usage.cacheWriteTokens ?? 0) * BigInt(price.cacheWrite);
  const wholeMicros = (scaledMicros + MICROS_PER_MTOK_DIVISOR - 1n) / MICROS_PER_MTOK_DIVISOR;
  return Number(wholeMicros);
}
