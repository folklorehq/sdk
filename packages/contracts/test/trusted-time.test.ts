// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  identifierSchema,
  trustedTimeBindingV1Schema,
  trustedTimeSampleV1Schema,
  type TrustedTimeBindingV1,
  type TrustedTimeSampleV1,
} from '../src/index.js';

const binding: TrustedTimeBindingV1 = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  releaseId: 'release-1',
  eifDigest: 'a'.repeat(64),
  pcr0: 'b'.repeat(96),
  bootRootDigest: 'c'.repeat(64),
  policyGeneration: 7,
  activationGeneration: 11,
  keysetEpoch: 13,
  keysetDigest: 'd'.repeat(64),
};

const sample: TrustedTimeSampleV1 = {
  orgId: binding.orgId,
  deploymentId: binding.deploymentId,
  bootEpoch: binding.bootEpoch,
  trustedNowMs: 1_123,
  latestPossibleNowMs: 1_124,
  checkpointDigest: 'e'.repeat(64),
  health: 'healthy',
};

const MAX_CANONICAL_IDENTIFIER = `org/${'a'.repeat(252)}`;

describe('trusted-time contracts', () => {
  it('exports strict binding and sanitized sample schemas from the package root', () => {
    expect(trustedTimeBindingV1Schema.parse(binding)).toEqual(binding);
    expect(trustedTimeSampleV1Schema.parse(sample)).toEqual(sample);
    expect(() => trustedTimeBindingV1Schema.parse({ ...binding, unexpected: true })).toThrow();
    expect(() =>
      trustedTimeSampleV1Schema.parse({ ...sample, sampledAtRawNs: 4_123_000_000n }),
    ).toThrow();
  });

  it('rejects unsafe runtime values and inverted conservative bounds', () => {
    expect(() => trustedTimeBindingV1Schema.parse({ ...binding, policyGeneration: '7' })).toThrow();
    expect(() =>
      trustedTimeSampleV1Schema.parse({ ...sample, latestPossibleNowMs: sample.trustedNowMs - 1 }),
    ).toThrow();
  });

  it('accepts slash-bearing identifiers at the canonical maximum length', () => {
    expect(MAX_CANONICAL_IDENTIFIER).toHaveLength(256);
    expect(identifierSchema.parse(MAX_CANONICAL_IDENTIFIER)).toBe(MAX_CANONICAL_IDENTIFIER);
    expect(
      trustedTimeBindingV1Schema.parse({
        ...binding,
        orgId: MAX_CANONICAL_IDENTIFIER,
        deploymentId: MAX_CANONICAL_IDENTIFIER,
        bootEpoch: MAX_CANONICAL_IDENTIFIER,
        releaseId: MAX_CANONICAL_IDENTIFIER,
      }),
    ).toMatchObject({
      orgId: MAX_CANONICAL_IDENTIFIER,
      deploymentId: MAX_CANONICAL_IDENTIFIER,
      bootEpoch: MAX_CANONICAL_IDENTIFIER,
      releaseId: MAX_CANONICAL_IDENTIFIER,
    });
    expect(
      trustedTimeSampleV1Schema.parse({
        ...sample,
        orgId: MAX_CANONICAL_IDENTIFIER,
        deploymentId: MAX_CANONICAL_IDENTIFIER,
        bootEpoch: MAX_CANONICAL_IDENTIFIER,
      }),
    ).toMatchObject({
      orgId: MAX_CANONICAL_IDENTIFIER,
      deploymentId: MAX_CANONICAL_IDENTIFIER,
      bootEpoch: MAX_CANONICAL_IDENTIFIER,
    });
    expect(() => identifierSchema.parse(`${MAX_CANONICAL_IDENTIFIER}a`)).toThrow();
  });
});
