// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { sensitivityLevelSchema } from './enclave.js';

export const AUDIENCE_NAME_MAX_LENGTH = 60;
export const CUSTOM_AUDIENCE_LIMIT = 5;
// Nothing above Internal is readable on any theme until custom audiences can own pages.
export const CUSTOM_AUDIENCE_CEILINGS = ['public', 'team_scoped'] as const;
export const AUDIENCE_MEMBERS_MAX = 1000;
export const AUDIENCE_PEOPLE_RESULTS_MAX = 25;
export const AUDIENCE_PEOPLE_QUERY_MAX_LENGTH = 100;

export const AUDIENCE_ADMIN_REFUSALS = [
  'not_editable',
  'name_taken',
  'name_reserved',
  'limit_reached',
  'ceiling_not_available',
  'person_not_eligible',
] as const;
export type AudienceAdminRefusal = (typeof AUDIENCE_ADMIN_REFUSALS)[number];

export const audienceKindSchema = z.enum(['everyone', 'new_hires', 'custom', 'synced']);
export type AudienceKind = z.infer<typeof audienceKindSchema>;

export const adminAudienceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    kind: audienceKindSchema,
    maxSensitivity: sensitivityLevelSchema,
    memberCount: z.number().int().nonnegative().nullable(), // null for the open new-hire lens
    editable: z.boolean(),
  })
  .strict();
export type AdminAudience = z.infer<typeof adminAudienceSchema>;

export const adminAudienceListSchema = z
  .object({ audiences: z.array(adminAudienceSchema), customLimit: z.number().int().positive() })
  .strict();
export type AdminAudienceList = z.infer<typeof adminAudienceListSchema>;

const audienceNameSchema = z.string().trim().min(1).max(AUDIENCE_NAME_MAX_LENGTH);

export const audienceWriteRequestSchema = z
  .object({ name: audienceNameSchema, maxSensitivity: sensitivityLevelSchema })
  .strict();
export type AudienceWriteRequest = z.infer<typeof audienceWriteRequestSchema>;

export const audiencePersonSchema = z
  .object({ userId: z.string().uuid(), name: z.string(), email: z.string().nullable() })
  .strict();
export type AudiencePerson = z.infer<typeof audiencePersonSchema>;

export const audienceMembersSchema = z
  .object({ members: z.array(audiencePersonSchema), truncated: z.boolean() })
  .strict();
export type AudienceMembers = z.infer<typeof audienceMembersSchema>;

export const audiencePeopleQuerySchema = z
  .object({ query: z.string().trim().min(1).max(AUDIENCE_PEOPLE_QUERY_MAX_LENGTH).optional() })
  .strict();
export const audiencePeopleSchema = z.object({ people: z.array(audiencePersonSchema) }).strict();
export type AudiencePeople = z.infer<typeof audiencePeopleSchema>;

export const audienceIdParamsSchema = z.object({ audienceId: z.string().uuid() }).strict();
export const audienceMemberParamsSchema = z
  .object({ audienceId: z.string().uuid(), userId: z.string().uuid() })
  .strict();
