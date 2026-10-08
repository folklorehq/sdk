// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  createOrgInputSchema,
  emailDeliverySchema,
  inviteEmailSchema,
  orgInviteContextSchema,
  orgInviteViewSchema,
  phaseForProvisioningStatus,
  provisionOperationSchema,
  provisioningStatusSchema,
  provisioningStateSchema,
  recoveryKeyRegistrationInputSchema,
  workspaceRecoveryCommitmentSchema,
} from '../src/orgs.js';

const RECOVERY_PUBLIC_KEY_HEX = 'ab'.repeat(32);
const WORKSPACE_NONCE = '0f'.repeat(32);
const RECOVERY_COMMITMENT = {
  recoveryPublicKeyHex: RECOVERY_PUBLIC_KEY_HEX,
  nonce: WORKSPACE_NONCE,
};

describe('provisioningStateSchema', () => {
  it('accepts only the four persisted provisioning states', () => {
    expect(
      ['pending', 'provisioning', 'provisioned', 'failed'].map(provisioningStateSchema.parse),
    ).toEqual(['pending', 'provisioning', 'provisioned', 'failed']);
    expect(provisioningStateSchema.safeParse('unmanaged').success).toBe(false);
    expect(provisioningStateSchema.safeParse('ready').success).toBe(false);
  });
});

describe('recoveryKeyRegistrationInputSchema', () => {
  it('accepts only a raw public key and confirmed fingerprint', () => {
    const input = {
      publicKeyHex: 'ab'.repeat(32),
      fingerprint: '9a2d-b2e2-3f15-04cd',
    };
    expect(recoveryKeyRegistrationInputSchema.parse(input)).toEqual(input);
    expect(
      recoveryKeyRegistrationInputSchema.safeParse({ ...input, privateKeyHex: 'cd'.repeat(32) })
        .success,
    ).toBe(false);
    expect(
      recoveryKeyRegistrationInputSchema.safeParse({ ...input, phrase: 'customer recovery words' })
        .success,
    ).toBe(false);
  });
});

describe('workspaceRecoveryCommitmentSchema', () => {
  it('accepts a lower-case 32-byte key and nonce', () => {
    expect(workspaceRecoveryCommitmentSchema.parse(RECOVERY_COMMITMENT)).toEqual(
      RECOVERY_COMMITMENT,
    );
  });

  it.each([
    ['an upper-case key', { ...RECOVERY_COMMITMENT, recoveryPublicKeyHex: 'AB'.repeat(32) }],
    ['a short key', { ...RECOVERY_COMMITMENT, recoveryPublicKeyHex: 'ab'.repeat(31) }],
    ['a short nonce', { ...RECOVERY_COMMITMENT, nonce: '0f'.repeat(31) }],
    ['a non-hex nonce', { ...RECOVERY_COMMITMENT, nonce: 'zz'.repeat(32) }],
    ['a missing nonce', { recoveryPublicKeyHex: RECOVERY_PUBLIC_KEY_HEX }],
    ['an extra key', { ...RECOVERY_COMMITMENT, fingerprint: 'abcd-abcd-abcd-abcd' }],
  ])('refuses %s', (_case, input) => {
    expect(workspaceRecoveryCommitmentSchema.safeParse(input).success).toBe(false);
  });
});

describe('createOrgInputSchema', () => {
  it('requires the recovery commitment the workspace id is derived from', () => {
    expect(createOrgInputSchema.safeParse({ name: 'Acme Inc.' }).success).toBe(false);
    expect(
      createOrgInputSchema.parse({ name: ' Acme Inc. ', recoveryCommitment: RECOVERY_COMMITMENT }),
    ).toEqual({
      name: 'Acme Inc.',
      processingTier: 'shared',
      recoveryCommitment: RECOVERY_COMMITMENT,
    });
  });

  it('refuses the retired dedicated tier and an empty name', () => {
    expect(
      createOrgInputSchema.safeParse({
        name: 'Acme Inc.',
        processingTier: 'dedicated',
        recoveryCommitment: RECOVERY_COMMITMENT,
      }).success,
    ).toBe(false);
    expect(
      createOrgInputSchema.safeParse({ name: '  ', recoveryCommitment: RECOVERY_COMMITMENT })
        .success,
    ).toBe(false);
  });
});

