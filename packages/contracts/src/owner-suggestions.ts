// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const OWNER_SUGGESTION_MIN_AUTHORED_CITED_FACTS = 5;
export const OWNER_SUGGESTION_MIN_SHARE = 0.4;

const counts = {
  authoredFacts: z.number().int().nonnegative(),
  authoredCitedFacts: z.number().int().positive(),
};

export const ownerSuggestionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }).strict(),
  z
    .object({
      state: z.literal('claimable'),
      userId: z.string().uuid(),
      displayName: z.string().nullable(),
      isViewer: z.boolean(),
      canConfirm: z.boolean(),
      canDismiss: z.boolean(),
      ...counts,
    })
    .strict(),
  z
    .object({
      state: z.literal('needs_link'),
      sourceKind: z.string().min(1).max(64),
      sourceLogin: z.string().max(64).nullable(),
      displayName: z.string().nullable(),
      canDismiss: z.boolean(),
      ...counts,
    })
    .strict(),
]);

export type OwnerSuggestion = z.infer<typeof ownerSuggestionSchema>;
