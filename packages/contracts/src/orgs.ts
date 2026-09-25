// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const membershipRoleSchema = z.enum(['owner', 'admin', 'member']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const workspaceAccessSchema = z
  .object({
    orgId: z.string().uuid(),
    name: z.string(),
    slug: z.string().nullable(),
    role: membershipRoleSchema,
    appAvailable: z.boolean(),
  })
  .strict();
export type WorkspaceAccess = z.infer<typeof workspaceAccessSchema>;

export const workspaceAccessResponseSchema = z
  .object({
    workspaceAccesses: z.array(workspaceAccessSchema),
  })
  .strict();
export type WorkspaceAccessResponse = z.infer<typeof workspaceAccessResponseSchema>;

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

export const provisioningBlockerSchema = z.enum(['placement_required']);
export type ProvisioningBlocker = z.infer<typeof provisioningBlockerSchema>;

export const PROVISIONING_BLOCKER = {
  placementRequired: 'placement_required',
} as const satisfies Record<string, ProvisioningBlocker>;

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

/*
  Platform fixtures (migration 0107). Some rows in `organizations` are not a customer's
  workspace: they are the platform running itself. The commissioning tenant
  (`3e083ed2-433c-4798-ae11-a656c9de08ee`) was created as an ordinary row owned by the operator's
  own account, with the dogfood pool's tenant binding and 48 pool-provisioning operations hanging
  off it, which is why "delete my own workspace" was an operator action against live ledgers and
  why no user could clear their account (#1945).

  `platform_role` is the mark that separates the two. It is NULL for every customer workspace and
  set for a platform fixture, so every user-facing list can exclude platform infrastructure with one
  predicate and every user-initiated flow can refuse by name.
*/
export const platformTenantRoleSchema = z.enum(['commissioning']);
export type PlatformTenantRole = z.infer<typeof platformTenantRoleSchema>;

export const PLATFORM_TENANT_ROLE = {
  commissioning: 'commissioning',
} as const satisfies Record<string, PlatformTenantRole>;

/*
  One code per refusal, because the console renders different copy for each and support triages on
  them. `confirmation_mismatch` mirrors `delete_tenant_data`'s wrong-tenant guard: a delete request
  must echo the exact target, so a mis-routed request cannot destroy the wrong workspace.
*/
export const workspaceDeletionRefusalReasonSchema = z.enum([
  'workspace_deletion_not_found',
  'workspace_deletion_forbidden',
  'workspace_deletion_confirmation_mismatch',
  'workspace_deletion_platform_tenant',
  'workspace_deletion_live_deployment',
  'workspace_deletion_pool_binding',
  'workspace_deletion_placement_claim_unreleased',
  'workspace_deletion_placement_claim_unverified',
  'workspace_deletion_retained_reference',
]);
export type WorkspaceDeletionRefusalReason = z.infer<typeof workspaceDeletionRefusalReasonSchema>;

export const WORKSPACE_DELETION_REFUSAL_REASON = {
  notFound: 'workspace_deletion_not_found',
  forbidden: 'workspace_deletion_forbidden',
  confirmationMismatch: 'workspace_deletion_confirmation_mismatch',
  platformTenant: 'workspace_deletion_platform_tenant',
  liveDeployment: 'workspace_deletion_live_deployment',
  poolBinding: 'workspace_deletion_pool_binding',
  placementClaimUnreleased: 'workspace_deletion_placement_claim_unreleased',
  placementClaimUnverified: 'workspace_deletion_placement_claim_unverified',
  retainedReference: 'workspace_deletion_retained_reference',
} as const satisfies Record<string, WorkspaceDeletionRefusalReason>;

export const accountDeletionRefusalReasonSchema = z.enum([
  'account_deletion_not_found',
  'account_deletion_confirmation_mismatch',
  'account_deletion_workspace_blocked',
]);
export type AccountDeletionRefusalReason = z.infer<typeof accountDeletionRefusalReasonSchema>;

export const ACCOUNT_DELETION_REFUSAL_REASON = {
  notFound: 'account_deletion_not_found',
  confirmationMismatch: 'account_deletion_confirmation_mismatch',
  workspaceBlocked: 'account_deletion_workspace_blocked',
} as const satisfies Record<string, AccountDeletionRefusalReason>;

export const provisionOperationSchema = z
  .object({
    operationId: z.string().uuid(),
    state: provisioningStateSchema,
    failureCode: provisioningFailureCodeSchema.nullable(),
  })
  .strict();
