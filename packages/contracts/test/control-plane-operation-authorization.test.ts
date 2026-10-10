// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTROL_PLANE_BASIS_KINDS,
  CONTROL_PLANE_OPERATION_AUTHORIZATION_DOMAIN,
  CONTROL_PLANE_OPERATION_KEY_EPOCH,
  CONTROL_PLANE_OPERATION_KEY_ID,
  controlPlaneOperationAuthorizationDigestV1,
  controlPlaneOperationAuthorizationPreimageV1,
  controlPlaneOperationAuthorizationV1Schema,
  controlPlaneOperationKeyPinV1Schema,
  infrastructureOperationMintRequestV2Schema,
  parsePlacementMode,
} from '../src/control-plane-operation-authorization.js';
import { canonicalJson } from '../src/shared.js';

const INPUT = {
  keyId: CONTROL_PLANE_OPERATION_KEY_ID,
  epoch: CONTROL_PLANE_OPERATION_KEY_EPOCH,
  operationId: '11111111-1111-4111-8111-111111111111',
  requestDigest: 'a'.repeat(64),
};
const GOLDEN_PREIMAGE_DIGEST = 'e4844f4d580a902966cf2f4643e32da641b109de917bb535863170a408b53f8b';
const PIN = {
  schema: 'ControlPlaneOperationKeyPinV1',
  version: 1,
  keyId: CONTROL_PLANE_OPERATION_KEY_ID,
  epoch: 1,
  spkiDerBase64: 'MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  spkiSha256: 'b'.repeat(64),
};
const AUTHORIZATION = {
  schema: 'ControlPlaneOperationAuthorizationV1',
  version: 1,
  keyId: CONTROL_PLANE_OPERATION_KEY_ID,
  epoch: 1,
  operationId: INPUT.operationId,
  requestDigest: INPUT.requestDigest,
  signatureBase64: 'c2ln',
};

describe('control-plane operation authorization preimage', () => {
  it('is the domain, a zero byte, then the canonical JSON of the bound fields', () => {
    const expected = Buffer.concat([
      Buffer.from(CONTROL_PLANE_OPERATION_AUTHORIZATION_DOMAIN, 'utf8'),
      Buffer.from([0]),
      Buffer.from(
        canonicalJson({
          schema: 'ControlPlaneOperationAuthorizationPreimageV1',
          version: 1,
          keyId: INPUT.keyId,
          epoch: INPUT.epoch,
          operationId: INPUT.operationId,
          requestDigest: INPUT.requestDigest,
        }),
        'utf8',
      ),
    ]);
    expect(Buffer.from(controlPlaneOperationAuthorizationPreimageV1(INPUT)).equals(expected)).toBe(
      true,
    );
  });

  it('hashes to a pinned digest', () => {
    expect(controlPlaneOperationAuthorizationDigestV1(INPUT)).toBe(GOLDEN_PREIMAGE_DIGEST);
    expect(controlPlaneOperationAuthorizationDigestV1(INPUT)).toBe(
      createHash('sha256')
        .update(controlPlaneOperationAuthorizationPreimageV1(INPUT))
        .digest('hex'),
    );
  });

  it.each([
    ['keyId', 'other-key'],
    ['epoch', 2],
    ['operationId', '22222222-2222-4222-8222-222222222222'],
    ['requestDigest', 'd'.repeat(64)],
  ])('changes when %s changes', (field, value) => {
    expect(controlPlaneOperationAuthorizationDigestV1({ ...INPUT, [field]: value })).not.toBe(
      controlPlaneOperationAuthorizationDigestV1(INPUT),
    );
  });

  it('names the three basis kinds', () => {
    expect(CONTROL_PLANE_BASIS_KINDS).toEqual([
      'pool_provision',
      'pool_boot_manifest_mint',
      'shared_tenant_provision',
    ]);
  });
});

describe('control-plane operation key pin schema', () => {
  it('accepts a well-formed pin', () => {
    expect(controlPlaneOperationKeyPinV1Schema.safeParse(PIN).success).toBe(true);
  });

  it('refuses an extra key', () => {
    expect(controlPlaneOperationKeyPinV1Schema.safeParse({ ...PIN, extra: 1 }).success).toBe(false);
  });

  it('refuses epoch 0', () => {
    expect(controlPlaneOperationKeyPinV1Schema.safeParse({ ...PIN, epoch: 0 }).success).toBe(false);
  });

  it('refuses a 63-character digest', () => {
    expect(
      controlPlaneOperationKeyPinV1Schema.safeParse({ ...PIN, spkiSha256: 'b'.repeat(63) }).success,
    ).toBe(false);
  });
});

describe('mint request V2 schema', () => {
  const V2 = {
    schema: 'InfrastructureOperationMintRequestV2',
    version: 2,
    request: { kind: 'pool_provision' },
    controlPlaneAuthorization: AUTHORIZATION,
  };

  it('accepts a request with its authorization', () => {
    expect(infrastructureOperationMintRequestV2Schema.safeParse(V2).success).toBe(true);
    expect(controlPlaneOperationAuthorizationV1Schema.safeParse(AUTHORIZATION).success).toBe(true);
  });

  it('refuses a missing authorization', () => {
    const { controlPlaneAuthorization: _omitted, ...rest } = V2;
    expect(infrastructureOperationMintRequestV2Schema.safeParse(rest).success).toBe(false);
  });

  it('refuses an extra key', () => {
    expect(infrastructureOperationMintRequestV2Schema.safeParse({ ...V2, extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('placement mode', () => {
  it.each([
    [undefined, 'authority'],
    ['', 'authority'],
    ['authority', 'authority'],
    ['decided', 'decided'],
    ['Decided', undefined],
    ['x', undefined],
  ] as const)('parses %s as %s', (value, expected) => {
    expect(parsePlacementMode(value)).toBe(expected);
  });
});
