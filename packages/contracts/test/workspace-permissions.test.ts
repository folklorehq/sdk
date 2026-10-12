// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  NO_WORKSPACE_GRANT,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_PRESETS,
  effectiveWorkspacePermissions,
  grantAllows,
  grantHoldsAll,
  hasConsoleAccess,
  legacyRoleLabel,
  normalizeWorkspacePermissions,
  permissionsForLegacyRole,
  workspacePermissionSchema,
  workspacePresetFor,
  workspacePresetSchema,
  type WorkspacePermission,
} from '../src/workspace-permissions.js';

const ADMIN_WITHOUT_MEMBER_MANAGEMENT: WorkspacePermission[] = [
  'members.invite',
  'sources.manage',
  'directory.manage',
  'access.manage',
];

describe('workspace permission catalog', () => {
  it('holds exactly the six permission names in catalog order', () => {
    expect(WORKSPACE_PERMISSIONS).toEqual([
      'members.invite',
      'members.manage',
      'sources.manage',
      'directory.manage',
      'access.manage',
      'billing.manage',
    ]);
  });

  it('rejects a name outside the catalog', () => {
    expect(workspacePermissionSchema.safeParse('bogus').success).toBe(false);
  });

  it('refuses to grow the catalog, so the schema still rejects the pushed name', () => {
    expect(() => (WORKSPACE_PERMISSIONS as string[]).push('bogus')).toThrow(TypeError);
    expect(() => (workspacePermissionSchema.options as string[]).push('bogus')).toThrow(TypeError);
    expect(workspacePermissionSchema.safeParse('bogus').success).toBe(false);
    expect(WORKSPACE_PERMISSIONS).toHaveLength(6);
  });

  it('refuses to widen a preset or swap one out', () => {
    expect(() => (WORKSPACE_PRESETS.member as string[]).push('billing.manage')).toThrow(TypeError);
    expect(() => (WORKSPACE_PRESETS.admin as string[]).push('billing.manage')).toThrow(TypeError);
    expect(() => {
      (WORKSPACE_PRESETS as Record<string, readonly string[]>)['member'] = ['billing.manage'];
    }).toThrow(TypeError);
    expect(WORKSPACE_PRESETS.member).toEqual([]);
    expect(WORKSPACE_PRESETS.admin).not.toContain('billing.manage');
  });

  it('refuses to widen the empty grant', () => {
    expect(() => (NO_WORKSPACE_GRANT.permissions as string[]).push('members.manage')).toThrow(
      TypeError,
    );
    expect(() => {
      (NO_WORKSPACE_GRANT as { isOwner: boolean }).isOwner = true;
    }).toThrow(TypeError);
    expect(hasConsoleAccess(NO_WORKSPACE_GRANT)).toBe(false);
  });

  it('refuses to add a preset name to the preset schema', () => {
    expect(() => (workspacePresetSchema.options as string[]).push('owner')).toThrow(TypeError);
    expect(workspacePresetSchema.safeParse('owner').success).toBe(false);
  });

  it('keeps billing out of the admin preset and grants nothing to the member preset', () => {
    expect(WORKSPACE_PRESETS.admin).toEqual([
      'members.invite',
      'members.manage',
      'sources.manage',
      'directory.manage',
      'access.manage',
    ]);
    expect(WORKSPACE_PRESETS.member).toEqual([]);
  });
});

describe('normalizeWorkspacePermissions', () => {
  it('returns catalog order and drops duplicates and unknown strings', () => {
    expect(
      normalizeWorkspacePermissions([
        'billing.manage',
        'bogus',
        'members.invite',
        'members.invite',
      ]),
    ).toEqual(['members.invite', 'billing.manage']);
  });
});

describe('effectiveWorkspacePermissions', () => {
  it('gives the owner the whole catalog whatever is stored', () => {
    expect(effectiveWorkspacePermissions({ isOwner: true, permissions: [] })).toEqual([
      ...WORKSPACE_PERMISSIONS,
    ]);
  });

  it('gives anyone else exactly what is stored, normalized', () => {
    expect(
      effectiveWorkspacePermissions({
        isOwner: false,
        permissions: ['sources.manage', 'members.invite'],
      }),
    ).toEqual(['members.invite', 'sources.manage']);
  });
});

