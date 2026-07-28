import { z } from 'zod';
export declare const membershipRoleSchema: z.ZodEnum<["owner", "admin", "member"]>;
export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export declare const membershipStatusSchema: z.ZodEnum<["active", "invited", "suspended"]>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export declare const teamVisibilitySchema: z.ZodEnum<["own", "company", "all"]>;
export type TeamVisibility = z.infer<typeof teamVisibilitySchema>;
export declare const accessGrantScopeSchema: z.ZodEnum<["full", "public", "partial"]>;
export type AccessGrantScope = z.infer<typeof accessGrantScopeSchema>;
export declare const inviteStatusSchema: z.ZodEnum<["pending", "accepted", "revoked"]>;
export type InviteStatus = z.infer<typeof inviteStatusSchema>;
/** Explicit acknowledgement captured when an admin selects the shared processing tier (shared-processing-tier §7/§8). */
export declare const coProcessingConsentInputSchema: z.ZodObject<{
    disclosureVersion: z.ZodString;
}, "strict", z.ZodTypeAny, {
    disclosureVersion: string;
}, {
    disclosureVersion: string;
}>;
export type CoProcessingConsentInput = z.infer<typeof coProcessingConsentInputSchema>;
/** Registered recovery pubkey + fingerprint for provenance verification (ADL #55). */
export declare const recoveryStatusSchema: z.ZodObject<{
    publicKeyHex: z.ZodNullable<z.ZodString>;
    fingerprint: z.ZodNullable<z.ZodString>;
    setAt: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    publicKeyHex: string | null;
    fingerprint: string | null;
    setAt: string | null;
}, {
    publicKeyHex: string | null;
    fingerprint: string | null;
    setAt: string | null;
}>;
export type RecoveryStatus = z.infer<typeof recoveryStatusSchema>;
export declare const memberViewSchema: z.ZodObject<{
    accountId: z.ZodString;
    email: z.ZodString;
    role: z.ZodEnum<["owner", "admin", "member"]>;
    status: z.ZodEnum<["active", "invited", "suspended"]>;
}, "strict", z.ZodTypeAny, {
    email: string;
    status: "active" | "invited" | "suspended";
    accountId: string;
    role: "owner" | "admin" | "member";
}, {
    email: string;
    status: "active" | "invited" | "suspended";
    accountId: string;
    role: "owner" | "admin" | "member";
}>;
export type MemberView = z.infer<typeof memberViewSchema>;
export declare const departmentViewSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    color: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    color: string | null;
    id: string;
    name: string;
}, {
    color: string | null;
    id: string;
    name: string;
}>;
export type DepartmentView = z.infer<typeof departmentViewSchema>;
export declare const teamViewSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    departmentId: z.ZodNullable<z.ZodString>;
    visibility: z.ZodEnum<["own", "company", "all"]>;
    adminAccountId: z.ZodNullable<z.ZodString>;
    adminEmail: z.ZodNullable<z.ZodString>;
    memberCount: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
    memberCount: number;
    departmentId: string | null;
    visibility: "own" | "company" | "all";
    adminAccountId: string | null;
    adminEmail: string | null;
}, {
    id: string;
    name: string;
    memberCount: number;
    departmentId: string | null;
    visibility: "own" | "company" | "all";
    adminAccountId: string | null;
    adminEmail: string | null;
}>;
export type TeamView = z.infer<typeof teamViewSchema>;
export declare const createTeamInputSchema: z.ZodObject<{
    name: z.ZodString;
    departmentId: z.ZodOptional<z.ZodString>;
    adminEmail: z.ZodOptional<z.ZodString>;
    visibility: z.ZodOptional<z.ZodEnum<["own", "company", "all"]>>;
}, "strict", z.ZodTypeAny, {
    name: string;
    departmentId?: string | undefined;
    visibility?: "own" | "company" | "all" | undefined;
    adminEmail?: string | undefined;
}, {
    name: string;
    departmentId?: string | undefined;
    visibility?: "own" | "company" | "all" | undefined;
    adminEmail?: string | undefined;
}>;
export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;
export declare const updateTeamInputSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    departmentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    adminEmail: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<["own", "company", "all"]>>;
}, "strict", z.ZodTypeAny, {
    name?: string | undefined;
    departmentId?: string | null | undefined;
    visibility?: "own" | "company" | "all" | undefined;
    adminEmail?: string | null | undefined;
}, {
    name?: string | undefined;
    departmentId?: string | null | undefined;
    visibility?: "own" | "company" | "all" | undefined;
    adminEmail?: string | null | undefined;
}>;
export type UpdateTeamInput = z.infer<typeof updateTeamInputSchema>;
export declare const accessGrantViewSchema: z.ZodObject<{
    viewerDepartmentId: z.ZodString;
    targetDepartmentId: z.ZodString;
    scope: z.ZodEnum<["full", "public", "partial"]>;
    partialTeamIds: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    viewerDepartmentId: string;
    targetDepartmentId: string;
    scope: "public" | "full" | "partial";
    partialTeamIds: string[];
}, {
    viewerDepartmentId: string;
    targetDepartmentId: string;
    scope: "public" | "full" | "partial";
    partialTeamIds: string[];
}>;
export type AccessGrantView = z.infer<typeof accessGrantViewSchema>;
export declare const accessMatrixSchema: z.ZodObject<{
    departments: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>, "many">;
    grants: z.ZodArray<z.ZodObject<{
        viewerDepartmentId: z.ZodString;
        targetDepartmentId: z.ZodString;
        scope: z.ZodEnum<["full", "public", "partial"]>;
        partialTeamIds: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        viewerDepartmentId: string;
        targetDepartmentId: string;
        scope: "public" | "full" | "partial";
        partialTeamIds: string[];
    }, {
        viewerDepartmentId: string;
        targetDepartmentId: string;
        scope: "public" | "full" | "partial";
        partialTeamIds: string[];
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    departments: {
        id: string;
        name: string;
    }[];
    grants: {
        viewerDepartmentId: string;
        targetDepartmentId: string;
        scope: "public" | "full" | "partial";
        partialTeamIds: string[];
    }[];
}, {
    departments: {
        id: string;
        name: string;
    }[];
    grants: {
        viewerDepartmentId: string;
        targetDepartmentId: string;
        scope: "public" | "full" | "partial";
        partialTeamIds: string[];
    }[];
}>;
export type AccessMatrix = z.infer<typeof accessMatrixSchema>;
export declare const setGrantInputSchema: z.ZodObject<{
    viewerDepartmentId: z.ZodString;
    targetDepartmentId: z.ZodString;
    scope: z.ZodUnion<[z.ZodEnum<["full", "public", "partial"]>, z.ZodLiteral<"none">]>;
    partialTeamIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    viewerDepartmentId: string;
    targetDepartmentId: string;
    scope: "public" | "full" | "partial" | "none";
    partialTeamIds?: string[] | undefined;
}, {
    viewerDepartmentId: string;
    targetDepartmentId: string;
    scope: "public" | "full" | "partial" | "none";
    partialTeamIds?: string[] | undefined;
}>;
export type SetGrantInput = z.infer<typeof setGrantInputSchema>;
export declare const connectorViewSchema: z.ZodObject<{
    kind: z.ZodString;
    connectedAt: z.ZodString;
    sourceUserId: z.ZodNullable<z.ZodString>;
    status: z.ZodLiteral<"connected">;
}, "strict", z.ZodTypeAny, {
    status: "connected";
    kind: string;
    sourceUserId: string | null;
    connectedAt: string;
}, {
    status: "connected";
    kind: string;
    sourceUserId: string | null;
    connectedAt: string;
}>;
export type ConnectorView = z.infer<typeof connectorViewSchema>;
/** Read-only Console Home aggregate: deployment status + roster/team/connector/invite counts (ADL #49). */
export declare const orgOverviewSchema: z.ZodObject<{
    org: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        slug: z.ZodNullable<z.ZodString>;
        plan: z.ZodString;
        trialEndsAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        name: string;
        slug: string | null;
        plan: string;
        trialEndsAt: string | null;
    }, {
        id: string;
        name: string;
        slug: string | null;
        plan: string;
        trialEndsAt: string | null;
    }>;
    deployment: z.ZodNullable<z.ZodObject<{
        provisioningStatus: z.ZodString;
        healthStatus: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        provisioningStatus: string;
        healthStatus: string;
    }, {
        provisioningStatus: string;
        healthStatus: string;
    }>>;
    counts: z.ZodObject<{
        members: z.ZodNumber;
        teams: z.ZodNumber;
        connectors: z.ZodNumber;
        pendingInvites: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        members: number;
        teams: number;
        connectors: number;
        pendingInvites: number;
    }, {
        members: number;
        teams: number;
        connectors: number;
        pendingInvites: number;
    }>;
}, "strict", z.ZodTypeAny, {
    org: {
        id: string;
        name: string;
        slug: string | null;
        plan: string;
        trialEndsAt: string | null;
    };
    deployment: {
        provisioningStatus: string;
        healthStatus: string;
    } | null;
    counts: {
        members: number;
        teams: number;
        connectors: number;
        pendingInvites: number;
    };
}, {
    org: {
        id: string;
        name: string;
        slug: string | null;
        plan: string;
        trialEndsAt: string | null;
    };
    deployment: {
        provisioningStatus: string;
        healthStatus: string;
    } | null;
    counts: {
        members: number;
        teams: number;
        connectors: number;
        pendingInvites: number;
    };
}>;
export type OrgOverview = z.infer<typeof orgOverviewSchema>;
//# sourceMappingURL=orgs.d.ts.map