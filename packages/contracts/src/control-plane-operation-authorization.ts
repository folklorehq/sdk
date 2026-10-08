// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { canonicalJson, digest64Schema } from './shared.js';

export const CONTROL_PLANE_OPERATION_AUTHORIZATION_DOMAIN =
  'folklore.control-plane-operation-authorization.v1' as const;
export const CONTROL_PLANE_OPERATION_KEY_ID = 'control-plane-operation-v1' as const;
export const CONTROL_PLANE_OPERATION_KEY_EPOCH = 1 as const;
export const CONTROL_PLANE_BASIS_KINDS = [
  'pool_provision',
  'pool_boot_manifest_mint',
  'shared_tenant_provision',
] as const;
export const CONTROL_PLANE_PLATFORM_OWNED_KINDS = [
  'pool_provision',
  'pool_boot_manifest_mint',
] as const;

const PREIMAGE_SCHEMA = 'ControlPlaneOperationAuthorizationPreimageV1' as const;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const SIGNATURE_BASE64_MAX_LENGTH = 128;

export const controlPlaneOperationKeyPinV1Schema = z
  .object({
    schema: z.literal('ControlPlaneOperationKeyPinV1'),
    version: z.literal(1),
    keyId: z.string().regex(KEY_ID_PATTERN),
    epoch: z.number().int().positive(),
    spkiDerBase64: z.string().min(1),
    spkiSha256: digest64Schema,
  })
  .strict();
export type ControlPlaneOperationKeyPinV1 = z.infer<typeof controlPlaneOperationKeyPinV1Schema>;

export const controlPlaneOperationAuthorizationV1Schema = z
  .object({
    schema: z.literal('ControlPlaneOperationAuthorizationV1'),
    version: z.literal(1),
    keyId: z.string().min(1).max(128),
    epoch: z.number().int().positive(),
    operationId: z.string().uuid(),
    requestDigest: digest64Schema,
    signatureBase64: z.string().min(1).max(SIGNATURE_BASE64_MAX_LENGTH),
  })
  .strict();
export type ControlPlaneOperationAuthorizationV1 = z.infer<
  typeof controlPlaneOperationAuthorizationV1Schema
>;

export const infrastructureOperationMintRequestV2Schema = z
  .object({
    schema: z.literal('InfrastructureOperationMintRequestV2'),
    version: z.literal(2),
    request: z.record(z.unknown()),
    controlPlaneAuthorization: controlPlaneOperationAuthorizationV1Schema,
  })
  .strict();
export type InfrastructureOperationMintRequestV2 = z.infer<
  typeof infrastructureOperationMintRequestV2Schema
>;

export interface ControlPlaneOperationAuthorizationPreimageInput {
  readonly keyId: string;
  readonly epoch: number;
  readonly operationId: string;
  readonly requestDigest: string;
}

export function controlPlaneOperationAuthorizationPreimageV1(
  input: ControlPlaneOperationAuthorizationPreimageInput,
): Uint8Array {
  return concatBytes(
    utf8ToBytes(CONTROL_PLANE_OPERATION_AUTHORIZATION_DOMAIN),
    new Uint8Array([0]),
    utf8ToBytes(
      canonicalJson({
        schema: PREIMAGE_SCHEMA,
        version: 1,
        keyId: input.keyId,
        epoch: input.epoch,
        operationId: input.operationId,
        requestDigest: input.requestDigest,
      }),
    ),
  );
}

export function controlPlaneOperationAuthorizationDigestV1(
  input: ControlPlaneOperationAuthorizationPreimageInput,
): string {
  return bytesToHex(sha256(controlPlaneOperationAuthorizationPreimageV1(input)));
}