describe('grantAllows', () => {
  it('allows the owner every permission', () => {
    const owner = { isOwner: true, permissions: [] };
    for (const permission of WORKSPACE_PERMISSIONS) {
      expect(grantAllows(owner, permission)).toBe(true);
    }
  });

  it('allows nothing without a grant', () => {
    for (const permission of WORKSPACE_PERMISSIONS) {
      expect(grantAllows(NO_WORKSPACE_GRANT, permission)).toBe(false);
    }
  });

  it('allows a stored permission and refuses one that is not stored', () => {
    const grant = { isOwner: false, permissions: ['sources.manage'] as WorkspacePermission[] };
    expect(grantAllows(grant, 'sources.manage')).toBe(true);
    expect(grantAllows(grant, 'billing.manage')).toBe(false);
  });
});

describe('grantHoldsAll', () => {
  it('is true only when every requested permission is held', () => {
    const grant = { isOwner: false, permissions: [...WORKSPACE_PRESETS.admin] };
    expect(grantHoldsAll(grant, ['members.invite', 'access.manage'])).toBe(true);
    expect(grantHoldsAll(grant, ['members.invite', 'billing.manage'])).toBe(false);
  });

  it('is true for the owner on the whole catalog', () => {
    expect(grantHoldsAll({ isOwner: true, permissions: [] }, WORKSPACE_PERMISSIONS)).toBe(true);
  });
});

describe('hasConsoleAccess', () => {
  it('is false without a grant', () => {
    expect(hasConsoleAccess(NO_WORKSPACE_GRANT)).toBe(false);
  });

  it('is true for a holder of any single permission', () => {
    expect(hasConsoleAccess({ isOwner: false, permissions: ['billing.manage'] })).toBe(true);
  });

  it('is true for an owner with nothing stored', () => {
    expect(hasConsoleAccess({ isOwner: true, permissions: [] })).toBe(true);
  });
});

describe('workspacePresetFor', () => {
  it('names the admin preset regardless of order', () => {
    expect(workspacePresetFor([...WORKSPACE_PRESETS.admin].reverse())).toBe('admin');
  });

  it('names the member preset for an empty set', () => {
    expect(workspacePresetFor([])).toBe('member');
  });

  it('names anything else custom', () => {
    expect(workspacePresetFor(ADMIN_WITHOUT_MEMBER_MANAGEMENT)).toBe('custom');
  });
});

describe('legacyRoleLabel', () => {
  it('labels the owner owner', () => {
    expect(legacyRoleLabel({ isOwner: true, permissions: [] })).toBe('owner');
  });

  it('labels the admin preset admin', () => {
    expect(legacyRoleLabel({ isOwner: false, permissions: [...WORKSPACE_PRESETS.admin] })).toBe(
      'admin',
    );
  });

  it('labels the pre-permission admin powers admin even without member management', () => {
    expect(legacyRoleLabel({ isOwner: false, permissions: ADMIN_WITHOUT_MEMBER_MANAGEMENT })).toBe(
      'admin',
    );
  });

  it('labels a partial grant member', () => {
    expect(legacyRoleLabel({ isOwner: false, permissions: ['sources.manage'] })).toBe('member');
  });
});

describe('permissionsForLegacyRole', () => {
  it('maps owner to the admin preset', () => {
    expect(permissionsForLegacyRole('owner')).toEqual([...WORKSPACE_PRESETS.admin]);
  });

  it('maps admin to the admin preset', () => {
    expect(permissionsForLegacyRole('admin')).toEqual([...WORKSPACE_PRESETS.admin]);
  });

  it('maps member to nothing', () => {
    expect(permissionsForLegacyRole('member')).toEqual([]);
  });

  it('returns a fresh array a caller cannot use to change the preset', () => {
    const permissions = permissionsForLegacyRole('admin');
    permissions.pop();
    expect(WORKSPACE_PRESETS.admin).toHaveLength(5);
  });
});
