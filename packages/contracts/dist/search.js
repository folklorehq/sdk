// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
const SEARCH_MAX_LIMIT = 100;
// The enclave truncates every preview to this before it leaves the index (fact-retriever SNIPPET_LIMIT
// / answerer CITATION_SNIPPET_LIMIT); the bound is asserted on the wire so an over-long body can't ride the field.
const SNIPPET_MAX_CHARS = 280;
/** A single audience-gated fact hit — content-free metadata plus a decrypted snippet the caller is allowed to see. */
export const searchResultSchema = z.object({
    id: z.string(),
    kind: z.string(),
    occurredAt: z.string(),
    sourceId: z.string(),
    distance: z.number(),
    snippet: z.string().max(SNIPPET_MAX_CHARS).optional(),
});
export const searchResponseSchema = z.object({
    query: z.string(),
    results: z.array(searchResultSchema),
});
export const answerRequestSchema = z.object({
    q: z.string().trim().min(1),
    limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional(),
});
/** A grounded answer over enclave data: synthesized text plus the facts it was drawn from as citations. `grounded` is false when no visible fact matched, so the model was never asked to invent one. */
export const answerResponseSchema = z.object({
    query: z.string(),
    answer: z.string(),
    grounded: z.boolean(),
    citations: z.array(searchResultSchema),
});
//# sourceMappingURL=search.js.map