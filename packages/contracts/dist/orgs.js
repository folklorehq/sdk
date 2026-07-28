// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
export const membershipRoleSchema = z.enum(['owner', 'admin', 'member']);
export const membershipStatusSchema = z.enum(['active', 'invited', 'suspended']);
export const teamVisibilitySchema = z.enum(['own', 'company', 'all']);
export const accessGrantScopeSchema = z.enum(['full', 'public', 'partial']);
export const inviteStatusSchema = z.enum(['pending', 'accepted', 'revoked']);
/** Explicit acknowledgement captured when an admin selects the shared processing tier (shared-processing-tier §7/§8). */
export const coProcessingConsentInputSchema = z.object({ disclosureVersion: z.string() }).strict();
/** Registered recovery pubkey + fingerprint for provenance verification. */
export const recoveryStatusSchema = z
    .object({
    publicKeyHex: z.string().nullable(),
    fingerprint: z.string().nullable(),
    setAt: z.string().nullable(),
})
    .strict();
export const memberViewSchema = z
    .object({
    accountId: z.string(),
    email: z.string(),
    role: membershipRoleSchema,
    status: membershipStatusSchema,
})
    .strict();
export const departmentViewSchema = z
    .object({ id: z.string(), name: z.string(), color: z.string().nullable() })
    .strict();
export const teamViewSchema = z
    .object({
    id: z.string(),
    name: z.string(),
    departmentId: z.string().nullable(),
    visibility: teamVisibilitySchema,
    adminAccountId: z.string().nullable(),
    adminEmail: z.string().nullable(),
    memberCount: z.number(),
})
    .strict();
export const createTeamInputSchema = z
    .object({
    name: z.string(),
    departmentId: z.string().optional(),
    adminEmail: z.string().optional(),
    visibility: teamVisibilitySchema.optional(),
})
    .strict();
export const updateTeamInputSchema = z
    .object({
    name: z.string().optional(),
    departmentId: z.string().nullable().optional(),
    adminEmail: z.string().nullable().optional(),
    visibility: teamVisibilitySchema.optional(),
})
    .strict();
export const accessGrantViewSchema = z
    .object({
    viewerDepartmentId: z.string(),
    targetDepartmentId: z.string(),
    scope: accessGrantScopeSchema,
    partialTeamIds: z.array(z.string()),
})
    .strict();
export const accessMatrixSchema = z
    .object({
    departments: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    grants: z.array(accessGrantViewSchema),
})
    .strict();
export const setGrantInputSchema = z
    .object({
    viewerDepartmentId: z.string(),
    targetDepartmentId: z.string(),
    scope: z.union([accessGrantScopeSchema, z.literal('none')]),
    partialTeamIds: z.array(z.string()).optional(),
})
    .strict();
export const connectorViewSchema = z
    .object({
    kind: z.string(),
    connectedAt: z.string(),
    sourceUserId: z.string().nullable(),
    status: z.literal('connected'),
})
    .strict();
/** Read-only Console Home aggregate: deployment status + roster/team/connector/invite counts. */
export const orgOverviewSchema = z
    .object({
    org: z
        .object({
        id: z.string(),
        name: z.string(),
        slug: z.string().nullable(),
        plan: z.string(),
        trialEndsAt: z.string().nullable(),
    })
        .strict(),
    deployment: z
        .object({ provisioningStatus: z.string(), healthStatus: z.string() })
        .strict()
        .nullable(),
    counts: z
        .object({
        members: z.number(),
        teams: z.number(),
        connectors: z.number(),
        pendingInvites: z.number(),
    })
        .strict(),
})
    .strict();
//# sourceMappingURL=orgs.js.map