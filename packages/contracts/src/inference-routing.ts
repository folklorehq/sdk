// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  inferenceProviderIdSchema,
  type InferenceModelCatalogEntry,
  type InferencePurposeClass,
  type InferenceProviderId,
  type InferenceTrustClass,
} from './inference-catalog.js';

export const INFERENCE_PURPOSES = [
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
  'wiki_delta',
  'wiki_section_add',
  'wiki_section_long',
  'wiki_outline_long',
  'wiki_page_check',
  'wiki_page_revise',
  'wiki_article_check',
  'wiki_article_long',
  'team_onboarding_long',
] as const;
export type InferencePurpose = (typeof INFERENCE_PURPOSES)[number];
export const inferencePurposeSchema = z.enum(INFERENCE_PURPOSES);

export const inferenceEffortSchema = z.enum(['low', 'medium', 'high']);
export type InferenceEffort = z.infer<typeof inferenceEffortSchema>;
export const inferenceArmSchema = z.enum(['D', 'R', 'B']);
export type InferenceArmId = z.infer<typeof inferenceArmSchema>;
export const inferenceUsageOutcomeSchema = z.enum(['ok', 'discarded', 'shadow']);
export type InferenceUsageOutcome = z.infer<typeof inferenceUsageOutcomeSchema>;

export const INFERENCE_DEFERRAL_REASONS = ['provider_outage', 'provider_slow'] as const;
export type InferenceDeferralReason = (typeof INFERENCE_DEFERRAL_REASONS)[number];

export type RoutedProviderId = Exclude<InferenceProviderId, 'phala'>;

export const INFERENCE_PURPOSE_CLASS: Readonly<Record<InferencePurpose, InferencePurposeClass>> = {
  answer: 'interactive',
  wiki_visual_warrant: 'small',
  citation_check: 'small',
  theme_merge: 'small',
  wiki_relevance: 'small',
  wiki_recovery: 'small',
  wiki_repair: 'small',
  theme_tagging: 'small',
  theme_topic_naming: 'small',
  theme_aggregate_naming: 'small',
  theme_doctype: 'small',
  association_judge: 'small',
  wiki_outline: 'medium',
  wiki_section: 'medium',
  wiki_visual_draw: 'medium',
  wiki_review: 'medium',
  wiki_critique: 'medium',
  wiki_delta: 'medium',
  wiki_section_add: 'medium',
  wiki_section_long: 'medium',
  wiki_outline_long: 'medium',
  wiki_page_check: 'medium',
  wiki_article_check: 'medium',
  wiki_revise: 'large',
  wiki_article: 'large',
  team_onboarding: 'large',
  wiki_page_revise: 'large',
  wiki_article_long: 'large',
  team_onboarding_long: 'large',
};

export function inferenceTimeoutMs(
  entry: InferenceModelCatalogEntry,
  purpose: InferencePurpose,
): number | undefined {
  return entry.purposeTimeoutsMs?.[purpose] ?? entry.timeoutsMs[INFERENCE_PURPOSE_CLASS[purpose]];
}

export const INFERENCE_WRITING_PURPOSES: ReadonlySet<InferencePurpose> = new Set([
  'wiki_section',
  'wiki_revise',
  'wiki_article',
  'team_onboarding',
  'wiki_visual_draw',
  'wiki_delta',
  'wiki_section_add',
  'wiki_section_long',
  'wiki_page_revise',
  'wiki_article_long',
  'team_onboarding_long',
]);
export const INFERENCE_CHECK_PURPOSES = [
  'wiki_review',
  'wiki_critique',
  'wiki_page_check',
  'wiki_article_check',
] as const satisfies readonly InferencePurpose[];
export type InferenceCheckPurpose = (typeof INFERENCE_CHECK_PURPOSES)[number];
export const isInferenceCheckPurpose = (
  purpose: InferencePurpose,
): purpose is InferenceCheckPurpose =>
  (INFERENCE_CHECK_PURPOSES as readonly InferencePurpose[]).includes(purpose);

export interface InferenceCheckerRule {
  readonly reads: ReadonlySet<InferencePurpose>;
  readonly alwaysReads?: ReadonlySet<InferencePurpose>;
  readonly fallback?: InferencePurpose;
}

export const INFERENCE_PAGE_TEXT_WRITERS: ReadonlySet<InferencePurpose> = new Set([
  'wiki_section',
  'wiki_section_long',
  'wiki_delta',
  'wiki_section_add',
  'wiki_page_revise',
]);
export const INFERENCE_ARTICLE_TEXT_WRITERS: ReadonlySet<InferencePurpose> = new Set([
  'wiki_article',
  'wiki_article_long',
  'team_onboarding',
  'team_onboarding_long',
  'wiki_section',
  'wiki_section_long',
  'wiki_revise',
  'wiki_recovery',
]);

export const INFERENCE_CHECKER_RULES: Readonly<
  Record<InferenceCheckPurpose, InferenceCheckerRule>
> = {
  wiki_review: { reads: INFERENCE_WRITING_PURPOSES },
  wiki_critique: { reads: new Set([...INFERENCE_WRITING_PURPOSES, 'wiki_recovery']) },
  wiki_page_check: {
    reads: INFERENCE_PAGE_TEXT_WRITERS,
    alwaysReads: new Set<InferencePurpose>(['wiki_section', 'wiki_page_revise']),
    fallback: 'wiki_review',
  },
  wiki_article_check: {
    reads: INFERENCE_ARTICLE_TEXT_WRITERS,
    alwaysReads: new Set<InferencePurpose>(['team_onboarding', 'wiki_article']),
    fallback: 'wiki_critique',
  },
};
export const INFERENCE_LONG_PURPOSES: ReadonlySet<InferencePurpose> = new Set([
  'wiki_section_long',
  'wiki_outline_long',
]);

