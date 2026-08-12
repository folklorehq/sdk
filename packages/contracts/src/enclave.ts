// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { factMetricSchema } from './metrics.js';
import { sealedContentEnvelopeV1Schema } from './sealed-content.js';
import { richBlockKindSchema } from './wiki.js';

export {
  sealedContentEnvelopeV1Schema,
  sealedEnvelopeHeader,
  type SealedContentEnvelopeV1,
} from './sealed-content.js';

const WIKI_CONTENT_FORMAT = 'esdk-v1';

export const factKindSchema = z.enum(['content', 'transition']);
export type FactKind = z.infer<typeof factKindSchema>;

// Our own literals, never customer text — the label lookup they key is shared, not per-tenant.
export const containerLabelSchema = z.enum([
  'calendar_event',
  'code_repo',
  'confluence_page',
  'email_thread',
  'github_pr',
  'github_repo',
  'google_doc',
  'intercom_conversation',
  'jira_issue',
  'linear_issue',
  'meeting_transcript',
  'microsoft365_doc',
  'notion_page',
  'slack_channel',
  'slack_thread',
  'unknown',
]);
export type ContainerLabel = z.infer<typeof containerLabelSchema>;

export const containerSeedSchema = z
  .object({
    sourceContainerId: z.string(),
    // Degrades rather than failing the parse: the worker acks and discards a rejected ProcessedFact,
    // so a narrowing enum would lose facts whenever a connector ships ahead of the worker.
    label: containerLabelSchema.catch('unknown'),
    shape: z.string(),
  })
  .strict();
export type ContainerSeed = z.infer<typeof containerSeedSchema>;

export const hnswNeighborSchema = z
  .object({
    factId: z.string(),
    similarity: z.number(),
  })
  .strict();
export type HnswNeighbor = z.infer<typeof hnswNeighborSchema>;

// content-free sensitivity label. A bare enum only: never carries a reason, snippet,
// or matched keyword, so it does not smuggle content across the trust boundary.
export const sensitivityLevelSchema = z.enum([
  'public',
  'team_scoped',
  'restricted',
  'confidential',
]);
export type SensitivityLevel = z.infer<typeof sensitivityLevelSchema>;

// The outbound destination kinds. Lives here so both the enclave↔worker `export-due`
// signal and the `WikiExportTarget` port share one definition instead of an inline re-declaration.
export const wikiExportTargetKindSchema = z.enum(['notion', 'clickup']);
export type WikiExportTargetKind = z.infer<typeof wikiExportTargetKindSchema>;

export const processedFactSchema = z
  .object({
    factId: z.string(),
    orgId: z.string(),
    sourceKind: z.string(),
    sourceFactId: z.string(),
    occurredAt: z.string(),
    bodyS3Key: z.string(),
    bodyHash: z.string(),
    kind: factKindSchema,
    containerRefs: z.array(z.string()),
    explicitLinks: z.array(z.string()),
    sourceThreadId: z.string().optional(),
    extractedEntities: z.array(z.string()),
    containerSeeds: z.array(containerSeedSchema),
    hnswNeighbors: z.array(hnswNeighborSchema),
    // Fail-closed: an older enclave that omits the label lands on team_scoped, never public.
    sensitivityLevel: sensitivityLevelSchema.default('team_scoped'),
    // Content-free numeric upstream signals — closed-vocab scalars only; never a path or
    // diff. Defaults to [] so an older enclave that omits it still parses.
    metrics: z.array(factMetricSchema).default([]),
  })
  .strict();
export type ProcessedFact = z.infer<typeof processedFactSchema>;

const CANONICAL_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:(?:[A-Za-z0-9+/][AQgw])==|(?:[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048])=)?$/;

const legacyEncryptedBodySchema = z
  .object({
    format: z.literal(WIKI_CONTENT_FORMAT),
    ciphertext: z.string().min(1).regex(CANONICAL_BASE64_PATTERN),
  })
  .strict();

export const encryptedBodySchema = sealedContentEnvelopeV1Schema;
export type EncryptedBody = z.infer<typeof encryptedBodySchema>;

// Read-only migration compatibility for deployed legacy ciphertext; producers use encryptedBodySchema.
export const encryptedBodyReadSchema = z.union([encryptedBodySchema, legacyEncryptedBodySchema]);
export type EncryptedBodyRead = z.infer<typeof encryptedBodyReadSchema>;

export const encryptedBlockSchema = z
  .object({
    type: z.string(),
    sensitivityLevel: sensitivityLevelSchema,
    audienceId: z.string().nullable(),
    factIds: z.array(z.string()),
    body: encryptedBodySchema,
  })
  .strict();
export type EncryptedBlock = z.infer<typeof encryptedBlockSchema>;

// Read-only migration compatibility for deployed legacy blocks; producers use encryptedBlockSchema.
export const encryptedBlockReadSchema = encryptedBlockSchema
  .extend({
    body: encryptedBodyReadSchema,
  })
  .strict();
export type EncryptedBlockRead = z.infer<typeof encryptedBlockReadSchema>;

export const wikiArticleSchema = z.discriminatedUnion('contentFormat', [
  z
    .object({
      audienceId: z.string().nullable(),
      content: z.string().min(1).regex(CANONICAL_BASE64_PATTERN),
      contentFormat: z.literal(WIKI_CONTENT_FORMAT),
      factCount: z.number(),
    })
    .strict(),
  z
    .object({
      audienceId: z.string().nullable(),
      content: z.literal(''),
      contentFormat: z.literal('plaintext'),
      factCount: z.number(),
    })
    .strict(),
]);
export type WikiArticle = z.infer<typeof wikiArticleSchema>;

