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

export const TEAM_SUGGESTION_MIN_COUNTED_FACTS = 5;
export const TEAM_SUGGESTION_MIN_SHARE = 0.5;

export const teamOwnerSuggestionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }).strict(),
  z
    .object({
      state: z.literal('claimable'),
      teamId: z.string().uuid(),
      teamName: z.string(),
      scopedFacts: z.number().int().positive(),
      countedFacts: z.number().int().positive(),
      canConfirm: z.boolean(),
      canDismiss: z.boolean(),
    })
    .strict(),
]);

export type TeamOwnerSuggestion = z.infer<typeof teamOwnerSuggestionSchema>;