describe('emailDeliverySchema', () => {
  it('keeps invite email delivery metadata content-free and strict', () => {
    expect(emailDeliverySchema.parse({ status: 'sent', provider: 'resend' })).toEqual({
      status: 'sent',
      provider: 'resend',
    });
    expect(
      emailDeliverySchema.safeParse({
        status: 'failed',
        reason: 'provider_error',
        message: 'upstream body',
      }).success,
    ).toBe(false);
  });
});

describe('orgInviteContextSchema', () => {
  it('describes the public context needed to render an org invite', () => {
    expect(
      orgInviteContextSchema.parse({
        orgName: 'Acme',
        email: 'dana@acme.com',
        role: 'admin',
        status: 'pending',
        isExpired: false,
      }),
    ).toMatchObject({ orgName: 'Acme', role: 'admin', isExpired: false });
    expect(
      orgInviteContextSchema.safeParse({
        orgName: 'Acme',
        email: 'dana@acme.com',
        role: 'owner',
        status: 'pending',
        isExpired: false,
        acceptUrl: 'https://console.test/invite?token=abc',
      }).success,
    ).toBe(false);
  });
});

describe('inviteEmailSchema', () => {
  it('normalizes a padded, mixed-case address and refuses malformed or oversized ones', () => {
    expect(inviteEmailSchema.parse('  Dana@Acme.com ')).toBe('dana@acme.com');
    expect(inviteEmailSchema.safeParse('bad-email').success).toBe(false);
    expect(inviteEmailSchema.safeParse(`${'a'.repeat(320)}@acme.com`).success).toBe(false);
  });
});

describe('orgInviteViewSchema', () => {
  const view = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'dana@acme.com',
    role: 'member',
    status: 'pending',
    expiresAt: '2026-10-08T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
  };

  it('accepts the listed invite row and refuses the token hash or inviting account', () => {
    expect(orgInviteViewSchema.safeParse(view).success).toBe(true);
    expect(orgInviteViewSchema.safeParse({ ...view, tokenHash: 'h' }).success).toBe(false);
    expect(orgInviteViewSchema.safeParse({ ...view, invitedByAccountId: view.id }).success).toBe(
      false,
    );
  });
});

describe('provisionOperationSchema', () => {
  it('requires a stable operation id and permits only content-free failure codes', () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    expect(
      provisionOperationSchema.parse({
        operationId,
        state: 'failed',
        failureCode: 'provisioner_failed',
      }),
    ).toEqual({ operationId, state: 'failed', failureCode: 'provisioner_failed' });
    expect(
      provisionOperationSchema.safeParse({
        operationId,
        state: 'failed',
        failureCode: 'provisioner_failed',
        message: 'provider exception text',
      }).success,
    ).toBe(false);
    expect(
      provisionOperationSchema.safeParse({
        operationId: 'not-an-operation-id',
        state: 'failed',
        failureCode: 'provider exception text',
      }).success,
    ).toBe(false);
  });
});

describe('provisioningStatusSchema', () => {
  it('distinguishes completed infrastructure from attested readiness', () => {
    expect(
      provisioningStatusSchema.parse({
        operationId: '11111111-1111-4111-8111-111111111111',
        state: 'provisioned',
        failureCode: null,
        readyAt: null,
      }),
    ).toMatchObject({ state: 'provisioned', readyAt: null });
  });

  it('defaults the blocker to null and accepts only the placement-required discriminator', () => {
    const base = {
      operationId: '11111111-1111-4111-8111-111111111111',
      state: 'provisioning' as const,
      failureCode: null,
      readyAt: null,
    };

    expect(provisioningStatusSchema.parse(base)).toMatchObject({ blocker: null });
    expect(
      provisioningStatusSchema.parse({ ...base, blocker: 'placement_required' }),
    ).toMatchObject({ blocker: 'placement_required' });
    expect(
      provisioningStatusSchema.safeParse({ ...base, blocker: 'no_placement_binding' }).success,
    ).toBe(false);
    expect(
      provisioningStatusSchema.safeParse({ ...base, blocker: 'provider exception text' }).success,
    ).toBe(false);
  });
});

describe('phaseForProvisioningStatus', () => {
  it('maps the explicit placement blocker before the persisted lifecycle state', () => {
    const status = provisioningStatusSchema.parse({
      operationId: '11111111-1111-4111-8111-111111111111',
      state: 'provisioning',
      failureCode: null,
      readyAt: null,
      blocker: 'placement_required',
    });

    expect(phaseForProvisioningStatus(status)).toBe('placementRequired');
    expect(phaseForProvisioningStatus({ ...status, blocker: null })).toBe('provisioning');
  });
});