// Content-free rich-block emit-vs-drop tally per kind: how many fenced diagram/graph/
// chart/code/embed candidates the synthesizer parsed vs. dropped on failed validation, and how
// many of the dropped were recovered by the structured-repair pass (`repaired`, graph/chart only).
// Counts only — no block body, code, or caption ever crosses. The worker emits the
// `wiki.rich_blocks.synthesized` ops event from these (the enclave has no PostHog egress).
export const richBlockKindCountSchema = z
  .object({
    kind: richBlockKindSchema,
    seen: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
    repaired: z.number().int().nonnegative().default(0),
  })
  .strict();
export type RichBlockKindCount = z.infer<typeof richBlockKindCountSchema>;

// Content-free verdict of the pre-publish gate, rolled up across the audiences of one request
// (worst outcome wins). `failed` means a gate call did not complete, so the page shipped ungated;
// `revision_failed` means defects were found but the repair pass did not complete, so the defective
// draft shipped. Both are deliberately distinct from `clean`, a real reviewed verdict.
// `outcome`/`issueCount` describe the faithfulness gate ONLY — a hallucination. `coverageOutcome`/
// `visualIssueCount` describe the separate visual-coverage pass — a presentation gap. Split so a
// down warrant judge can never restate a faithfulness verdict that was computed and repaired, and
// so a drafter-model A/B on faithfulness reads one number. `skipped` means the faithfulness gate
// did not complete, so the coverage pass deliberately never ran.
// Enums and integers: no quote, heading, or fix instruction ever crosses.
export const critiqueOutcomeSchema = z
  .object({
    outcome: z.enum(['issues_found', 'revision_failed', 'clean', 'failed']),
    issueCount: z.number().int().nonnegative(),
    visualIssueCount: z.number().int().nonnegative().default(0),
    coverageOutcome: z.enum(['clean', 'blocks_added', 'failed', 'skipped']).default('clean'),
  })
  .strict();
export type CritiqueOutcome = z.infer<typeof critiqueOutcomeSchema>;

// A model id is deployment config (an allowlist entry), never content — the charset admits no
// whitespace and no prose punctuation, and the length cap keeps it to identifier scale, so a
// sentence, a prompt fragment, or a fact body cannot ride it. The enclave sanitizes to the same
// pattern before emitting, so a drifting id degrades to `unknown` instead of failing the result.
export const TOKEN_USAGE_MODEL_MAX_LENGTH = 64;
export const TOKEN_USAGE_MODEL_PATTERN = /^[A-Za-z0-9._:/-]+$/;

// Content-free per-run inference cost. `.strict()` rejects any field added on the wire, so a
// future member cannot reach a consumer unreviewed; every member but `model` is an integer or a
// closed enum. `cachedCalls` splits free replays out of `calls` — without it a broken meter
// (gateway returning no `usage`) is byte-identical to a run served entirely from cache.
export const tokenUsageSchema = z
  .object({
    model: z.string().min(1).max(TOKEN_USAGE_MODEL_MAX_LENGTH).regex(TOKEN_USAGE_MODEL_PATTERN),
    operation: z.enum(['embed', 'generate', 'structured']),
    calls: z.number().int().nonnegative(),
    cachedCalls: z.number().int().nonnegative().default(0),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
  })
  .strict();
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

// `.strict()` above must never cost a synthesis result: the enclave and the worker deploy
// separately, so an enclave that ships a new usage field first would otherwise fail the whole
// message and lose the article. Falling back to no telemetry is the recoverable half.
const tokenUsageArray = z.array(tokenUsageSchema).default([]).catch([]);

export const wikiSynthesisResultSchema = z
  .object({
    type: z.literal('wiki_synthesis'),
    requestId: z.string(),
    themeId: z.string(),
    orgId: z.string(),
    leaseToken: z.string().min(1),
    articles: z.array(wikiArticleSchema),
    blocks: z.array(encryptedBlockReadSchema),
    citedFactIds: z.array(z.string()),
    richBlockCounts: z.array(richBlockKindCountSchema).default([]),
    critique: critiqueOutcomeSchema.optional(),
    tokenUsage: tokenUsageArray,
  })
  .strict();
export type WikiSynthesisResult = z.infer<typeof wikiSynthesisResultSchema>;

// Per-fact relevance to the theme (container-cosine to the cluster centroid) — the
// SCORED_FOR edge weight. Lets read-time fact ordering (wiki synthesis packing) rank by real
// relevance instead of the prior constant 1.0. Content-free scalar; no body or name crosses.
export const themeFactScoreSchema = z
  .object({
    factId: z.string(),
    score: z.number(),
  })
  .strict();
export type ThemeFactScore = z.infer<typeof themeFactScoreSchema>;

export const synthesizedThemeSchema = z
  .object({
    themeId: z.string(),
    name: z.string(),
    kind: z.enum(['topic', 'ceremony']),
    team: z.string(),
    importance: z.number(),
    tags: z.array(z.string()),
    containerIds: z.array(z.string()),
    facts: z.array(themeFactScoreSchema),
    // Hybrid doc-type classification: the content-free type label that selects the wiki
    // section skeleton + its 0–1 confidence. Defaulted for an older enclave that omits it.
    docType: z.string().default('concept'),
    docTypeConfidence: z.number().min(0).max(1).default(0),
  })
  .strict();
