// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// Content-free per-team onboarding view (docs/product/onboarding-wikis.md Part A / Stage 1). Every
// field is org metadata — source-kind strings, ids, team/theme labels, member display names, link
// booleans — never customer content.

export const onboardingPersonGapSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    required: z.array(z.string()),
    linked: z.array(z.string()),
    gap: z.array(z.string()),
  })
  .strict();
export type OnboardingPersonGap = z.infer<typeof onboardingPersonGapSchema>;

export const onboardingPersonSchema = z.object({ userId: z.string(), name: z.string() }).strict();
export type OnboardingPerson = z.infer<typeof onboardingPersonSchema>;

export const onboardingThemeSchema = z.object({ id: z.string(), name: z.string() }).strict();
export type OnboardingTheme = z.infer<typeof onboardingThemeSchema>;

// Team-level onboarding-readiness rollup for a lead (docs/product/onboarding-wikis.md Stage 3).
// Box-tier only, content-free: member counts, aggregate missing source-kind strings, and per-member
// gaps (the same lead-only metadata as `memberGaps`) — never customer content, never a boundary crossing.
export const leadTeamReadinessSchema = z
  .object({
    team: z.object({ id: z.string(), name: z.string() }).strict(),
    memberCount: z.number().int().nonnegative(),
    readyCount: z.number().int().nonnegative(),
    gapCount: z.number().int().nonnegative(),
    missingSourceKinds: z.array(z.string()),
    // Sorted worst-first (most gaps) so a lead sees who to act on first.
    members: z.array(onboardingPersonGapSchema),
  })
  .strict();
export type LeadTeamReadiness = z.infer<typeof leadTeamReadinessSchema>;

export const leadReadinessSchema = z.object({ teams: z.array(leadTeamReadinessSchema) }).strict();
export type LeadReadiness = z.infer<typeof leadReadinessSchema>;

export const teamOnboardingViewSchema = z
  .object({
    team: z.object({ id: z.string(), name: z.string() }).strict(),
    // Whether the viewer is a lead of this team — gates the per-member setup state below.
    viewerIsLead: z.boolean(),
    tooling: z.array(z.string()),
    self: onboardingPersonGapSchema,
    // Per-member setup state, lead-only per-person onboarding metadata; null unless the viewer leads this team.
    memberGaps: z.array(onboardingPersonGapSchema).nullable(),
    keyThemes: z.array(onboardingThemeSchema),
    leads: z.array(onboardingPersonSchema),
  })
  .strict();
export type TeamOnboardingView = z.infer<typeof teamOnboardingViewSchema>;

export const IDENTITY_LINK_KINDS = ['github', 'slack', 'linear', 'notion'] as const;
export type IdentityLinkKind = (typeof IDENTITY_LINK_KINDS)[number];

// UNWIRED: github and linear identity links cannot complete yet.
export const LIVE_IDENTITY_LINK_KINDS = [
  'slack',
  'notion',
] as const satisfies readonly IdentityLinkKind[];

export const TEAM_TOOL_KINDS = [
  'github',
  'slack',
  'notion',
  'linear',
  'jira',
  'intercom',
  'confluence',
] as const;
export const teamToolKindSchema = z.enum(TEAM_TOOL_KINDS);
export type TeamToolKind = z.infer<typeof teamToolKindSchema>;

const isLiveIdentityLinkKind = (kind: string): boolean =>
  (LIVE_IDENTITY_LINK_KINDS as readonly string[]).includes(kind);

const storedTeamToolSchema = z
  .object({ sourceKind: teamToolKindSchema, mandatory: z.boolean() })
  .strict();

// A stored row may predate the live-kind rule, so only writes enforce it.
export const teamToolSchema = storedTeamToolSchema.refine(
  (tool) => !tool.mandatory || isLiveIdentityLinkKind(tool.sourceKind),
  {
    message: 'mandatory requires a live identity-link kind',
  },
);
export type TeamTool = z.infer<typeof teamToolSchema>;

export const teamToolsInputSchema = z
  .object({ tools: z.array(teamToolSchema).max(TEAM_TOOL_KINDS.length) })
  .strict()
  .refine((input) => new Set(input.tools.map((t) => t.sourceKind)).size === input.tools.length, {
    message: 'duplicate source kind',
  });
export type TeamToolsInput = z.infer<typeof teamToolsInputSchema>;

export const teamToolsSchema = z
  .object({ teamId: z.string().uuid(), tools: z.array(storedTeamToolSchema), canEdit: z.boolean() })
  .strict();
export type TeamTools = z.infer<typeof teamToolsSchema>;
