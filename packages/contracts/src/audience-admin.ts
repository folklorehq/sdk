// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { sensitivityLevelSchema } from './enclave.js';

export const AUDIENCE_NAME_MAX_LENGTH = 60;
export const CUSTOM_AUDIENCE_LIMIT = 5;
// Nothing above Internal is readable on any theme until custom audiences can own pages.
export const CUSTOM_AUDIENCE_CEILINGS = ['public', 'team_scoped'] as const;
export const AUDIENCE_MEMBERS_MAX = 1000;
export const AUDIENCE_PEOPLE_RESULTS_MAX = 25;
// 503 error code when an org's admin membership reads and saves are all in flight.
export const AUDIENCE_MEMBERSHIP_BUSY_CODE = 'audience_membership_busy';
export const AUDIENCE_PEOPLE_QUERY_MAX_LENGTH = 100;

export const AUDIENCE_ADMIN_REFUSALS = [
  'not_editable',
  'name_taken',
  'name_reserved',
  'limit_reached',
  'ceiling_not_available',
  'person_not_eligible',
  'access_not_confirmed',
  'rule_type_not_offered',
  'rule_operand_invalid',
  'rule_linked_only_narrows',
  'rule_operand_not_in_org',
  'rule_audience_not_allowed',
  'rule_cycle',
  'rule_audience_nested',
  'rule_too_slow',
  'audience_named_by_team_doc',
] as const;
export type AudienceAdminRefusal = (typeof AUDIENCE_ADMIN_REFUSALS)[number];
export const ACCESS_NOT_CONFIRMED = 'access_not_confirmed' satisfies AudienceAdminRefusal;

export const audienceKindSchema = z.enum(['everyone', 'new_hires', 'custom', 'synced']);
export type AudienceKind = z.infer<typeof audienceKindSchema>;

export const adminAudienceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    kind: audienceKindSchema,
    maxSensitivity: sensitivityLevelSchema,
    memberCount: z.number().int().nonnegative().nullable(), // null for the open new-hire lens, or a rule audience whose count timed out
    editable: z.boolean(),
  })
  .strict();
export type AdminAudience = z.infer<typeof adminAudienceSchema>;

export const adminAudienceListSchema = z
  .object({
    audiences: z.array(adminAudienceSchema),
    customLimit: z.number().int().positive(),
    departmentMovesHeld: z.number().int().nonnegative().optional(),
    heldMoveApprovalNoop: z.boolean().optional(),
  })
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

export const audienceMemberSchema = audiencePersonSchema
  .extend({ addedByHand: z.boolean() })
  .strict();
export type AudienceMember = z.infer<typeof audienceMemberSchema>;

export const audienceMembersSchema = z
  .object({ members: z.array(audienceMemberSchema), truncated: z.boolean() })
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

export const AUDIENCE_RULE_KINDS = [
  'email_domain',
  'person',
  'in_audience',
  'team',
  'leads_team',
  'workspace_role',
  'joined',
  'has_linked',
] as const;
export type AudienceRuleKind = (typeof AUDIENCE_RULE_KINDS)[number];
// A kind is offered only once the tenant holds the data it reads.
export const OFFERED_AUDIENCE_RULE_KINDS = [
  'email_domain',
  'person',
  'in_audience',
] as const satisfies readonly AudienceRuleKind[];
export const AUDIENCE_RULE_OPERATORS = {
  email_domain: ['is', 'is_not'],
  person: ['is_one_of', 'is_not_one_of'],
  in_audience: ['is_in', 'is_not_in'],
  team: ['is', 'is_not', 'is_under', 'is_not_under'],
  leads_team: ['any_team', 'team_is', 'team_is_under'],
  workspace_role: ['is'],
  joined: ['less_than_days', 'more_than_days', 'between'],
  has_linked: ['any_of', 'all_of'],
} as const satisfies Record<AudienceRuleKind, readonly string[]>;
// A member can make these true themselves, so they only narrow a line.
export const NARROWING_ONLY_RULE_KINDS = [
  'has_linked',
] as const satisfies readonly AudienceRuleKind[];
export const GRANTING_RULE_OPERATORS = ['is', 'is_one_of', 'is_in'] as const;
export const AUDIENCE_RULE_EFFECTS = ['include', 'except'] as const;
// These bound one (user, audience) evaluation to 160 condition lookups; the table CHECK enforces the first three.
export const AUDIENCE_RULE_LINES_MAX = 10;
export const AUDIENCE_RULE_CONDITIONS_MAX = 4;
export const AUDIENCE_RULE_OPERANDS_MAX = 50;
export const AUDIENCE_RULE_TARGETS_MAX = 3;
export const AUDIENCE_RULE_OPERAND_MAX_LENGTH = 253;
const AUDIENCE_RULE_WORD_MAX_LENGTH = 32;

export const audienceRuleConditionSchema = z
  .object({
    kind: z.string().min(1).max(AUDIENCE_RULE_WORD_MAX_LENGTH),
    operator: z.string().min(1).max(AUDIENCE_RULE_WORD_MAX_LENGTH),
    operands: z
      .array(z.string().min(1).max(AUDIENCE_RULE_OPERAND_MAX_LENGTH))
      .min(1)
      .max(AUDIENCE_RULE_OPERANDS_MAX),
  })
  .strict();
export type AudienceRuleCondition = z.infer<typeof audienceRuleConditionSchema>;
export const audienceRuleLineSchema = z
  .object({
    effect: z.enum(AUDIENCE_RULE_EFFECTS),
    conditions: z.array(audienceRuleConditionSchema).min(1).max(AUDIENCE_RULE_CONDITIONS_MAX),
  })
  .strict();
export type AudienceRuleLine = z.infer<typeof audienceRuleLineSchema>;
export const audienceRulesSchema = z
  .object({ lines: z.array(audienceRuleLineSchema).max(AUDIENCE_RULE_LINES_MAX) })
  .strict();
export type AudienceRules = z.infer<typeof audienceRulesSchema>;
export const audienceRulesViewSchema = z
  .object({ lines: z.array(audienceRuleLineSchema), people: z.array(audiencePersonSchema) })
  .strict();
export type AudienceRulesView = z.infer<typeof audienceRulesViewSchema>;
export const audienceRulePreviewSchema = z
  .object({
    matches: z.number().int().nonnegative(),
    members: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
  })
  .strict();
export type AudienceRulePreview = z.infer<typeof audienceRulePreviewSchema>;