const CONTRACTUAL: InferenceTrustClass = 'contractual';
export const INFERENCE_PURPOSE_MIN_TRUST: Readonly<Record<InferencePurpose, InferenceTrustClass>> =
  Object.fromEntries(INFERENCE_PURPOSES.map((purpose) => [purpose, CONTRACTUAL])) as Record<
    InferencePurpose,
    InferenceTrustClass
  >;
export const INFERENCE_TENANT_TIERS = ['standard'] as const;
export const INFERENCE_TENANT_TIER_MIN_TRUST: Readonly<
  Record<(typeof INFERENCE_TENANT_TIERS)[number], InferenceTrustClass>
> = { standard: CONTRACTUAL };

export const FOLKLORE_OWN_ORG_ID_SHA256 =
  '810e451ec9c7513f42ad026c53e97bafa4995188f1b8b2bcefb6713461a5df2c';
export const ROUTING_OVERRIDE_ORG_ID_SHA256S: readonly string[] = [FOLKLORE_OWN_ORG_ID_SHA256];
export const ROUTABLE_INFERENCE_PROVIDERS: readonly InferenceProviderId[] = ['anthropic', 'phala'];

export const INFERENCE_ROUTING_TABLE_SCHEMA = 'folklore.inference-routing-table.v1';
export const SIGNED_INFERENCE_ROUTING_TABLE_SCHEMA = 'folklore.signed-inference-routing-table.v1';
export const ROUTING_FALLBACKS_MAX = 2;
export const ROUTING_ORG_OVERRIDES_MAX = 2;
export const ROUTING_TABLE_MAX_BYTES = 7_168;
export const ROUTING_TABLE_MAX_VALIDITY_MS = 172_800_000;
export const ROUTING_ALLOWED_PROCESSING_REGIONS = ['us'] as const;
export const ROUTING_CLOCK_SKEW_MS = 300_000;

export const routeTargetSchema = z
  .object({
    provider: inferenceProviderIdSchema,
    model: z.string().min(1).max(128),
    effort: inferenceEffortSchema,
  })
  .strict();
export const purposeRouteSchema = routeTargetSchema
  .extend({ fallbacks: z.array(routeTargetSchema).max(ROUTING_FALLBACKS_MAX) })
  .strict();
export const routingPurposeMapSchema = z.record(inferencePurposeSchema, purposeRouteSchema);
export const routingOrgOverrideSchema = z
  .object({ orgIdSha256: z.string().regex(/^[0-9a-f]{64}$/), purposes: routingPurposeMapSchema })
  .strict();
export const inferenceRoutingTableBodyV1Schema = z
  .object({
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    issuedAtMs: z.number().int().nonnegative(),
    notAfterMs: z.number().int().positive(),
    purposes: routingPurposeMapSchema,
    orgOverrides: z.array(routingOrgOverrideSchema).max(ROUTING_ORG_OVERRIDES_MAX),
  })
  .strict();
export const inferenceRoutingTableV1Schema = inferenceRoutingTableBodyV1Schema
  .extend({
    schema: z.literal(INFERENCE_ROUTING_TABLE_SCHEMA),
    awsAccountId: z.string().regex(/^\d{12}$/),
    awsRegion: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/),
  })
  .strict();
export const signedInferenceRoutingTableV1Schema = z
  .object({
    schema: z.literal(SIGNED_INFERENCE_ROUTING_TABLE_SCHEMA),
    table: inferenceRoutingTableV1Schema,
    algorithm: z.literal('Ed25519'),
    signerKeyId: z.string().min(1).max(256),
    signerPurpose: z.literal('policy-authority'),
    signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
  })
  .strict();
export type RouteTarget = z.infer<typeof routeTargetSchema>;
export type PurposeRoute = z.infer<typeof purposeRouteSchema>;
export type InferenceRoutingTableBodyV1 = z.infer<typeof inferenceRoutingTableBodyV1Schema>;
export type InferenceRoutingTableV1 = z.infer<typeof inferenceRoutingTableV1Schema>;
export type SignedInferenceRoutingTableV1 = z.infer<typeof signedInferenceRoutingTableV1Schema>;

export const ROUTING_TABLE_REFUSALS = [
  'routing_table_schema_invalid',
  'routing_table_oversize',
  'routing_table_scope_mismatch',
  'routing_table_signature_invalid',
  'routing_table_signer_mismatch',
  'routing_table_version_not_newer',
  'routing_table_expired',
  'routing_table_not_yet_valid',
  'routing_table_validity_too_long',
  'routing_table_model_unknown',
  'routing_table_model_not_routable',
  'routing_table_provider_mismatch',
  'routing_table_provider_disabled',
  'routing_table_effort_unsupported',
  'routing_table_purpose_class_unsupported',
  'routing_table_long_purpose_capped',
  'routing_table_trust_below_floor',
  'routing_table_fallback_trust_downgrade',
  'routing_table_fallback_duplicate',
  'routing_table_checker_shares_writer',
  'routing_table_override_org_not_allowed',
  'routing_table_override_org_duplicate',
  'routing_table_version_ahead_of_clock',
  'routing_table_region_not_allowed',
  'routing_table_fallback_not_allowed',
  'routing_table_phala_role_mismatch',
] as const;
export type RoutingTableRefusal = (typeof ROUTING_TABLE_REFUSALS)[number];