export type SynthesizedTheme = z.infer<typeof synthesizedThemeSchema>;

export const relatedThemeEdgeSchema = z
  .object({
    fromThemeId: z.string(),
    toThemeId: z.string(),
    similarity: z.number(),
  })
  .strict();
export type RelatedThemeEdge = z.infer<typeof relatedThemeEdgeSchema>;

// Content-free theme-merge signals: the three similarity channels that produced a
// candidate. `judge` is null when the LLM same-concept judge was not run for the pair (the
// cheap embedding+overlap pre-score fell below the judge trigger). Ids + scores only — no
// theme name, summary, or fact body ever crosses this boundary.
export const themeMergeSignalsSchema = z
  .object({
    cosine: z.number(),
    jaccard: z.number(),
    judge: z.number().nullable(),
  })
  .strict();
export type ThemeMergeSignals = z.infer<typeof themeMergeSignalsSchema>;

// Detection only ever emits these two on the wire: `auto` ≥ auto-threshold (downstream merge
// applies it), `pending` ≥ review-threshold (downstream surfaces it for human review). Terminal
// dispositions (auto_merged/approved/rejected/skipped) are DB-only and never cross the boundary.
export const themeMergeCandidateStatusSchema = z.enum(['pending', 'auto']);
export type ThemeMergeCandidateStatus = z.infer<typeof themeMergeCandidateStatusSchema>;

// Detected duplicate-theme pair. `themeIdA < themeIdB` is canonicalized enclave-side
// so the (a, b) pair is stable and the worker can upsert idempotently.
export const themeMergeCandidateSchema = z
  .object({
    themeIdA: z.string(),
    themeIdB: z.string(),
    mergeScore: z.number(),
    signals: themeMergeSignalsSchema,
    status: themeMergeCandidateStatusSchema,
  })
  .strict();
export type ThemeMergeCandidate = z.infer<typeof themeMergeCandidateSchema>;

// Aggregate theme — an Initiative rolled up from strongly-related leaf themes. The
// enclave computes the clustering + name in-TEE; only ids, the cleartext label, tags, and
// child weights cross. `aggregateThemeId` is deterministic (seeded on the lowest child id) so
// re-running the same batch is idempotent.
export const aggregateThemeChildSchema = z
  .object({
    childThemeId: z.string(),
    weight: z.number(),
  })
  .strict();
export type AggregateThemeChild = z.infer<typeof aggregateThemeChildSchema>;

export const aggregateThemeSchema = z
  .object({
    aggregateThemeId: z.string(),
    name: z.string(),
    tags: z.array(z.string()),
    importance: z.number(),
    children: z.array(aggregateThemeChildSchema),
  })
  .strict();
export type AggregateTheme = z.infer<typeof aggregateThemeSchema>;

export const themeSynthesisResultSchema = z
  .object({
    type: z.literal('theme_synthesis'),
    requestId: z.string(),
    inputVersion: z.string(),
    leaseToken: z.string().min(1),
    orgId: z.string(),
    themes: z.array(synthesizedThemeSchema),
    related: z.array(relatedThemeEdgeSchema),
    mergeCandidates: z.array(themeMergeCandidateSchema).default([]),
    aggregates: z.array(aggregateThemeSchema).default([]),
    tokenUsage: tokenUsageArray,
  })
  .strict();
export type ThemeSynthesisResult = z.infer<typeof themeSynthesisResultSchema>;

export const synthesisFactRefSchema = z.object({
  factId: z.string(),
  s3Key: z.string(),
  occurredAt: z.string(),
  kind: z.string(),
  score: z.number(),
  // Content-free connector identity (github/slack/…) so the enclave prompt can show provenance
  // and a source-mix summary. Optional — an older worker that omits it degrades gracefully.
  sourceKind: z.string().optional(),
  // lets the enclave drop facts above the target audience's max before they enter
  // the prompt/citations, and floor cited blocks. Fail-closed default for older workers.
  sensitivityLevel: sensitivityLevelSchema.default('team_scoped'),
});
export type SynthesisFactRef = z.infer<typeof synthesisFactRefSchema>;

export const synthesisRelatedThemeSchema = z.object({
  themeId: z.string(),
  name: z.string(),
  similarity: z.number(),
});
export type SynthesisRelatedTheme = z.infer<typeof synthesisRelatedThemeSchema>;

// Cross-wiki knowledge-graph framework. Two shapes, split by the trust boundary:
//   • KnowledgeSkeleton — the CONTENT-FREE graph neighborhood the worker assembles from AGE
//     (ids + typed edges + weights + tags only) and carries in a SynthesisRequest. No names,
//     no summaries — those are audience-gated derived knowledge, hydrated enclave-side.
//   • KnowledgeNeighborhood — the HYDRATED shape the enclave builds by joining the skeleton
//     with names it already holds; it feeds the "Knowledge Graph Context" prompt block.
export const knowledgeEdgeKindSchema = z.enum(['RELATED_TO', 'PARENT', 'CHILD']);
export type KnowledgeEdgeKind = z.infer<typeof knowledgeEdgeKindSchema>;

export const knowledgeSkeletonNeighborSchema = z.object({
  themeId: z.string(),
  tags: z.array(z.string()),
  edge: knowledgeEdgeKindSchema,
  weight: z.number(),
  hops: z.number().int().min(1).max(2),
});
export type KnowledgeSkeletonNeighbor = z.infer<typeof knowledgeSkeletonNeighborSchema>;

