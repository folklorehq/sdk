// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
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
