// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { immutableEnclaveArtifactSchema } from '../src/rollout.js';

const artifact = {
  bucket: 'folklore-platform-prod-enclave-artifacts-immutable',
  key: `artifacts/${'a'.repeat(40)}/enclave.eif`,
  version_id: 'version-id-immutable',
  digest: `sha256:${'b'.repeat(64)}`,
};

describe('immutableEnclaveArtifactSchema', () => {
  it('accepts the exact bucket, key, VersionId, and digest identity', () => {
    expect(immutableEnclaveArtifactSchema.parse(artifact)).toEqual(artifact);
  });

  it.each([
    { ...artifact, key: 'latest/enclave.eif' },
    { ...artifact, version_id: 'version id' },
    { ...artifact, version_id: 'null' },
    { ...artifact, digest: `sha256:${'B'.repeat(64)}` },
    { ...artifact, unexpected: 'field' },
  ])('rejects a mutable or non-exact artifact identity', (invalid) => {
    expect(immutableEnclaveArtifactSchema.safeParse(invalid).success).toBe(false);
  });
});
