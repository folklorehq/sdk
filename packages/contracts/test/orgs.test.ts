// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  emailDeliverySchema,
  orgInviteContextSchema,
  provisionOperationSchema,
  provisioningStatusSchema,
  provisioningStateSchema,
  recoveryKeyRegistrationInputSchema,
} from '../src/orgs.js';

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
});
