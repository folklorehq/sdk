// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import type { MembershipRole } from './orgs.js';

// zod keeps the array it is given as `.options` and parses against it, so it must be frozen.
const WORKSPACE_PERMISSION_CATALOG = Object.freeze([
  'members.invite',
  'members.manage',
  'sources.manage',
  'directory.manage',
  'access.manage',
  'billing.manage',
] as const);

export const workspacePermissionSchema = z.enum(WORKSPACE_PERMISSION_CATALOG);
export type WorkspacePermission = z.infer<typeof workspacePermissionSchema>;
export const WORKSPACE_PERMISSIONS: readonly WorkspacePermission[] = WORKSPACE_PERMISSION_CATALOG;

export const workspacePresetSchema = z.enum(Object.freeze(['admin', 'member'] as const));
export type WorkspacePreset = z.infer<typeof workspacePresetSchema>;
export const workspacePresetLabelSchema = z.enum(
  Object.freeze(['admin', 'member', 'custom'] as const),
);
export type WorkspacePresetLabel = z.infer<typeof workspacePresetLabelSchema>;

export const WORKSPACE_PRESETS: Readonly<Record<WorkspacePreset, readonly WorkspacePermission[]>> =
  Object.freeze({
    admin: Object.freeze<WorkspacePermission[]>([
      'members.invite',
      'members.manage',
      'sources.manage',
      'directory.manage',
      'access.manage',
    ]),
    member: Object.freeze<WorkspacePermission[]>([]),
  });

// What the admin role could do before permissions existed: the floor for the admin label, not the admin preset.
const LEGACY_ADMIN_FLOOR: readonly WorkspacePermission[] = [
  'members.invite',
  'sources.manage',
  'directory.manage',
  'access.manage',
];

/** A caller's standing in one workspace: stored permissions plus whether they own it. */
export interface WorkspaceGrant {
  readonly isOwner: boolean;
  readonly permissions: readonly WorkspacePermission[];
}
export const NO_WORKSPACE_GRANT: WorkspaceGrant = Object.freeze({
  isOwner: false,
  permissions: Object.freeze<WorkspacePermission[]>([]),
});

/** Catalog order, duplicates and unknown strings dropped. */
export function normalizeWorkspacePermissions(values: readonly string[]): WorkspacePermission[] {
  const held = new Set(values);
  return WORKSPACE_PERMISSIONS.filter((permission) => held.has(permission));
}

/** The owner holds the whole catalog; anyone else holds what is stored. */
export function effectiveWorkspacePermissions(grant: WorkspaceGrant): WorkspacePermission[] {
  return grant.isOwner
    ? [...WORKSPACE_PERMISSIONS]
    : normalizeWorkspacePermissions(grant.permissions);
}

export function grantAllows(grant: WorkspaceGrant, permission: WorkspacePermission): boolean {
  return grant.isOwner || grant.permissions.includes(permission);
}

export function grantHoldsAll(
  grant: WorkspaceGrant,
  permissions: readonly WorkspacePermission[],
): boolean {
  return permissions.every((permission) => grantAllows(grant, permission));
}

export function hasConsoleAccess(grant: WorkspaceGrant): boolean {
  return grant.isOwner || grant.permissions.length > 0;
}

export function workspacePresetFor(
  permissions: readonly WorkspacePermission[],
): WorkspacePresetLabel {
  const held = normalizeWorkspacePermissions(permissions);
  const preset = workspacePresetSchema.options.find(
    (name) =>
      WORKSPACE_PRESETS[name].length === held.length &&
      WORKSPACE_PRESETS[name].every((permission) => held.includes(permission)),
  );
  return preset ?? 'custom';
}

/** The label old clients read; `admin` only for a holder of every pre-permission admin power. */
export function legacyRoleLabel(grant: WorkspaceGrant): MembershipRole {
  if (grant.isOwner) return 'owner';
  return grantHoldsAll(grant, LEGACY_ADMIN_FLOOR) ? 'admin' : 'member';
}

export function permissionsForLegacyRole(role: MembershipRole): WorkspacePermission[] {
  return role === 'member' ? [...WORKSPACE_PRESETS.member] : [...WORKSPACE_PRESETS.admin];
}
