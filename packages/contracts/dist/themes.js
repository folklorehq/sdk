// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
/** A theme rendered as a knowledge-map node — content-free metadata only. */
export const themeGraphNodeSchema = z.object({
    id: z.string(),
    name: z.string(),
    tags: z.array(z.string()),
    isAggregate: z.boolean(),
    importance: z.number(),
    factCount: z.number(),
    updatedAt: z.string(),
    ownerTeamId: z.string().nullable(),
    ownerTeamName: z.string().nullable(),
    ownerName: z.string().nullable(),
    audience: z.string().nullable(),
});
/** A scored `RELATED_TO` edge between two themes. */
export const themeGraphEdgeSchema = z.object({
    source: z.string(),
    target: z.string(),
    weight: z.number(),
});
export const themeGraphResponseSchema = z.object({
    nodes: z.array(themeGraphNodeSchema),
    edges: z.array(themeGraphEdgeSchema),
    truncated: z.boolean(),
});
/** One pending duplicate-theme pair awaiting human disposition — ids/scores/names only; the box resolves names from its own DB, never the control plane. */
export const themeMergeReviewItemSchema = z.object({
    candidateId: z.string(),
    themeA: z.object({ id: z.string(), name: z.string() }),
    themeB: z.object({ id: z.string(), name: z.string() }),
    mergeScore: z.number(),
    signals: z.object({ cosine: z.number(), jaccard: z.number(), judge: z.number().nullable() }),
    detectedAt: z.string(),
});
export const themeMergeReviewListSchema = z.object({
    total: z.number(),
    items: z.array(themeMergeReviewItemSchema),
});
export const themeMergeActionSchema = z.object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().nullish(),
});
//# sourceMappingURL=themes.js.map