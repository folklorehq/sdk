// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

/** One medium-confidence fact↔container association awaiting human disposition (ADL #24) — content-free metadata only (ADL #12). */
export const reviewQueueItemSchema = z.object({
  scoreId: z.string(),
  factId: z.string(),
  containerId: z.string(),
  composite: z.number(),
  signals: z.unknown(),
  confidence: z.string(),
  scoredAt: z.string(),
  fact: z.object({ kind: z.string(), occurredAt: z.string(), sourceId: z.string() }),
  container: z.object({ label: z.string(), shape: z.string() }),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const reviewQueueSchema = z.object({
  total: z.number(),
  items: z.array(reviewQueueItemSchema),
});
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;

export const reviewActionSchema = z.object({
  action: z.enum(['assign', 'remove']),
  reason: z.string().nullish(),
});
export type ReviewAction = z.infer<typeof reviewActionSchema>;
