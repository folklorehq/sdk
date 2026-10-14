// SPDX-License-Identifier: Apache-2.0
import type { ReleaseRollAuthorizationV1 } from '../../src/release-roll-authorization.js';

/** A deterministic Ed25519 known-answer vector for the release-roll signature input (IR1–IR3 share it). */
export const RELEASE_ROLL_VECTOR_SEED_HEX =
  '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

export const RELEASE_ROLL_VECTOR_UNSIGNED: Omit<ReleaseRollAuthorizationV1, 'signature'> = {
  schema: 'folklore.release-roll-authorization.v1',
  commandId: 'a1111111-b111-4c11-8d11-e11111111111',
  poolDeploymentId: 'a2222222-b222-4c22-8d22-e22222222222',
  fromPcr0: 'a'.repeat(96),
  target: {
    targetVersion: 'c'.repeat(40),
    targetPcr0: 'b'.repeat(96),
    agentImageDigest: `sha256:${'d'.repeat(64)}`,
    eif: {
      bucket: 'folklore-prod-enclave-artifacts-immutable',
      key: `artifacts/${'c'.repeat(40)}/enclave.eif`,
      version_id: 'eif-version-1',
      digest: `sha256:${'e'.repeat(64)}`,
    },
  },
  environment: {
    configurationGeneration: 3,
    bootManifestSha256: '1'.repeat(64),
    bootKeysetSha256: '2'.repeat(64),
    enclaveEnvSha256: '3'.repeat(64),
  },
  rolloutFence: {
    rollout_id: 'a3333333-b333-4c33-8d33-e33333333333',
    lease_token: 4,
    member_generation: 5,
    attempt_nonce: 'a4444444-b444-4c44-8d44-e44444444444',
  },
  notBefore: 1_700_000_000,
  notAfter: 1_700_000_900,
  keyId: 'release-roll-key-1',
};

export const RELEASE_ROLL_VECTOR_INPUT_SHA256 =
  '95d6b5a3d150b03f26230858a62e017c67aab568a4a621698c4d4af1abb14a04';
export const RELEASE_ROLL_VECTOR_PUBLIC_KEY_SPKI_DER_BASE64 =
  'MCowBQYDK2VwAyEAebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=';
export const RELEASE_ROLL_VECTOR_SIGNATURE_BASE64 =
  'DqZI3lK5B+P7Rk/jyXEvi36CyvclX50khUcqfZSWVyj+lOoUV3Jel+JRxVMZj9Z+EDkl2ces4uyM4WfVWA2dBQ==';
