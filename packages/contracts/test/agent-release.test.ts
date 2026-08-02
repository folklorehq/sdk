// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { agentReleaseDescriptorSchema } from '../src/agent-release.js';

const descriptor = {
  repository: '123456789012.dkr.ecr.us-east-1.amazonaws.com/folklore-platform-agent',
  digest: `sha256:${'a'.repeat(64)}`,
  sourceSha: 'b'.repeat(40),
  signature: Buffer.alloc(64).toString('base64'),
  signerKeyId: 'release-2026',
};

describe('agentReleaseDescriptorSchema', () => {
  it('accepts an exact immutable release descriptor', () => {
    expect(agentReleaseDescriptorSchema.parse(descriptor)).toEqual(descriptor);
  });

  it.each([
    { ...descriptor, digest: 'sha256:UPPERCASE' },
    { ...descriptor, sourceSha: 'not-a-source-sha' },
    { ...descriptor, signature: '' },
    { ...descriptor, signature: 'not base64' },
    { ...descriptor, signerKeyId: '' },
    { ...descriptor, unexpected: 'field' },
  ])('rejects an invalid or non-exact descriptor', (invalid) => {
    expect(agentReleaseDescriptorSchema.safeParse(invalid).success).toBe(false);
  });
});
