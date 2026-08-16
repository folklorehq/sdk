// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { isTrustedTimeContext, readTrustedTimeSample } from '../src/aci/trusted-time.js';
import type {
  MonotonicRawClockPort,
  NsmTrustedTimeSourcePort,
  TrustedTimeAuthorityPort,
  TrustedTimeBindingV1,
  TrustedTimeSampleV1,
} from '../src/ports.js';
import type { TrustedTimeAuthorityV1Port } from '../src/ports.js';

const BINDING: TrustedTimeBindingV1 = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  releaseId: 'release-1',
  eifDigest: 'a'.repeat(64),
  pcr0: 'b'.repeat(96),
  bootRootDigest: 'c'.repeat(64),
  policyGeneration: 1,
  activationGeneration: 2,
  keysetEpoch: 3,
  keysetDigest: 'd'.repeat(64),
};

const SAMPLE: TrustedTimeSampleV1 = {
  orgId: BINDING.orgId,
  deploymentId: BINDING.deploymentId,
  bootEpoch: BINDING.bootEpoch,
  trustedNowMs: 1_123,
  latestPossibleNowMs: 1_124,
  checkpointDigest: 'e'.repeat(64),
  health: 'healthy',
};

const LEGACY_SAMPLE = {
  trustedNow: SAMPLE.trustedNowMs,
  checkpointDigest: SAMPLE.checkpointDigest,
  bootEpoch: SAMPLE.bootEpoch,
  orgId: SAMPLE.orgId,
  deploymentId: SAMPLE.deploymentId,
};

const MAX_CANONICAL_IDENTIFIER = `org/${'a'.repeat(252)}`;
const CANONICAL_SAMPLE: TrustedTimeSampleV1 = {
  ...SAMPLE,
  orgId: MAX_CANONICAL_IDENTIFIER,
  deploymentId: MAX_CANONICAL_IDENTIFIER,
  bootEpoch: MAX_CANONICAL_IDENTIFIER,
};
const CANONICAL_LEGACY_SAMPLE = {
  trustedNow: CANONICAL_SAMPLE.trustedNowMs,
  checkpointDigest: CANONICAL_SAMPLE.checkpointDigest,
  bootEpoch: CANONICAL_SAMPLE.bootEpoch,
  orgId: CANONICAL_SAMPLE.orgId,
  deploymentId: CANONICAL_SAMPLE.deploymentId,
};

