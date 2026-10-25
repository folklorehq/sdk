// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { audienceLensIdSchema } from './me.js';

export const ANSWER_DEFAULT_LIMIT = 8;
export const ANSWER_MAX_LIMIT = 20;
export const ASK_QUESTION_MAX_CHARS = 2_000;
// The enclave truncates every preview to this before it leaves the index (enclave EnclaveFactRetriever
// imports this same constant; answerer CITATION_SNIPPET_LIMIT); the bound is asserted on the wire so an
// over-long body can't ride the field.
export const SNIPPET_MAX_CHARS = 280;

/** A single audience-gated fact hit — content-free metadata plus a decrypted snippet the caller is allowed to see. */
export const searchResultSchema = z.object({
  id: z.string(),
  kind: z.string(),
  occurredAt: z.string(),
  sourceId: z.string(),
  sourceKind: z.string(),
  distance: z.number(),
  snippet: z.string().max(SNIPPET_MAX_CHARS).optional(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const answerRequestSchema = z
  .object({
    q: z.string().trim().min(1).max(ASK_QUESTION_MAX_CHARS),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .default(ANSWER_DEFAULT_LIMIT)
      .transform((value) => Math.min(value, ANSWER_MAX_LIMIT)),
    audience: audienceLensIdSchema.optional(),
  })
  .strict();
export type AnswerRequest = z.infer<typeof answerRequestSchema>;

/** Why an answer abstained: no audience-visible fact matched, the audience lens held none while something outside it matched, or the model's answer cited none of the facts. */
export const abstainReasonSchema = z.enum(['no_context', 'no_citations', 'outside_lens']);
export type AbstainReason = z.infer<typeof abstainReasonSchema>;

const answerBaseSchema = z.object({
  query: z.string(),
  answer: z.string(),
  citations: z.array(searchResultSchema),
});

/** A grounded answer over enclave data: synthesized text plus the facts it was drawn from as citations. Discriminated on `grounded` so "grounded with an abstain reason" is unrepresentable — `abstainReason` says which of the two abstain paths ran. */
export const answerResponseSchema = z.discriminatedUnion('grounded', [
  answerBaseSchema.extend({ grounded: z.literal(true) }),
  answerBaseSchema.extend({
    grounded: z.literal(false),
    abstainReason: abstainReasonSchema.optional(),
  }),
]);
export type AnswerResponse = z.infer<typeof answerResponseSchema>;
