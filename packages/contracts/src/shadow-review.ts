// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const SHADOW_ARMS = ['R', 'B'] as const;
export const shadowArmSchema = z.enum(SHADOW_ARMS);
export type ShadowArm = z.infer<typeof shadowArmSchema>;

export const SHADOW_LARGE_PAGE_FACTS = 43;

const verdictChoiceSchema = z.enum(['left', 'right', 'tie']);

export const shadowVerdictSchema = z
  .object({
    accuracy: verdictChoiceSchema,
    coverage: verdictChoiceSchema,
    clarity: verdictChoiceSchema,
    citations: verdictChoiceSchema,
    falseLeft: z.boolean(),
    falseRight: z.boolean(),
  })
  .strict();
export type ShadowVerdict = z.infer<typeof shadowVerdictSchema>;

export const shadowReviewQuerySchema = z.object({ arm: shadowArmSchema }).strict();

const shadowSideSchema = z.object({ body: z.string() }).strict();

export const shadowPairSchema = z
  .object({
    variantId: z.string().uuid(),
    arm: shadowArmSchema,
    left: shadowSideSchema,
    right: shadowSideSchema,
  })
  .strict();
export type ShadowPair = z.infer<typeof shadowPairSchema>;

export const shadowReviewDoneSchema = z.object({ done: z.literal(true) }).strict();

export const shadowNextResponseSchema = z.union([shadowPairSchema, shadowReviewDoneSchema]);
export type ShadowNextResponse = z.infer<typeof shadowNextResponseSchema>;
