// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const membershipRoleSchema = z.enum(['owner', 'admin', 'member']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const membershipStatusSchema = z.enum(['active', 'invited', 'suspended']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const teamVisibilitySchema = z.enum(['own', 'company', 'all']);
export type TeamVisibility = z.infer<typeof teamVisibilitySchema>;

export const accessGrantScopeSchema = z.enum(['full', 'public', 'partial']);
export type AccessGrantScope = z.infer<typeof accessGrantScopeSchema>;

export const inviteStatusSchema = z.enum(['pending', 'accepted', 'revoked']);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export const emailDeliverySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('sent'), provider: z.literal('resend') }).strict(),
  z.object({ status: z.literal('logged'), reason: z.literal('resend_unconfigured') }).strict(),
  z.object({ status: z.literal('failed'), reason: z.literal('provider_error') }).strict(),
]);
export type EmailDelivery = z.infer<typeof emailDeliverySchema>;

export const orgInviteContextSchema = z
  .object({
    orgName: z.string(),
    email: z.string(),
    role: membershipRoleSchema,
    status: inviteStatusSchema,
    isExpired: z.boolean(),
  })
  .strict();
export type OrgInviteContext = z.infer<typeof orgInviteContextSchema>;

// Session-gated pending-invite listing (`GET /v1/invites/pending`): opaque ids, never the one-time
// token; email matching is enforced server-side against the session's `accountEmail`.
export const pendingOrgInviteSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    orgName: z.string(),
    role: membershipRoleSchema,
  })
  .strict();
export type PendingOrgInvite = z.infer<typeof pendingOrgInviteSchema>;

export const pendingBetaInviteSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string(),
  })
  .strict();
export type PendingBetaInvite = z.infer<typeof pendingBetaInviteSchema>;

export const pendingInvitesSchema = z
  .object({
    orgInvites: z.array(pendingOrgInviteSchema),
    betaInvite: pendingBetaInviteSchema.nullable(),
  })
  .strict();
export type PendingInvites = z.infer<typeof pendingInvitesSchema>;

export const provisioningStateSchema = z.enum(['pending', 'provisioning', 'provisioned', 'failed']);
export type ProvisioningState = z.infer<typeof provisioningStateSchema>;

export const provisioningFailureCodeSchema = z.enum([
  'provisioner_failed',
  'attestation_unavailable',
  'attestation_mismatch',
]);
export type ProvisioningFailureCode = z.infer<typeof provisioningFailureCodeSchema>;

// The response body carries `AppError.code` — the taxonomy bucket (`not_found`, `rate_limit`) — so
// the specific cause rides a separate `reason` field. Defined once here because the control plane
// throws these and the console branches on them; two inline copies is how the two sides drift.
export const provisioningRefusalReasonSchema = z.enum([
  'organization_not_found',
  'provisioning_not_invited',
  'provisioning_build_in_progress',
  'provisioning_fleet_full',
]);
export type ProvisioningRefusalReason = z.infer<typeof provisioningRefusalReasonSchema>;

export const PROVISIONING_REFUSAL_REASON = {
  organizationNotFound: 'organization_not_found',
  notInvited: 'provisioning_not_invited',
  buildInProgress: 'provisioning_build_in_progress',
  fleetFull: 'provisioning_fleet_full',
} as const satisfies Record<string, ProvisioningRefusalReason>;

export const orgCreationRefusalReasonSchema = z.enum(['organization_quota_exceeded']);
export type OrgCreationRefusalReason = z.infer<typeof orgCreationRefusalReasonSchema>;

export const ORG_CREATION_REFUSAL_REASON = {
  quotaExceeded: 'organization_quota_exceeded',
} as const satisfies Record<string, OrgCreationRefusalReason>;

export const provisionOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    state: provisioningStateSchema,
    failureCode: provisioningFailureCodeSchema.nullable(),
  })
  .strict();
export type ProvisionOperation = z.infer<typeof provisionOperationSchema>;

export const provisioningStatusSchema = provisionOperationSchema
  .extend({ readyAt: z.string().datetime().nullable() })
  .strict();
