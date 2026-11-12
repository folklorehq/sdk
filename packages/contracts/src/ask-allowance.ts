// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const ASK_USAGE_SURFACES = ['ask', 'agent'] as const;
export const askUsageSurfaceSchema = z.enum(ASK_USAGE_SURFACES);
export type AskUsageSurface = z.infer<typeof askUsageSurfaceSchema>;

/** A verified tenant user's answer or agent run; never model-supplied. */
export const askUsageSubjectSchema = z
  .object({ orgId: z.string().uuid(), userId: z.string().uuid(), surface: askUsageSurfaceSchema })
  .strict();
export type AskUsageSubject = z.infer<typeof askUsageSubjectSchema>;

export const ASK_LANES = ['normal', 'reduced', 'slow'] as const;
export type AskLane = (typeof ASK_LANES)[number];
export const ASK_LANE_SCOPES = ['user', 'workspace'] as const;
export type AskLaneScope = (typeof ASK_LANE_SCOPES)[number];
