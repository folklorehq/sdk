// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { FACT_EXCERPT_MAX_CHARS } from './facts.js';
import { SNIPPET_MAX_CHARS } from './search.js';

/** One medium-confidence fact↔container association awaiting human disposition — content-free metadata plus a decrypted snippet the caller is allowed to see. */
export const reviewQueueItemSchema = z.object({
  scoreId: z.string(),
  factId: z.string(),
  containerId: z.string(),
  composite: z.number(),
  signals: z.unknown(),
  confidence: z.string(),
  scoredAt: z.string(),
  fact: z.object({ kind: z.string(), occurredAt: z.string(), sourceKind: z.string() }),
  container: z.object({ label: z.string(), shape: z.string() }),
  snippet: z.string().max(SNIPPET_MAX_CHARS).optional(),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const reviewQueueSchema = z.object({
  total: z.number(),
  items: z.array(reviewQueueItemSchema),
});
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;

export const reviewActionSchema = z.object({
  action: z.enum(['assign', 'remove']),
});
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const reviewCountSchema = z.object({ total: z.number().int().nonnegative() }).strict();
export type ReviewCount = z.infer<typeof reviewCountSchema>;

export const READER_PROPOSALS_PER_USER_PER_DAY = 10;
export const READER_OPEN_PROPOSALS_PER_ORG_MAX = 50;
export const SAME_THEME_ALREADY_DECIDED_REASON = 'merge_already_decided';
export const READER_PROPOSAL_LIMIT_REASON = 'reader_proposal_limit';

export const factThemeCorrectionBodySchema = z
  .object({
    action: z.enum(['exclude', 'move']),
    targetThemeId: z.string().uuid().optional(),
  })
  .strict()
  .refine((body) => (body.action === 'move') === (body.targetThemeId !== undefined));
export type FactThemeCorrectionBody = z.infer<typeof factThemeCorrectionBodySchema>;

export const sameThemeBodySchema = z.object({ otherThemeId: z.string().uuid() }).strict();
export type SameThemeBody = z.infer<typeof sameThemeBodySchema>;

export const factThemeCorrectionResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('applied'),
      trainingLabel: z.enum(['membership', 'training_only', 'none']),
    })
    .strict(),
  z.object({ status: z.literal('recorded'), trainingLabel: z.literal('training_only') }).strict(),
]);
export type FactThemeCorrectionResult = z.infer<typeof factThemeCorrectionResultSchema>;

export const sameThemeResultSchema = z.object({ status: z.literal('proposed') }).strict();
export type SameThemeResult = z.infer<typeof sameThemeResultSchema>;

export const JUDGE_RESOLVED_PAGE_MAX = 50;
export const JUDGE_MODEL_MAX_CHARS = 128;

export const judgeResolvedPairSchema = z
  .object({
    scoreId: z.string().uuid(),
    factId: z.string().uuid(),
    containerLabel: z.string(),
    applied: z.enum(['assign', 'remove']),
    confidence: z.number().min(0).max(1),
    model: z.string().max(JUDGE_MODEL_MAX_CHARS),
    judgedAt: z.string().datetime(),
    excerpt: z.string().max(FACT_EXCERPT_MAX_CHARS).nullable(),
  })
  .strict();
export type JudgeResolvedPair = z.infer<typeof judgeResolvedPairSchema>;

export const judgeDecisionListSchema = z
  .object({
    items: z.array(judgeResolvedPairSchema).max(JUDGE_RESOLVED_PAGE_MAX),
    outsideAccess: z.number().int().nonnegative(),
  })
  .strict();
export type JudgeDecisionList = z.infer<typeof judgeDecisionListSchema>;

export const JUDGE_BULK_REVERT_MAX = 500;
export const JUDGE_BULK_REVERT_WINDOW_MAX_MS = 31 * 24 * 60 * 60 * 1000;

export const judgeBulkRevertRequestSchema = z
  .object({
    model: z.string().min(1).max(JUDGE_MODEL_MAX_CHARS),
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .strict()
  .refine((request) => Date.parse(request.to) > Date.parse(request.from), {
    message: 'to must be after from',
  })
  .refine(
    (request) =>
      Date.parse(request.to) - Date.parse(request.from) <= JUDGE_BULK_REVERT_WINDOW_MAX_MS,
    { message: 'window too long' },
  );
export type JudgeBulkRevertRequest = z.infer<typeof judgeBulkRevertRequestSchema>;

export const judgeBulkRevertResultSchema = z
  .object({
    reverted: z.number().int().nonnegative().max(JUDGE_BULK_REVERT_MAX),
    more: z.boolean(),
    hasOutsideAccess: z.boolean(),
  })
  .strict();
export type JudgeBulkRevertResult = z.infer<typeof judgeBulkRevertResultSchema>;