export const knowledgeSkeletonEntitySchema = z.object({
  entityId: z.string(),
  kind: z.string(),
});
export type KnowledgeSkeletonEntity = z.infer<typeof knowledgeSkeletonEntitySchema>;

export const knowledgeSkeletonSchema = z.object({
  node: z.object({ themeId: z.string(), tags: z.array(z.string()) }),
  neighbors: z.array(knowledgeSkeletonNeighborSchema),
  entities: z.array(knowledgeSkeletonEntitySchema),
});
export type KnowledgeSkeleton = z.infer<typeof knowledgeSkeletonSchema>;

export const knowledgeNeighborhoodNeighborSchema = z.object({
  themeId: z.string(),
  canonicalName: z.string(),
  tags: z.array(z.string()),
  edge: knowledgeEdgeKindSchema,
  weight: z.number(),
  oneLineSummary: z.string(),
});
export type KnowledgeNeighborhoodNeighbor = z.infer<typeof knowledgeNeighborhoodNeighborSchema>;

export const knowledgeNeighborhoodEntitySchema = z.object({
  entityId: z.string(),
  canonicalName: z.string(),
  kind: z.string(),
});
export type KnowledgeNeighborhoodEntity = z.infer<typeof knowledgeNeighborhoodEntitySchema>;

export const knowledgeNeighborhoodSchema = z.object({
  node: z.object({
    themeId: z.string(),
    canonicalName: z.string(),
    tags: z.array(z.string()),
    summary: z.string(),
  }),
  neighbors: z.array(knowledgeNeighborhoodNeighborSchema),
  entities: z.array(knowledgeNeighborhoodEntitySchema),
});
export type KnowledgeNeighborhood = z.infer<typeof knowledgeNeighborhoodSchema>;

// GLM 5.2 has a 1M-token window, so input capacity is effectively free; latency and cost are
// the real limit. The enclave packs decrypted facts up to this budget (env/Pulumi-configurable).
export const DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET = 50_000;

export const synthesisAudienceSchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
  publicEligible: z.boolean(),
  // highest fact sensitivity to pack into this audience's body. Fail-closed default.
  maxSensitivity: sensitivityLevelSchema.default('team_scoped'),
});
export type SynthesisAudience = z.infer<typeof synthesisAudienceSchema>;

export const synthesisRequestSchema = z.object({
  type: z.literal('wiki_synthesis'),
  requestId: z.string(),
  themeId: z.string(),
  orgId: z.string(),
  leaseToken: z.string().min(1),
  themeName: z.string(),
  themeType: z.string(),
  parentThemeCount: z.number(),
  factRefs: z.array(synthesisFactRefSchema),
  relatedThemes: z.array(synthesisRelatedThemeSchema),
  contributorCount: z.number(),
  audiences: z.array(synthesisAudienceSchema),
  // Facts whose association to this theme just changed and triggered the re-synth — the
  // enclave ALWAYS includes them in the budget, never lets a dedup/rerank drop them.
  newlyAssociatedFactIds: z.array(z.string()).default([]),
  // The in-enclave input-token budget for fact packing (adaptive selection replaces a fixed
  // fact count). Content-free; env/Pulumi configurable per deployment.
  inputTokenBudget: z.number().int().positive().default(DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET),
  // Content-free graph neighborhood (ids/edges/weights/tags) the worker assembled from AGE;
  // the enclave hydrates it into a KnowledgeNeighborhood for the cross-wiki prompt block.
  knowledgeSkeleton: knowledgeSkeletonSchema.optional(),
});
export type SynthesisRequest = z.infer<typeof synthesisRequestSchema>;

export const themeContainerFactRefSchema = z.object({
  factId: z.string(),
  s3Key: z.string(),
  occurredAt: z.string(),
  // Already-extracted content-free structured ids (fact_content.extracted_entities) —
  // fed into merge-detection's entity-Jaccard signal. Enters the enclave; never leaves.
  entities: z.array(z.string()).default([]),
});
export type ThemeContainerFactRef = z.infer<typeof themeContainerFactRefSchema>;

export const themeContainerRefSchema = z.object({
  containerId: z.string(),
  label: z.string(),
  team: z.string(),
  factRefs: z.array(themeContainerFactRefSchema),
});
export type ThemeContainerRef = z.infer<typeof themeContainerRefSchema>;

export const themeSynthesisRequestSchema = z.object({
  type: z.literal('theme_synthesis'),
  requestId: z.string(),
  inputVersion: z.string(),
  leaseToken: z.string().min(1),
  orgId: z.string(),
  containers: z.array(themeContainerRefSchema),
});
export type ThemeSynthesisRequest = z.infer<typeof themeSynthesisRequestSchema>;

// Cross-theme team-onboarding synthesis. One team theme on the
// wire: its id, cleartext label, section-selecting type, and the content-free fact refs (S3 key +
// metadata) the enclave decrypts. No prose crosses — identical discipline to `synthesisFactRefSchema`.
export const teamOnboardingThemeSchema = z.object({
  themeId: z.string(),
  name: z.string(),
  themeType: z.string(),
  factRefs: z.array(synthesisFactRefSchema),
});
export type TeamOnboardingTheme = z.infer<typeof teamOnboardingThemeSchema>;

