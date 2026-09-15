// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@folklore/utils';
import { mintSha256DigestV1, parseSha256DigestV1 } from '../src/aci/official-aci-digests.js';
import {
  assertOfficialAciRequestDescriptor,
  createOfficialAciRequestDescriptor,
  officialAciRequestDescriptorDigestV1Schema,
  type OfficialAciRequestDescriptorFieldsV1,
} from '../src/aci/official-aci-request-descriptor.js';

const DIGEST = parseSha256DigestV1(`sha256:${'a'.repeat(64)}`);

function fields(): OfficialAciRequestDescriptorFieldsV1 {
  return {
    version: 1,
    orgId: 'org-1',
    deploymentId: 'dep-1',
    assignmentDigest: DIGEST,
    requestId: 'req-1',
    activePolicyDigest: DIGEST,
    policyGeneration: 3,
    activationGeneration: 4,
    configurationGeneration: 5,
    keysetVersion: 6,
    bootEpoch: 'epoch-1',
    role: 'generate',
    modelId: 'model-1',
    modelRevision: 'rev-1',
    modelArtifactDigest: DIGEST,
    routeIdentityDigest: DIGEST,
    channelRootDigest: DIGEST,
    sessionId: 'session-1',
    trustedTimeCheckpointDigest: DIGEST,
  };
}

describe('createOfficialAciRequestDescriptor', () => {
  it('mints the authoritative descriptor from the complete canonical preimage', () => {
    const descriptor = createOfficialAciRequestDescriptor(fields());
    const expectedPreimage = {
      schema: 'OfficialAciRequestDescriptorPreimageV1' as const,
      ...fields(),
    };
    const domainBytes = new TextEncoder().encode(
      `folklore.official-aci-request-descriptor.v1\u0000${canonicalJson(expectedPreimage)}`,
    );
    const expectedDigest = officialAciRequestDescriptorDigestV1Schema.parse(
      mintSha256DigestV1(domainBytes),
    );
    expect(descriptor.descriptorDigest).toBe(expectedDigest);
    expect(descriptor.schema).toBe('OfficialAciRequestDescriptorV1');
    expect(descriptor.__officialAciRequestDescriptorV1).toBe(true);
  });

  it('returns a frozen descriptor', () => {
    const descriptor = createOfficialAciRequestDescriptor(fields());
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it('is stable across field ordering of the input', () => {
    const base = fields();
    const reordered: OfficialAciRequestDescriptorFieldsV1 = {
      trustedTimeCheckpointDigest: base.trustedTimeCheckpointDigest,
      sessionId: base.sessionId,
      channelRootDigest: base.channelRootDigest,
      routeIdentityDigest: base.routeIdentityDigest,
      modelArtifactDigest: base.modelArtifactDigest,
      modelRevision: base.modelRevision,
      modelId: base.modelId,
      role: base.role,
      bootEpoch: base.bootEpoch,
      keysetVersion: base.keysetVersion,
      configurationGeneration: base.configurationGeneration,
      activationGeneration: base.activationGeneration,
      policyGeneration: base.policyGeneration,
      activePolicyDigest: base.activePolicyDigest,
      requestId: base.requestId,
      assignmentDigest: base.assignmentDigest,
      deploymentId: base.deploymentId,
      orgId: base.orgId,
      version: base.version,
    };
    expect(createOfficialAciRequestDescriptor(reordered).descriptorDigest).toBe(
      createOfficialAciRequestDescriptor(base).descriptorDigest,
    );
  });

  it('changes the digest when any field changes', () => {
    const base = createOfficialAciRequestDescriptor(fields());
    const changed = createOfficialAciRequestDescriptor({ ...fields(), requestId: 'req-2' });
    expect(changed.descriptorDigest).not.toBe(base.descriptorDigest);
  });

  it('rejects unsupported descriptor versions during construction', () => {
    expect(() =>
      createOfficialAciRequestDescriptor({
        ...fields(),
        version: 2,
      } as unknown as OfficialAciRequestDescriptorFieldsV1),
    ).toThrow();
  });
});

describe('assertOfficialAciRequestDescriptor', () => {
  it('accepts a genuine descriptor', () => {
    const descriptor = createOfficialAciRequestDescriptor(fields());
    expect(() => assertOfficialAciRequestDescriptor(descriptor)).not.toThrow();
  });

  it('rejects a tampered field', () => {
    const descriptor = createOfficialAciRequestDescriptor(fields());
    const tampered = { ...descriptor, requestId: 'req-tampered' };
    expect(() => assertOfficialAciRequestDescriptor(tampered)).toThrow();
  });

  it('rejects a tampered version', () => {
    const descriptor = createOfficialAciRequestDescriptor(fields());
    const tampered = { ...descriptor, version: 2 } as typeof descriptor;
    expect(() => assertOfficialAciRequestDescriptor(tampered)).toThrow();
  });

  it('rejects an extra field', () => {
    const descriptor = createOfficialAciRequestDescriptor(fields());
    const extra = { ...descriptor, unexpected: true } as typeof descriptor;
    expect(() => assertOfficialAciRequestDescriptor(extra)).toThrow();
  });
});
