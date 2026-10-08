// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { digest64Schema, identifierSchema } from './shared.js';

// A leaf on purpose: it imports no other contracts module, so any module can import it cycle-free.
export const UUID_V8_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const uuidV8Schema = z.string().uuid().regex(UUID_V8_PATTERN);

export const PLACEMENT_KEY_DERIVATION_DOMAIN_V1 = 'folklore-placement-ed25519-v1';
export const WORKSPACE_RECOVERY_COMMITMENT_DOMAIN_V1 = 'folklore.workspace-recovery-commitment.v1';
export const WORKSPACE_ORG_ID_DOMAIN_V1 = 'folklore.workspace-org-id.v1';

const PLACEMENT_ENROLLMENT_DOMAIN_V1 = 'folklore.placement-enrollment.v1';
const PLACEMENT_ENROLLMENT_SUBJECT_PREIMAGE_SCHEMA_V1 = 'PlacementEnrollmentSubjectPreimageV1';
const PLACEMENT_ENROLLMENT_SUBJECT_PREIMAGE_VERSION_V1 = 1;
const PLACEMENT_ORG_ID_DOMAIN_V1 = 'folklore.placement-org-id.v1';
const PLACEMENT_DEPLOYMENT_ID_DOMAIN_V1 = 'folklore.placement-deployment-id.v1';
const TUPLE_LENGTH_PREFIX_BYTES = 4;
const UUID_BYTES = 16;

export function orderedTupleV1(fields: readonly (string | number)[]): Uint8Array {
  const encoded = fields.map((field) => utf8ToBytes(String(field)));
  const result = new Uint8Array(
    TUPLE_LENGTH_PREFIX_BYTES +
      encoded.reduce((size, value) => size + TUPLE_LENGTH_PREFIX_BYTES + value.length, 0),
  );
  const view = new DataView(result.buffer);
  view.setUint32(0, fields.length);
  let offset = TUPLE_LENGTH_PREFIX_BYTES;
  for (const value of encoded) {
    view.setUint32(offset, value.length);
    offset += TUPLE_LENGTH_PREFIX_BYTES;
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

export function domainDigestV1(domain: string, bytes: Uint8Array): string {
  return bytesToHex(sha256(concatBytes(utf8ToBytes(domain), Uint8Array.of(0), bytes)));
}

export function deriveUuidV8FromDigest(domain: string, digestHex: string): string {
  const normalizedDomain = identifierSchema.parse(domain);
  const digestBytes = hexToBytes(digest64Schema.parse(digestHex));
  const bytes = sha256(
    concatBytes(utf8ToBytes(normalizedDomain), Uint8Array.of(0), digestBytes),
  ).slice(0, UUID_BYTES);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface PlacementEnrollmentDigestPartsV1 {
  readonly challengeId: string;
  readonly challengeDigest: string;
  readonly recoveryPublicKeyDigest: string;
  readonly placementPublicKeyDigest: string;
}

export function placementEnrollmentSubjectPreimageBytesV1(
  parts: PlacementEnrollmentDigestPartsV1,
): Uint8Array {
  return orderedTupleV1([
    PLACEMENT_ENROLLMENT_SUBJECT_PREIMAGE_SCHEMA_V1,
    PLACEMENT_ENROLLMENT_SUBJECT_PREIMAGE_VERSION_V1,
    parts.challengeId,
    parts.challengeDigest,
    parts.recoveryPublicKeyDigest,
    parts.placementPublicKeyDigest,
    PLACEMENT_KEY_DERIVATION_DOMAIN_V1,
  ]);
}

export function placementEnrollmentDigestFromPartsV1(
  parts: PlacementEnrollmentDigestPartsV1,
): string {
  return domainDigestV1(
    PLACEMENT_ENROLLMENT_DOMAIN_V1,
    placementEnrollmentSubjectPreimageBytesV1(parts),
  );
}

export function deriveOrgIdFromEnrollmentDigest(enrollmentDigest: string): string {
  return deriveUuidV8FromDigest(PLACEMENT_ORG_ID_DOMAIN_V1, enrollmentDigest);
}

export function deriveDeploymentIdFromEnrollmentDigest(enrollmentDigest: string): string {
  return deriveUuidV8FromDigest(PLACEMENT_DEPLOYMENT_ID_DOMAIN_V1, enrollmentDigest);
}

export function workspaceOrgIdV1(input: { recoveryPublicKeyHex: string; nonce: string }): string {
  return workspaceOrgIdFromKeyDigest(
    recoveryPublicKeyDigestV1(input.recoveryPublicKeyHex),
    digest64Schema.parse(input.nonce),
  );
}

export const recoveryKeyBindingV1Schema = z.discriminatedUnion('basis', [
  z
    .object({
      schema: z.literal('RecoveryKeyBindingV1'),
      version: z.literal(1),
      basis: z.literal('placement_enrollment'),
      challengeId: uuidV8Schema,
      challengeDigest: digest64Schema,
      placementPublicKeyDigest: digest64Schema,
    })
    .strict(),
  z
    .object({
      schema: z.literal('RecoveryKeyBindingV1'),
      version: z.literal(1),
      basis: z.literal('workspace_commitment'),
      nonce: digest64Schema,
    })
    .strict(),
]);
export type RecoveryKeyBindingV1 = z.infer<typeof recoveryKeyBindingV1Schema>;

export interface RecoveryKeyBindingIdentityV1 {
  readonly orgId: string;
  readonly deploymentId?: string;
}

/** The org id (and, for a placement, the deployment id) that a binding commits to for this key. */
export function recoveryKeyBindingIdentityV1(input: {
  readonly binding: RecoveryKeyBindingV1;
  readonly recoveryPublicKeyHex: string;
}): RecoveryKeyBindingIdentityV1 {
  const binding = recoveryKeyBindingV1Schema.parse(input.binding);
  const recoveryPublicKeyDigest = recoveryPublicKeyDigestV1(input.recoveryPublicKeyHex);
  if (binding.basis === 'workspace_commitment') {
    return { orgId: workspaceOrgIdFromKeyDigest(recoveryPublicKeyDigest, binding.nonce) };
  }
  const enrollmentDigest = placementEnrollmentDigestFromPartsV1({
    challengeId: binding.challengeId,
    challengeDigest: binding.challengeDigest,
    recoveryPublicKeyDigest,
    placementPublicKeyDigest: binding.placementPublicKeyDigest,
  });
  return {
    orgId: deriveOrgIdFromEnrollmentDigest(enrollmentDigest),
    deploymentId: deriveDeploymentIdFromEnrollmentDigest(enrollmentDigest),
  };
}

// Hex case is not identity, so the digest is taken over the 32 raw key bytes.
function recoveryPublicKeyDigestV1(recoveryPublicKeyHex: string): string {
  return bytesToHex(sha256(hexToBytes(digest64Schema.parse(recoveryPublicKeyHex.toLowerCase()))));
}

function workspaceOrgIdFromKeyDigest(recoveryPublicKeyDigest: string, nonce: string): string {
  const commitment = domainDigestV1(
    WORKSPACE_RECOVERY_COMMITMENT_DOMAIN_V1,
    orderedTupleV1([recoveryPublicKeyDigest, nonce]),
  );
  return deriveUuidV8FromDigest(WORKSPACE_ORG_ID_DOMAIN_V1, commitment);
}