describe('trusted-time ports', () => {
  it('declares the NSM, monotonic, and authority seams without changing legacy reads', () => {
    const nsm: NsmTrustedTimeSourcePort = {
      attest: async () => ({
        timestampMs: 1_000,
        nonce: new Uint8Array(32),
        userData: new Uint8Array([1]),
        pcr0: BINDING.pcr0,
        documentDigest: 'f'.repeat(64),
        publicKey: new Uint8Array(32),
        chainVerified: true,
        rootVerified: true,
        signatureVerified: true,
      }),
    };
    const clock: MonotonicRawClockPort = { readNanoseconds: () => 4_000_000_000n };
    const authority: TrustedTimeAuthorityPort = {
      initialize: async () => undefined,
      sample: async () => SAMPLE,
      isHealthy: () => true,
      read: async () => ({
        trustedNow: SAMPLE.trustedNowMs,
        checkpointDigest: SAMPLE.checkpointDigest,
        bootEpoch: SAMPLE.bootEpoch,
        orgId: SAMPLE.orgId,
        deploymentId: SAMPLE.deploymentId,
      }),
    };

    expect(nsm).toBeDefined();
    expect(clock.readNanoseconds()).toBe(4_000_000_000n);
    expect(authority.isHealthy?.()).toBe(true);
  });

  it('adapts a V1 sample for current inference callers without exporting raw nanoseconds', async () => {
    const authority: TrustedTimeAuthorityPort = {
      sample: async () => SAMPLE,
      initialize: async () => undefined,
      isHealthy: () => true,
      read: async () => LEGACY_SAMPLE,
    };

    await expect(
      readTrustedTimeSample(authority, {
        orgId: BINDING.orgId,
        deploymentId: BINDING.deploymentId,
        bootEpoch: BINDING.bootEpoch,
        checkpointDigest: SAMPLE.checkpointDigest,
      }),
    ).resolves.toEqual({
      ...LEGACY_SAMPLE,
    });
  });

  it('falls back to a required read-only legacy authority and preserves context', async () => {
    let receivedContext: unknown;
    const authority: TrustedTimeAuthorityPort = {
      read: async (context) => {
        receivedContext = context;
        return LEGACY_SAMPLE;
      },
    };

    await expect(
      readTrustedTimeSample(authority, {
        orgId: BINDING.orgId,
        deploymentId: BINDING.deploymentId,
        bootEpoch: BINDING.bootEpoch,
        checkpointDigest: SAMPLE.checkpointDigest,
      }),
    ).resolves.toEqual(LEGACY_SAMPLE);
    expect(receivedContext).toEqual({
      orgId: BINDING.orgId,
      deploymentId: BINDING.deploymentId,
      bootEpoch: BINDING.bootEpoch,
      checkpointDigest: SAMPLE.checkpointDigest,
    });
  });

  it('prefers the complete V1 sample method when both methods are present', async () => {
    const authority: TrustedTimeAuthorityV1Port = {
      initialize: async () => undefined,
      sample: async () => SAMPLE,
      isHealthy: () => true,
      read: async () => {
        throw new Error('legacy method must not be selected');
      },
    };

    await expect(readTrustedTimeSample(authority)).resolves.toEqual(LEGACY_SAMPLE);
  });

  it('accepts canonical slash-bearing maximum-length identifiers through context and conversion', async () => {
    expect(
      isTrustedTimeContext({
        orgId: MAX_CANONICAL_IDENTIFIER,
        deploymentId: MAX_CANONICAL_IDENTIFIER,
        bootEpoch: MAX_CANONICAL_IDENTIFIER,
        checkpointDigest: CANONICAL_SAMPLE.checkpointDigest,
      }),
    ).toBe(true);

    const authority: TrustedTimeAuthorityV1Port = {
      initialize: async () => undefined,
      sample: async () => CANONICAL_SAMPLE,
      isHealthy: () => true,
      read: async () => CANONICAL_LEGACY_SAMPLE,
    };

    await expect(
      readTrustedTimeSample(authority, {
        orgId: MAX_CANONICAL_IDENTIFIER,
        deploymentId: MAX_CANONICAL_IDENTIFIER,
        bootEpoch: MAX_CANONICAL_IDENTIFIER,
        checkpointDigest: CANONICAL_SAMPLE.checkpointDigest,
      }),
    ).resolves.toEqual(CANONICAL_LEGACY_SAMPLE);
  });

  it('rejects identifiers outside the canonical grammar or length', () => {
    expect(
      isTrustedTimeContext({
        orgId: `/${MAX_CANONICAL_IDENTIFIER}`,
        deploymentId: MAX_CANONICAL_IDENTIFIER,
        bootEpoch: MAX_CANONICAL_IDENTIFIER,
        checkpointDigest: CANONICAL_SAMPLE.checkpointDigest,
      }),
    ).toBe(false);
    expect(
      isTrustedTimeContext({
        orgId: `${MAX_CANONICAL_IDENTIFIER}a`,
        deploymentId: MAX_CANONICAL_IDENTIFIER,
        bootEpoch: MAX_CANONICAL_IDENTIFIER,
        checkpointDigest: CANONICAL_SAMPLE.checkpointDigest,
      }),
    ).toBe(false);
  });

  it('does not use the host wall clock in the trusted-time adapter', async () => {
    const source = await import('../src/aci/trusted-time.js');

    expect(source.readTrustedTimeSample.toString()).not.toContain('Date.now');
  });
});