// A single "how this team operates" article synthesized across ALL of a team's themes (the current
// model is single-theme — every SynthesisRequest is one theme). Content-free: only ids, the team
// name/label, and fact refs cross; decryption + drafting stay in-enclave.
export const teamOnboardingSynthesisRequestSchema = z.object({
  type: z.literal('team_onboarding_synthesis'),
  requestId: z.string(),
  orgId: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  themes: z.array(teamOnboardingThemeSchema),
  audiences: z.array(synthesisAudienceSchema),
  newlyAssociatedFactIds: z.array(z.string()).default([]),
  inputTokenBudget: z.number().int().positive().default(DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET),
});
export type TeamOnboardingSynthesisRequest = z.infer<typeof teamOnboardingSynthesisRequestSchema>;

export const synthesisQueueRequestSchema = z.discriminatedUnion('type', [
  synthesisRequestSchema,
  themeSynthesisRequestSchema,
  teamOnboardingSynthesisRequestSchema,
]);
export type SynthesisQueueRequest = z.infer<typeof synthesisQueueRequestSchema>;

// The enclave→worker result of a team-onboarding synthesis. Reuses the wiki article/block shapes
// (ESDK ciphertext bound to the row identity); the worker persists it as a team-scoped wiki_pages
// row (theme_id null, team_id set) and never decrypts the bodies.
export const teamOnboardingSynthesisResultSchema = z
  .object({
    type: z.literal('team_onboarding_synthesis'),
    requestId: z.string(),
    orgId: z.string(),
    teamId: z.string(),
    teamName: z.string(),
    articles: z.array(wikiArticleSchema),
    blocks: z.array(encryptedBlockReadSchema),
    citedFactIds: z.array(z.string()),
    critique: critiqueOutcomeSchema.optional(),
    tokenUsage: tokenUsageArray,
  })
  .strict();
export type TeamOnboardingSynthesisResult = z.infer<typeof teamOnboardingSynthesisResultSchema>;

// Content-free enclave→worker completion signal: a scheduled pull cycle
// finished cleanly, so the worker can advance connector_sync_state.last_successful_sync_at
// (the enclave has no DB access — so the write stays worker-side). Carries only
// metadata (org, source kind/id, timestamp); never fact content.
export const pullCompleteSignalSchema = z
  .object({
    type: z.literal('pull-complete'),
    orgId: z.string(),
    sourceKind: z.string(),
    sourceId: z.string(),
    completedAt: z.string().datetime(),
    backfillLeaseToken: z.string().uuid().optional(),
  })
  .strict();
export type PullCompleteSignal = z.infer<typeof pullCompleteSignalSchema>;

// Content-free enclave→worker failure signal emitted when a pull reaches the queue redrive limit.
// It marks the connector offline and requests a recovery backfill without advancing its success
// watermark; no provider error or source content crosses the boundary.
export const pullFailedSignalSchema = z
  .object({
    type: z.literal('pull-failed'),
    orgId: z.string(),
    sourceKind: z.string(),
    sourceId: z.string(),
    failedAt: z.string().datetime(),
    backfillLeaseToken: z.string().uuid().optional(),
  })
  .strict();
export type PullFailedSignal = z.infer<typeof pullFailedSignalSchema>;

const scheduledPullDueMessageSchema = z
  .object({
    type: z.literal('pull-due'),
    trigger: z.literal('scheduled'),
    tenant_id: z.string(),
    sourceId: z.string(),
    kind: z.string(),
    backfill: z.boolean(),
    backfillLeaseToken: z.string().uuid().optional(),
  })
  .strict();

const activationPullDueMessageSchema = z
  .object({
    type: z.literal('pull-due'),
    trigger: z.literal('activation'),
    tenant_id: z.string(),
    sourceId: z.string(),
    kind: z.string(),
    activationGeneration: z.string().uuid(),
    backfill: z.literal(true),
  })
  .strict();

export const pullDueMessageSchema = z.discriminatedUnion('trigger', [
  scheduledPullDueMessageSchema,
  activationPullDueMessageSchema,
]);
export type PullDueMessage = z.infer<typeof pullDueMessageSchema>;

export const jiraEncryptedWebhookEnvelopeSchema = z
  .object({
    version: z.literal(1),
    rawBody: z.string().max(2_000_000),
    authorization: z
      .string()
      .regex(/^Bearer [^\s]+$/)
      .max(16_384),
    method: z.literal('POST'),
    rawPath: z
      .string()
      .min(1)
      .max(512)
      .regex(/^\/[^\r\n]*$/),
    rawQuery: z
      .string()
      .max(8_192)
      .regex(/^[^\r\n]*$/),
    webhookIdentifier: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[^\r\n]+$/),
  })
  .strict();
export type JiraEncryptedWebhookEnvelope = z.infer<typeof jiraEncryptedWebhookEnvelopeSchema>;

// Content-free "export-due" signal, the outbound mirror of `pull-due`: the worker
// scheduler lists due export targets and signals the enclave, which alone can decrypt the wiki
// blocks and write them out. Ids only — never prose, never the destination token.
// The ceiling + above-public acknowledgement are authoritative in the audited `export_targets` row
// and read there by the enclave, so they are deliberately NOT on the wire (never trust it for that).
export const exportDueMessageSchema = z
  .object({
    type: z.literal('export-due'),
    tenant_id: z.string(),
    themeId: z.string(),
    targetId: z.string(),
    kind: wikiExportTargetKindSchema,
  })
  .strict();
