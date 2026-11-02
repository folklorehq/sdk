// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { AUTHOR_EMAIL_SUGGESTION_KINDS } from './onboarding.js';

type AuthorSuggestionKind = (typeof AUTHOR_EMAIL_SUGGESTION_KINDS)[number];

// z.enum throws on an empty tuple, so a manifest set with no opted-in kind must not break module load.
const authorSuggestionKindSchema: z.ZodType<AuthorSuggestionKind> =
  AUTHOR_EMAIL_SUGGESTION_KINDS.length > 0 ? z.enum(AUTHOR_EMAIL_SUGGESTION_KINDS) : z.never();

export const identitySuggestionSchema = z
  .object({
    id: z.string().uuid(),
    kind: authorSuggestionKindSchema,
    displayName: z.string(),
  })
  .strict();
export type IdentitySuggestion = z.infer<typeof identitySuggestionSchema>;

export const identitySuggestionsResponseSchema = z
  .object({ suggestions: z.array(identitySuggestionSchema) })
  .strict();
export type IdentitySuggestionsResponse = z.infer<typeof identitySuggestionsResponseSchema>;

export const IDENTITY_SUGGESTIONS_PATH = '/api/v1/me/identity-suggestions';
export const IDENTITY_SUGGESTION_DECISION_VERBS = ['confirm', 'dismiss'] as const;
export type IdentitySuggestionDecisionVerb = (typeof IDENTITY_SUGGESTION_DECISION_VERBS)[number];