export type ProvisionOperation = z.infer<typeof provisionOperationSchema>;

const commissioningProvisioningDeploymentStateSchema = z
  .object({
    id: z.string().min(1),
    orgId: z.string().uuid(),
    accountId: z.string().uuid(),
    version: z.string().min(1),
    healthStatus: z.string().min(1),
    licenseStatus: z.string().min(1),
    mode: z.literal('managed'),
    region: z.string().min(1),
    tier: z.string().min(1),
    provisioningStatus: z.literal('pending'),
    provisioningPhase: z.literal('metadata'),
    provisionOperationId: z.string().uuid(),
    recoveryKeyVersion: z.number().int().positive(),
    recoveryKeyFingerprint: z.string().min(1),
    recoveryPubkey: z.string().min(1),
    lastSeenAt: z.null(),
    prerequisiteGeneration: z.null(),
    agentTokenHash: z.null(),
    agentCheckinTokenHash: z.null(),
    expectedSourceSha: z.null(),
    expectedEifSha256: z.null(),
    expectedPcr0: z.null(),
    enclaveArtifactKey: z.null(),
    provisioningStartedAt: z.null(),
    provisioningCompletedAt: z.null(),
    provisioningFailedAt: z.null(),
    provisioningFailureCode: z.null(),
    readyAt: z.null(),
    // Normally null. A stale commissioning claim may carry the exact pool pointer written by its
    // sole terminal failed assignment so the recovery POST can fence and clear that pointer.
    sharedEnclaveId: z.string().min(1).nullable(),
    instanceId: z.null(),
    enclaveRoleArn: z.null(),
    bootManifestHash: z.null(),
    bootManifestGeneration: z.null(),
    bootManifestSignerKeyId: z.null(),
    attestationGeneration: z.null(),
    attestationSessionKeySha256: z.null(),
    attestationValidUntil: z.null(),
    responseEncryptionPublicKeyHex: z.null(),
    ingestPublicKeyHex: z.null(),
  })
  .strict();

export const commissioningProvisioningPreconditionSchema = z
  .object({
    version: z.literal(1),
    orgId: z.string().uuid(),
    ownerAccountId: z.string().uuid(),
    operationId: z.string().uuid(),
    deploymentId: z.string().min(1),
    expectedDeployment: commissioningProvisioningDeploymentStateSchema,
    zeroCheckinProof: z.object({ generation: z.literal(0), count: z.literal(0) }).strict(),
  })
  .strict();
export type CommissioningProvisioningPrecondition = z.infer<
  typeof commissioningProvisioningPreconditionSchema
>;

export const commissioningProvisioningStatusSchema = z
  .object({
    tenantDeploymentId: z.string().min(1),
    assignmentId: z.string().min(1),
    poolDeploymentId: z.string().min(1),
    assignmentWire: z.literal('SignedAssignmentManifestV4'),
    assignmentPayload: z.literal('AssignmentManifestV4Payload'),
    manifestGeneration: z.number().int().positive(),
    manifestDigest: z.string().regex(/^[0-9a-f]{64}$/),
    policyVerificationVersion: z.literal(1),
    verifiedTenantCount: z.number().int().nonnegative(),
    policyVerificationDigest: z.string().regex(/^[0-9a-f]{64}$/),
    routeReady: z.boolean(),
  })
  .strict();
export type CommissioningProvisioningStatus = z.infer<typeof commissioningProvisioningStatusSchema>;

export const provisioningStatusSchema = provisionOperationSchema
  .extend({
    readyAt: z.string().datetime().nullable(),
    commissioning: commissioningProvisioningStatusSchema.nullable().default(null),
    blocker: provisioningBlockerSchema.nullable().default(null),
  })
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
export type ProvisioningDisplayPhase = ProvisioningPhase | 'placementRequired';

export function phaseForProvisioningStatus(status: ProvisioningStatus): ProvisioningDisplayPhase {
  if (status.blocker === PROVISIONING_BLOCKER.placementRequired) return 'placementRequired';
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
    realtime: z
      .object({
        registrationStatus: z.enum(['pending', 'registered', 'degraded']),
        expiresAt: z.string().nullable(),
        lastSucceededAt: z.string().nullable(),
        lastDeliveryAt: z.string().nullable(),
      })
      .strict()
      .optional(),
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