export type ExportDueMessage = z.infer<typeof exportDueMessageSchema>;

// Content-free enclave→worker completion signal: a page was written out, so the
// worker advances the target's externalPageRef + lastContentHash (the enclave has no DB access).
// `externalPageRef` is a destination-side page id (Notion/ClickUp), not customer content.
export const exportCompleteSignalSchema = z
  .object({
    type: z.literal('export-complete'),
    orgId: z.string(),
    targetId: z.string(),
    externalWorkspaceRef: z.string(),
    externalPageRef: z.string(),
    contentHash: z.string(),
    exportedAt: z.string().datetime(),
  })
  .strict();
export type ExportCompleteSignal = z.infer<typeof exportCompleteSignalSchema>;

const opaqueCiphertextSchema = z.string().min(1).max(2_000_000);

export const oauthRefreshCommandSchema = z
  .object({
    encryptedRefreshToken: opaqueCiphertextSchema,
    orgId: z.string().uuid(),
    deploymentId: z.string().uuid(),
    sourceKind: z.string().min(1).max(64),
    connectionId: z.string().uuid(),
    activationGeneration: z.string().uuid(),
    attestationGeneration: z.string().min(1).max(128),
    attemptId: z.string().regex(/^[a-f0-9]{64}$/),
    expectedRefreshCiphertextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type OAuthRefreshCommand = z.infer<typeof oauthRefreshCommandSchema>;

export const enclaveAuthorizationCodeGrantSchema = z
  .object({
    version: z.literal(1),
    deploymentId: z.string().uuid(),
    orgId: z.string().uuid(),
    connectionId: z.string().uuid().optional(),
    activationGeneration: z.string().uuid().optional(),
    sourceKind: z.string().min(1).max(64),
    callbackUri: z.string().url(),
    attestationGeneration: z.string().min(1).max(128),
    stateBindingId: z.string().regex(/^[a-f0-9]{64}$/),
    authorizationCode: z.string().min(1).max(16_384),
    codeVerifier: z.string().min(43).max(256).nullable(),
    accountId: z.string().uuid().optional(),
    memberEmail: z.string().email().max(320).optional(),
    issuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type EnclaveAuthorizationCodeGrant = z.infer<typeof enclaveAuthorizationCodeGrantSchema>;

// Callback output is deliberately opaque. Authorization codes, PKCE verifiers, provider tokens,
// and provider response bodies are enclave-only; the control plane may carry this envelope but may
// not inspect or persist its plaintext members.
export const sealedAuthorizationCodeSubmissionSchema = z
  .object({
    deploymentId: z.string().uuid(),
    orgId: z.string().uuid(),
    sourceKind: z.string().min(1).max(64),
    attestationGeneration: z.string().min(1).max(128),
    stateBindingId: z.string().regex(/^[a-f0-9]{64}$/),
    encryptedCodeGrant: opaqueCiphertextSchema,
    ciphertextSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type SealedAuthorizationCodeSubmission = z.infer<
  typeof sealedAuthorizationCodeSubmissionSchema
>;

export const sealedGitHubInstallationSubmissionSchema = z
  .object({
    deploymentId: z.string().min(1).max(128),
    orgId: z.string().min(1).max(128),
    accountId: z.string().uuid().optional(),
    sourceKind: z.union([z.literal('github'), z.literal('code')]),
    connectionId: z.string().uuid(),
    activationGeneration: z.string().uuid(),
    attestationGeneration: z.string().min(1).max(128),
    stateBindingId: z.string().regex(/^[a-f0-9]{64}$/),
    installationId: z
      .string()
      .regex(/^[0-9]+$/)
      .max(32),
  })
  .strict();
export type SealedGitHubInstallationSubmission = z.infer<
  typeof sealedGitHubInstallationSubmissionSchema
>;

export const connectorOAuthMetadataUpdateSchema = z
  .object({
    deploymentId: z.string().uuid(),
    orgId: z.string().uuid(),
    sourceKind: z.string().min(1).max(64),
    connectionId: z.string().min(1).max(128),
    activationGeneration: z.string().uuid(),
    attestationGeneration: z.string().min(1).max(128),
    sourceUserId: z.string().min(1).max(256).nullable(),
    externalTenantId: z.string().min(1).max(256).nullable(),
    accessCiphertextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    refreshCiphertextSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    outcome: z.enum([
      'success',
      'state_invalid',
      'state_replayed',
      'code_seal_failed',
      'provider_rejected',
      'provider_error',
      'identity_rejected',
      'persist_failed',
    ]),
  })
  .strict();
export type ConnectorOAuthMetadataUpdate = z.infer<typeof connectorOAuthMetadataUpdateSchema>;

export const sealedOAuthCredentialPersistenceSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    encryptedAccessToken: opaqueCiphertextSchema,
    encryptedRefreshToken: opaqueCiphertextSchema.optional(),
    metadata: connectorOAuthMetadataUpdateSchema,
  })
  .strict();
export type SealedOAuthCredentialPersistence = z.infer<
  typeof sealedOAuthCredentialPersistenceSchema
>;

export const oauthRefreshMetadataUpdateSchema = z
  .object({
    deploymentId: z.string().uuid(),
    orgId: z.string().uuid(),
    connectionId: z.string().min(1).max(128),
    sourceKind: z.string().min(1).max(64),
    activationGeneration: z.string().uuid(),
    attestationGeneration: z.string().min(1).max(128),
    attemptId: z.string().regex(/^[a-f0-9]{64}$/),
    priorRefreshCiphertextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    nextAccessCiphertextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    nextRefreshCiphertextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outcome: z.enum([
      'success',
      'unsupported_connector',
      'no_connection',
      'unbound_connection',
      'token_mismatch',
      'attestation_unavailable',
      'provider_rejected',
      'provider_error',
      'stale_write',
      'persist_failed',
    ]),
  })
  .strict();
export type OAuthRefreshMetadataUpdate = z.infer<typeof oauthRefreshMetadataUpdateSchema>;

const webhookLifecycleUuidSchema = z.string().uuid();
const webhookLifecycleSourceKindSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);
const webhookLifecycleGenerationSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const webhookRegistrationIdSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^(?:0|[1-9][0-9]{0,15})$/)
  .refine(
    (id) => BigInt(id) <= BigInt(Number.MAX_SAFE_INTEGER),
    'registration id exceeds safe integer',
  );
const webhookRegistrationIdsSchema = z
  .array(webhookRegistrationIdSchema)
  .min(1)
  .max(16)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'registration ids must be unique' });
    }
  });
