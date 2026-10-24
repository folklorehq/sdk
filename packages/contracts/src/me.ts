// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// A non-empty id: the box reserves the empty string for its own all-members lens sentinel,
// so a server-sent empty id would collide with "no audience selected".
export const meAudienceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
  })
  .strict();
export type MeAudience = z.infer<typeof meAudienceSchema>;

export const meTeamSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    isLead: z.boolean(),
  })
  .strict();
export type MeTeam = z.infer<typeof meTeamSchema>;

export const meProfileSchema = z
  .object({
    userId: z.string(),
    email: z.string().nullable(),
    name: z.string(),
    initials: z.string(),
    orgName: z.string(),
    audiences: z.array(meAudienceSchema),
    // Optional: an older API or a rollback omits it.
    teams: z.array(meTeamSchema).optional(),
  })
  .strict();
export type MeProfile = z.infer<typeof meProfileSchema>;

export const audienceLensIdSchema = z.string().toLowerCase().uuid();