export type ProvisioningStatus = z.infer<typeof provisioningStatusSchema>;

export const provisioningPhaseSchema = z.enum([
  'pending',
  'provisioning',
  'verifying',
  'ready',
  'failed',
]);
export type ProvisioningPhase = z.infer<typeof provisioningPhaseSchema>;

export function phaseForProvisioningStatus(status: ProvisioningStatus): ProvisioningPhase {
  if (status.state === 'provisioned') return status.readyAt ? 'ready' : 'verifying';
  return status.state;
}

export const recoveryKeyRegistrationInputSchema = z
  .object({
    publicKeyHex: z.string().regex(/^[0-9a-fA-F]{64}$/),
    fingerprint: z.string().regex(/^[0-9a-f]{4}(?:-[0-9a-f]{4}){3}$/),
  })
  .strict();
export type RecoveryKeyRegistrationInput = z.infer<typeof recoveryKeyRegistrationInputSchema>;

/** Explicit acknowledgement captured when an admin selects the shared processing tier (shared-processing-tier §7/§8). */
export const coProcessingConsentInputSchema = z.object({ disclosureVersion: z.string() }).strict();
export type CoProcessingConsentInput = z.infer<typeof coProcessingConsentInputSchema>;

/** Registered recovery pubkey + fingerprint for provenance verification. */
export const recoveryStatusSchema = z
  .object({
    publicKeyHex: z.string().nullable(),
    fingerprint: z.string().nullable(),
    version: z.number().int().positive().nullable(),
    setAt: z.string().nullable(),
  })
  .strict();
export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>;

export const memberViewSchema = z
  .object({
    accountId: z.string(),
    email: z.string(),
    role: membershipRoleSchema,
    status: membershipStatusSchema,
  })
  .strict();
export type MemberView = z.infer<typeof memberViewSchema>;

export const departmentViewSchema = z
  .object({ id: z.string(), name: z.string(), color: z.string().nullable() })
  .strict();
export type DepartmentView = z.infer<typeof departmentViewSchema>;

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
export type TeamView = z.infer<typeof teamViewSchema>;

export const createTeamInputSchema = z
  .object({
    name: z.string(),
    departmentId: z.string().optional(),
    adminEmail: z.string().optional(),
    visibility: teamVisibilitySchema.optional(),
  })
  .strict();
export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

export const updateTeamInputSchema = z
  .object({
    name: z.string().optional(),
    departmentId: z.string().nullable().optional(),
    adminEmail: z.string().nullable().optional(),
    visibility: teamVisibilitySchema.optional(),
  })
  .strict();
export type UpdateTeamInput = z.infer<typeof updateTeamInputSchema>;

export const accessGrantViewSchema = z
  .object({
    viewerDepartmentId: z.string(),
    targetDepartmentId: z.string(),
    scope: accessGrantScopeSchema,
    partialTeamIds: z.array(z.string()),
  })
  .strict();
export type AccessGrantView = z.infer<typeof accessGrantViewSchema>;

export const accessMatrixSchema = z
  .object({
    departments: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    grants: z.array(accessGrantViewSchema),
  })
  .strict();
export type AccessMatrix = z.infer<typeof accessMatrixSchema>;

export const setGrantInputSchema = z
  .object({
    viewerDepartmentId: z.string(),
    targetDepartmentId: z.string(),
    scope: z.union([accessGrantScopeSchema, z.literal('none')]),
    partialTeamIds: z.array(z.string()).optional(),
  })
  .strict();
export type SetGrantInput = z.infer<typeof setGrantInputSchema>;

export const connectorViewSchema = z
  .object({
    kind: z.string(),
    connectedAt: z.string(),
    sourceUserId: z.string().nullable(),
    status: z.literal('connected'),
  })
  .strict();
export type ConnectorView = z.infer<typeof connectorViewSchema>;

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
      .object({
        provisioningStatus: z.string(),
        healthStatus: z.string(),
        /** Last enclave check-in; null until the enclave has ever reported in. */
        lastSeenAt: z.string().nullable(),
      })
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
export type OrgOverview = z.infer<typeof orgOverviewSchema>;