const webhookLifecycleTimestampSchema = z.string().datetime({ offset: true });

const webhookLifecycleBindingSchema = z
  .object({
    runtimeDeploymentId: webhookLifecycleUuidSchema,
    tenantDeploymentId: webhookLifecycleUuidSchema,
    orgId: webhookLifecycleUuidSchema,
    connectionId: webhookLifecycleUuidSchema,
    webhookRouteId: webhookLifecycleUuidSchema,
    sourceKind: webhookLifecycleSourceKindSchema,
    attestationGeneration: webhookLifecycleGenerationSchema,
  })
  .strict();

export const webhookLifecycleClaimSchema = webhookLifecycleBindingSchema
  .extend({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type WebhookLifecycleClaim = z.infer<typeof webhookLifecycleClaimSchema>;

export const webhookLifecycleRenewSchema = webhookLifecycleBindingSchema
  .extend({
    claimId: webhookLifecycleUuidSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type WebhookLifecycleRenew = z.infer<typeof webhookLifecycleRenewSchema>;

const webhookLifecycleStatusSchema = z.enum(['registered', 'degraded']);
const webhookLifecycleOperationSchema = z.enum(['register', 'refresh', 'adopt', 'cleanup']);
const webhookLifecycleFailureCodeSchema = z.enum([
  'provider_rejected',
  'provider_error',
  'persist_failed',
]);

export const webhookLifecycleFinalizeSchema = webhookLifecycleBindingSchema
  .extend({
    claimId: webhookLifecycleUuidSchema,
    revision: z.number().int().nonnegative(),
    registrationIds: webhookRegistrationIdsSchema.nullable(),
    expiresAt: webhookLifecycleTimestampSchema.nullable(),
    attemptedAt: webhookLifecycleTimestampSchema,
    succeededAt: webhookLifecycleTimestampSchema.nullable(),
    status: webhookLifecycleStatusSchema,
    operation: webhookLifecycleOperationSchema,
    failureCode: webhookLifecycleFailureCodeSchema.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    const hasActiveRegistration = input.registrationIds !== null;
    if (hasActiveRegistration !== (input.expiresAt !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'registration ids and expiry must be paired',
      });
    }
    if (
      hasActiveRegistration &&
      input.expiresAt !== null &&
      Date.parse(input.expiresAt) <= Date.now()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'active provider registration expiry must be in the future',
        path: ['expiresAt'],
      });
    }
    if (input.status === 'registered') {
      if (!hasActiveRegistration || input.expiresAt === null || input.succeededAt === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'registered lifecycle requires an active provider registration',
        });
      }
      if (input.failureCode !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'registered lifecycle cannot carry a failure code',
        });
      }
      return;
    }
    if (input.failureCode === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'degraded lifecycle requires a failure code',
      });
    }
  });
export type WebhookLifecycleFinalize = z.infer<typeof webhookLifecycleFinalizeSchema>;

export const webhookLifecycleCleanupClearSchema = webhookLifecycleBindingSchema
  .extend({
    claimId: webhookLifecycleUuidSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type WebhookLifecycleCleanupClear = z.infer<typeof webhookLifecycleCleanupClearSchema>;

export const webhookLifecycleDeliverySchema = webhookLifecycleBindingSchema
  .extend({
    registrationId: webhookRegistrationIdSchema,
  })
  .strict();
export type WebhookLifecycleDelivery = z.infer<typeof webhookLifecycleDeliverySchema>;

const webhookCaptureClaimSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/)
      .refine(
        (name) => !/(?:authorization|bearer|cookie|password|secret|token|value)/i.test(name),
        'claim names cannot identify credential material',
      ),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'null']),
  })
  .strict();

