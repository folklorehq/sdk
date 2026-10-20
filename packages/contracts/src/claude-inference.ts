// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  INFERENCE_DEFERRAL_REASONS,
  INFERENCE_PURPOSES,
  inferenceArmSchema,
  inferenceEffortSchema,
  inferencePurposeSchema,
  type InferenceArmId,
  type InferenceDeferralReason,
  type InferenceEffort,
  type InferencePurpose,
} from './inference-routing.js';

export const CLAUDE_ROUTE_MODEL_IDS = [
  'claude-haiku-5-5',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
] as const;
export type ClaudeModelId = (typeof CLAUDE_ROUTE_MODEL_IDS)[number];

/** Temporary alias of INFERENCE_PURPOSES until the apps and packages move to the provider-neutral names. */
export const CLAUDE_INFERENCE_PURPOSES = INFERENCE_PURPOSES;
/** Temporary alias of InferencePurpose. */
export type ClaudeInferencePurpose = InferencePurpose;
/** Temporary alias of inferencePurposeSchema. */
export const claudeInferencePurposeSchema = inferencePurposeSchema;
/** Temporary alias of inferenceEffortSchema. */
export const claudeEffortSchema = inferenceEffortSchema;
/** Temporary alias of InferenceEffort. */
export type ClaudeEffort = InferenceEffort;
/** Temporary alias of inferenceArmSchema. */
export const claudeArmSchema = inferenceArmSchema;
/** Temporary alias of InferenceArmId. */
export type ClaudeArmId = InferenceArmId;
/** Temporary alias of INFERENCE_DEFERRAL_REASONS. */
export const CLAUDE_DEFERRAL_REASONS = INFERENCE_DEFERRAL_REASONS;
/** Temporary alias of InferenceDeferralReason. */
export type ClaudeDeferralReason = InferenceDeferralReason;

// visible facts are a subset of the candidate cap, so every visible id fits
export const SHADOW_FACT_IDS_MAX = 400;

const MAX_BASIS_POINTS = 10_000;
const basisPointsSchema = z.number().int().min(0).max(MAX_BASIS_POINTS);

// A new value needs a two-phase rollout: the worker accepts it before the enclave emits it.
export const REBUILD_REASONS = [
  'no_state',
  'state_unreadable',
  'fact_removed',
  'periodic_count',
  'periodic_age',
  'new_fact_fraction',
  'low_cosine_fraction',
  'coverage_miss',
  'audience_changed',
] as const;
export type RebuildReason = (typeof REBUILD_REASONS)[number];
const claudeRebuildReasonSchema = z.enum([
  ...REBUILD_REASONS,
  'incremental',
  'delta',
  'section_add',
]);

export const claudeQualityScoresSchema = z
  .object({
    arm: inferenceArmSchema,
    audienceId: z.string().uuid().nullable(),
    citationSupportBp: basisPointsSchema,
    uncitedCutBp: basisPointsSchema,
    importantCoverageBp: basisPointsSchema,
    revisionRateBp: basisPointsSchema,
    reviewFlagRateBp: basisPointsSchema,
    reused: z.boolean().optional(),
    rebuildReason: claudeRebuildReasonSchema.optional(),
  })
  .strict();
export type ClaudeQualityScores = z.infer<typeof claudeQualityScoresSchema>;
