// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { onboardingPersonSchema } from './onboarding.js';

export const MAX_ORG_TEAMS = 500;
export const MAX_TEAM_LEADS = 3;

export const orgTeamSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    parentId: z.string().min(1).nullable(),
    memberCount: z.number().int().nonnegative(),
    leads: z.array(onboardingPersonSchema).max(MAX_TEAM_LEADS),
  })
  .strict();
export type OrgTeam = z.infer<typeof orgTeamSchema>;

export const orgTeamsResponseSchema = z
  .object({
    teams: z.array(orgTeamSchema).max(MAX_ORG_TEAMS),
    truncated: z.boolean(),
  })
  .strict();
export type OrgTeamsResponse = z.infer<typeof orgTeamsResponseSchema>;