export const webhookProtocolCaptureRecordSchema = z
  .object({
    algorithm: z.enum([
      'HS256',
      'RS256',
      'RS384',
      'RS512',
      'PS256',
      'PS384',
      'PS512',
      'ES256',
      'ES384',
      'ES512',
      'EdDSA',
    ]),
    claims: z.array(webhookCaptureClaimSchema).max(32),
    lifetimeSeconds: z.number().int().nonnegative().max(86_400),
    qshPresent: z.boolean(),
    qshMatches: z.boolean(),
    issuerPolicyMatch: z.enum(['matched', 'mismatched', 'missing']),
    audiencePolicyMatch: z.enum(['matched', 'mismatched', 'missing']),
    tenantPolicyMatch: z.enum(['matched', 'mismatched', 'missing']),
  })
  .strict()
  .superRefine((record, context) => {
    if (!record.qshPresent && record.qshMatches) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'an absent qsh cannot match',
      });
    }
    for (let index = 1; index < record.claims.length; index += 1) {
      const previous = record.claims[index - 1];
      const current = record.claims[index];
      if (!previous || !current) continue;
      if (previous.name >= current.name) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'claims must be uniquely sorted by name',
          path: ['claims', index],
        });
      }
    }
    if (new TextEncoder().encode(JSON.stringify(record)).byteLength > 4096) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'protocol capture exceeds byte limit',
      });
    }
  });

export const webhookProtocolCaptureSchema = webhookLifecycleBindingSchema
  .extend({
    capture: webhookProtocolCaptureRecordSchema,
  })
  .strict();
export type WebhookProtocolCapture = z.infer<typeof webhookProtocolCaptureSchema>;

export const encryptedSourceConnectionSchema = z
  .object({
    connectionId: webhookLifecycleUuidSchema,
    orgId: webhookLifecycleUuidSchema.nullable(),
    attestationGeneration: webhookLifecycleGenerationSchema.nullable(),
    accessCiphertextSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    refreshCiphertextSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    kind: webhookLifecycleSourceKindSchema,
    encryptedAccessToken: opaqueCiphertextSchema,
    encryptedRefreshToken: opaqueCiphertextSchema.nullable(),
    sourceUserId: z.string().min(1).max(256).nullable(),
    installationId: z.string().min(1).max(64).nullable(),
    externalTenantId: z.string().min(1).max(256).nullable(),
    webhookRouteId: webhookLifecycleUuidSchema.nullable(),
    webhookRevision: z.number().int().nonnegative(),
    webhookRegistrationIds: webhookRegistrationIdsSchema.nullable(),
    webhookExpiresAt: webhookLifecycleTimestampSchema.nullable(),
    webhookStatus: webhookLifecycleStatusSchema.nullable(),
    webhookLastOperation: webhookLifecycleOperationSchema.nullable(),
    webhookLastAttemptedAt: webhookLifecycleTimestampSchema.nullable(),
    webhookLastSucceededAt: webhookLifecycleTimestampSchema.nullable(),
    webhookLastDeliveryAt: webhookLifecycleTimestampSchema.nullable(),
    webhookProtocolCapture: webhookProtocolCaptureRecordSchema.nullable(),
    webhookProtocolCaptureExpiresAt: webhookLifecycleTimestampSchema.nullable(),
    webhookFailureCode: webhookLifecycleFailureCodeSchema.nullable(),
    webhookCleanupRouteId: webhookLifecycleUuidSchema.nullable(),
    webhookCleanupExternalTenantId: z.string().min(1).max(256).nullable(),
    webhookCleanupRegistrationIds: webhookRegistrationIdsSchema.nullable(),
    webhookCleanupExpiresAt: webhookLifecycleTimestampSchema.nullable(),
  })
  .strict();
export type EncryptedSourceConnection = z.infer<typeof encryptedSourceConnectionSchema>;

export const oauthDisconnectCleanupCommandSchema = z
  .object({
    orgId: webhookLifecycleUuidSchema,
    tenantDeploymentId: webhookLifecycleUuidSchema,
    connectionId: webhookLifecycleUuidSchema,
    kind: webhookLifecycleSourceKindSchema,
    routeId: webhookLifecycleUuidSchema.nullable(),
    generation: webhookLifecycleGenerationSchema,
    disconnectEraseAfter: webhookLifecycleTimestampSchema,
    cleanupExternalTenantId: z.string().min(1).max(256).nullable(),
    cleanupRegistrationIds: webhookRegistrationIdsSchema.nullable(),
    cleanupExpiresAt: webhookLifecycleTimestampSchema.nullable(),
  })
  .strict();
export type OAuthDisconnectCleanupCommand = z.infer<typeof oauthDisconnectCleanupCommandSchema>;

export const retiredOAuthCredentialLookupSchema = z
  .object({
    orgId: webhookLifecycleUuidSchema,
    tenantDeploymentId: webhookLifecycleUuidSchema,
    connectionId: webhookLifecycleUuidSchema,
    kind: webhookLifecycleSourceKindSchema,
    routeId: webhookLifecycleUuidSchema.nullable(),
    generation: webhookLifecycleGenerationSchema,
    disconnectEraseAfter: webhookLifecycleTimestampSchema,
  })
  .strict();
export type RetiredOAuthCredentialLookup = z.infer<typeof retiredOAuthCredentialLookupSchema>;

export const retiredOAuthCredentialSchema = z
  .object({
    encryptedAccessToken: opaqueCiphertextSchema,
    encryptedRefreshToken: opaqueCiphertextSchema.nullable(),
    accessCiphertextSha256: z.string().regex(/^[a-f0-9]{64}$/),
    refreshCiphertextSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    externalTenantId: z.string().min(1).max(256).nullable(),
    cleanupExternalTenantId: z.string().min(1).max(256).nullable(),
    cleanupRegistrationIds: webhookRegistrationIdsSchema.nullable(),
    cleanupExpiresAt: webhookLifecycleTimestampSchema.nullable(),
  })
  .strict();
export type RetiredOAuthCredential = z.infer<typeof retiredOAuthCredentialSchema>;
