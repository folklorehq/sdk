// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  POOL_AGENT_RELEASE_PUBLICATION_SCHEMA,
  poolAgentReleaseDescriptorSchema,
  poolAgentReleasePublicationParameterName,
  poolAgentReleasePublicationSchema,
} from '../src/pool-agent-release.js';

const descriptor = {
  repository: '123456789012.dkr.ecr.us-east-1.amazonaws.com/folklore-platform-prod-agent',
  digest: `sha256:${'a'.repeat(64)}`,
  requestId: '0b1c2d3e-4f50-5a6b-8c7d-9e0f1a2b3c4d',
  signature: `${'A'.repeat(86)}==`,
  signerKeyId: 'pool-agent-release-v1',
  targetPcr0: 'd'.repeat(96),
  targetVersion: 'c'.repeat(40),
  enclaveArtifact: {
    bucket: 'folklore-platform-prod-enclave-artifacts-immutable',
    key: `artifacts/${'c'.repeat(40)}/enclave.eif`,
    versionId: 'version-id',
    digest: `sha256:${'b'.repeat(64)}`,
  },
};

describe('poolAgentReleaseDescriptorSchema', () => {
  it('accepts the descriptor shape the release publisher signs', () => {
    expect(poolAgentReleaseDescriptorSchema.parse(descriptor)).toEqual(descriptor);
  });

  it.each([
    ['an unknown field', { ...descriptor, extra: 'x' }],
    ['a tag instead of a digest', { ...descriptor, digest: 'latest' }],
    ['an uppercase request id', { ...descriptor, requestId: descriptor.requestId.toUpperCase() }],
    ['a non-canonical signature', { ...descriptor, signature: 'not base64' }],
    ['an all-zero PCR0', { ...descriptor, targetPcr0: '0'.repeat(96) }],
    ['a semver target version', { ...descriptor, targetVersion: '1.2.3' }],
    ['a repository outside ECR', { ...descriptor, repository: 'docker.io/folklore/agent' }],
    [
      'an EIF key that names no release commit',
      { ...descriptor, enclaveArtifact: { ...descriptor.enclaveArtifact, key: 'enclave.eif' } },
    ],
    [
      'a snake_case EIF identity',
      {
        ...descriptor,
        enclaveArtifact: { ...descriptor.enclaveArtifact, version_id: 'v' },
      },
    ],
  ])('refuses %s', (_label, candidate) => {
    expect(poolAgentReleaseDescriptorSchema.safeParse(candidate).success).toBe(false);
  });
});

describe('poolAgentReleasePublicationSchema', () => {
  const publication = {
    schema: POOL_AGENT_RELEASE_PUBLICATION_SCHEMA,
    version: 1,
    sourceSha: 'c'.repeat(40),
    signerKeyId: 'pool-agent-release-v1',
    spkiSha256: 'e'.repeat(64),
    descriptor: JSON.stringify(descriptor),
  };

  it('accepts the V1 publication envelope', () => {
    expect(poolAgentReleasePublicationSchema.parse(publication)).toEqual(publication);
  });

  it.each([
    ['another schema', { ...publication, schema: 'PoolAgentReleasePublicationV2' }],
    ['another version', { ...publication, version: 2 }],
    ['an unknown field', { ...publication, extra: 'x' }],
    ['a descriptor object', { ...publication, descriptor }],
  ])('refuses %s', (_label, candidate) => {
    expect(poolAgentReleasePublicationSchema.safeParse(candidate).success).toBe(false);
  });
});

describe('poolAgentReleasePublicationParameterName', () => {
  it('names the stack-derived parameter', () => {
    expect(poolAgentReleasePublicationParameterName('prod')).toBe(
      '/folklore/prod/pool-agent-release',
    );
  });

  it('refuses a stack name that could escape the path', () => {
    expect(() => poolAgentReleasePublicationParameterName('../prod')).toThrow(
      'pool_agent_release_stack_invalid',
    );
  });
});
