// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign } from 'node:crypto';

import { preForwardRouteProofSchema } from '@folklore/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  PreForwardRouteProofVerificationError,
  PreForwardRouteProofVerifier,
  preForwardRouteProofPayload,
} from '../src/aci/PreForwardRouteProofVerifier.js';
import { parseStrictJsonBytes } from '../src/aci/strict-json.js';
import type {
  PreForwardRouteBinding,
  PreForwardRouteProofVerifierConfig,
  TrustedTimeAuthorityPort,
  TrustedTimeSample,
} from '../src/ports.js';
import { InMemoryForwardReplayAuthority } from './doubles/aci/InMemoryAciStores.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
const NONCE = Buffer.alloc(32, 7).toString('base64');
const NOW = 1_700_000_030_000;

const keyPair = generateKeyPairSync('ed25519');
const foreignKeyPair = generateKeyPairSync('ed25519');
const publicKey = keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const publicKeyDer = Buffer.from(publicKey, 'base64');
const publicKeyRaw = publicKeyDer.subarray(-32);

const expected: PreForwardRouteBinding = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  tenantId: 'org-1',
  assignmentDigest: DIGEST_A,
  proofId: 'proof-1',
  workloadId: 'workload-1',
  runtimeIdentityDigest: DIGEST_B,
  workloadArtifactDigest: DIGEST_C,
  pinnedTrustRootDigest: DIGEST_D,
  channelKeyDigest: DIGEST_A,
  exporterLabel: 'EXPORTER-ACI-CHANNEL',
  exporterDigest: DIGEST_B,
  transcriptDigest: DIGEST_C,
  snapshotDigest: DIGEST_D,
  policyDigest: DIGEST_A,
  tenantAadDigest: DIGEST_B,
  origin: 'https://model.example',
  route: '/v1/chat/completions',
  method: 'POST',
  routeIdentityDigest: DIGEST_C,
  role: 'generate',
  sessionId: 'session-1',
  model: 'provider/model-1',
  modelRevision: 'revision-1',
  modelArtifactDigest: DIGEST_C,
  workloadKeysetDigest: DIGEST_D,
  capabilityDigest: DIGEST_A,
  policyGeneration: 7,
  activationGeneration: 3,
  gatewayNonce: NONCE,
  requestId: 'request-1',
  bootEpoch: 'boot-1',
  trustedTimeCheckpointDigest: DIGEST_A,
};

function unsignedProof(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    proofVersion: 1,
    proofId: 'proof-1',
    requestId: expected.requestId,
    orgId: expected.orgId,
    deploymentId: expected.deploymentId,
    tenantContext: { tenantId: expected.tenantId, assignmentDigest: expected.assignmentDigest },
    issuer: {
      workloadId: expected.workloadId,
      runtimeIdentityDigest: expected.runtimeIdentityDigest,
      workloadArtifactDigest: expected.workloadArtifactDigest,
      keyId: 'key-1',
      attestedKeysetDigest: expected.workloadKeysetDigest,
    },
    pinnedTrustRootDigest: expected.pinnedTrustRootDigest,
    auth: { algorithm: 'Ed25519' },
    challenge: { gatewayNonce: expected.gatewayNonce, bootEpoch: expected.bootEpoch },
    connection: {
      channelKeyDigest: expected.channelKeyDigest,
      exporterLabel: expected.exporterLabel,
      exporterDigest: expected.exporterDigest,
      transcriptDigest: expected.transcriptDigest,
    },
    route: {
      origin: expected.origin,
      route: expected.route,
      method: expected.method,
      routeIdentityDigest: expected.routeIdentityDigest,
      workloadId: expected.workloadId,
    },
    role: expected.role,
    sessionId: expected.sessionId,
    model: expected.model,
    modelRevision: expected.modelRevision,
    modelArtifactDigest: expected.modelArtifactDigest,
    snapshotDigest: expected.snapshotDigest,
    policyDigest: expected.policyDigest,
    tenantAadDigest: expected.tenantAadDigest,
    capabilityDigest: expected.capabilityDigest,
    workloadKeysetDigest: expected.workloadKeysetDigest,
    policyGeneration: expected.policyGeneration,
    activationGeneration: expected.activationGeneration,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 30_000,
    ...overrides,
  };
}

function signedProof(
  overrides: Record<string, unknown> = {},
  privateKey = keyPair.privateKey,
): Uint8Array {
  const unsigned = unsignedProof(overrides);
  const signature = sign(
    null,
    Buffer.from(preForwardRouteProofPayload(unsigned)),
    privateKey,
  ).toString('base64');
  return new TextEncoder().encode(
    JSON.stringify({ ...unsigned, auth: { algorithm: 'Ed25519', signature } }),
  );
}

function authority(
  reads: number[] = [NOW],
  overrides: Partial<TrustedTimeSample> = {},
): TrustedTimeAuthorityPort {
  let index = 0;
  return {
    read: async () => {
      const trustedNow = reads[Math.min(index++, reads.length - 1)];
      if (trustedNow === undefined) throw new Error('missing test time');
      return {
        trustedNow,
        checkpointDigest: DIGEST_A,
        bootEpoch: expected.bootEpoch,
        orgId: expected.orgId,
        deploymentId: expected.deploymentId,
        ...overrides,
      };
    },
  };
}

function verifier(time = authority(), replayCapacity = 4_096): PreForwardRouteProofVerifier {
  return new PreForwardRouteProofVerifier({
    trustedTimeAuthority: time,
    replayAuthority: new InMemoryForwardReplayAuthority(replayCapacity),
    issuerKeys: new Map([['key-1', publicKey]]),
    maximumProofLifetimeMs: 60_000,
  });
}

describe('PreForwardRouteProofVerifier', () => {
  it('accepts one valid strict proof and reads trusted time', async () => {
    let reads = 0;
    const result = await verifier({
      read: async () => {
        reads += 1;
        return {
          trustedNow: NOW,
          checkpointDigest: DIGEST_A,
          bootEpoch: expected.bootEpoch,
          orgId: expected.orgId,
          deploymentId: expected.deploymentId,
        };
      },
    }).verify({ encodedProof: signedProof(), expected });

    expect(result.proofVersion).toBe(1);
    expect(result.auth.algorithm).toBe('Ed25519');
    expect(reads).toBe(1);
  });

  it('rejects every signed proof binding mutation', async () => {
    const mutations: Array<Record<string, unknown>> = [
      { orgId: 'other-org' },
      { deploymentId: 'other-deployment' },
      { proofId: 'proof-2' },
      { tenantContext: { tenantId: expected.tenantId, assignmentDigest: DIGEST_B } },
      { issuer: { ...(unsignedProof().issuer as object), workloadId: 'other-workload' } },
      {
        issuer: {
          ...(unsignedProof().issuer as Record<string, unknown>),
          runtimeIdentityDigest: DIGEST_A,
        },
      },
      {
        issuer: {
          ...(unsignedProof().issuer as Record<string, unknown>),
          workloadArtifactDigest: DIGEST_A,
        },
      },
      {
        issuer: {
          ...(unsignedProof().issuer as Record<string, unknown>),
          attestedKeysetDigest: DIGEST_A,
        },
      },
      { pinnedTrustRootDigest: DIGEST_A },
      {
        challenge: {
          gatewayNonce: Buffer.alloc(32, 8).toString('base64'),
          bootEpoch: expected.bootEpoch,
        },
      },
      { challenge: { gatewayNonce: expected.gatewayNonce, bootEpoch: 'boot-2' } },
      {
        connection: {
          ...(unsignedProof().connection as Record<string, unknown>),
          channelKeyDigest: DIGEST_D,
        },
      },
      {
        connection: {
          ...(unsignedProof().connection as Record<string, unknown>),
          exporterLabel: 'EXPORTER-OTHER',
        },
      },
      {
        connection: {
          ...(unsignedProof().connection as Record<string, unknown>),
          exporterDigest: DIGEST_D,
        },
      },
      {
        connection: {
          ...(unsignedProof().connection as Record<string, unknown>),
          transcriptDigest: DIGEST_D,
        },
      },
      {
        route: {
          ...(unsignedProof().route as Record<string, unknown>),
          origin: 'https://other.example',
        },
      },
      { route: { ...(unsignedProof().route as Record<string, unknown>), route: '/v1/other' } },
      { route: { ...(unsignedProof().route as Record<string, unknown>), method: 'GET' } },
      {
        route: {
          ...(unsignedProof().route as Record<string, unknown>),
          routeIdentityDigest: DIGEST_D,
        },
      },
      {
        route: {
          ...(unsignedProof().route as Record<string, unknown>),
          workloadId: 'other-workload',
        },
      },
      { requestId: 'other-request' },
      { sessionId: 'other-session' },
      { model: 'provider/other-model' },
      { modelRevision: 'revision-2' },
      { modelArtifactDigest: DIGEST_A },
      { snapshotDigest: DIGEST_A },
      { policyDigest: DIGEST_B },
      { tenantAadDigest: DIGEST_C },
      { capabilityDigest: DIGEST_D },
      { workloadKeysetDigest: DIGEST_A },
      { policyGeneration: 8 },
      { activationGeneration: 4 },
      { issuedAt: NOW + 1 },
      { expiresAt: NOW },
    ];

    for (const mutation of mutations) {
      await expect(
        verifier().verify({ encodedProof: signedProof(mutation), expected }),
      ).rejects.toBeInstanceOf(PreForwardRouteProofVerificationError);
    }
  });

  it('rejects wrong issuer key, wrong root, stale time, future time, and replay', async () => {
    await expect(
      verifier().verify({ encodedProof: signedProof({}, foreignKeyPair.privateKey), expected }),
    ).rejects.toMatchObject({ code: 'proof_invalid' });
    await expect(
      verifier().verify({
        encodedProof: signedProof({ pinnedTrustRootDigest: DIGEST_A }),
        expected,
      }),
    ).rejects.toMatchObject({ code: 'proof_invalid' });
    await expect(
      verifier(authority([NOW + 31_000])).verify({
        encodedProof: signedProof(),
        expected,
      }),
    ).rejects.toMatchObject({ code: 'proof_stale' });
    await expect(
      verifier(authority([NOW - 2_000])).verify({
        encodedProof: signedProof(),
        expected,
      }),
    ).rejects.toMatchObject({ code: 'proof_stale' });

    const instance = verifier();
    await instance.verify({ encodedProof: signedProof(), expected });
    await expect(instance.verify({ encodedProof: signedProof(), expected })).rejects.toMatchObject({
      code: 'proof_replay',
    });
  });

  it('accepts exact raw and DER Ed25519 public-key encodings', async () => {
    for (const issuerPublicKey of [publicKeyRaw, publicKeyDer]) {
      const configured = new PreForwardRouteProofVerifier({
        trustedTimeAuthority: authority(),
        replayAuthority: new InMemoryForwardReplayAuthority(),
        issuerPublicKey,
        issuerPublicKeyId: expectedProofKeyId(),
      } as PreForwardRouteProofVerifierConfig);

      await expect(
        configured.verify({ encodedProof: signedProof(), expected }),
      ).resolves.toMatchObject({ proofId: expected.proofId });
    }
  });

  it('rejects configurable proof lifetime and byte limits above hard bounds', () => {
    expect(
      () =>
        new PreForwardRouteProofVerifier({
          trustedTimeAuthority: authority(),
          replayAuthority: new InMemoryForwardReplayAuthority(),
          issuerKeys: new Map([['key-1', publicKey]]),
          maximumProofLifetimeMs: 300_001,
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'proof_invalid',
      }),
    );
    expect(
      () =>
        new PreForwardRouteProofVerifier({
          trustedTimeAuthority: authority(),
          replayAuthority: new InMemoryForwardReplayAuthority(),
          issuerKeys: new Map([['key-1', publicKey]]),
          maxProofBytes: 1_048_577,
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'proof_invalid',
      }),
    );
  });

  it('requires the single-key fallback to match its configured key id', async () => {
    const configured = new PreForwardRouteProofVerifier({
      trustedTimeAuthority: authority(),
      replayAuthority: new InMemoryForwardReplayAuthority(),
      issuerPublicKey: publicKey,
      issuerPublicKeyId: 'different-key',
    } as PreForwardRouteProofVerifierConfig);

    await expect(
      configured.verify({ encodedProof: signedProof(), expected }),
    ).rejects.toMatchObject({ code: 'proof_invalid' });
  });

  it('rejects trusted-time samples from another context or checkpoint', async () => {
    for (const overrides of [
      { orgId: 'other-org' },
      { deploymentId: 'other-deployment' },
      { bootEpoch: 'other-boot' },
      { checkpointDigest: DIGEST_B },
    ]) {
      await expect(
        verifier(authority([NOW], overrides)).verify({
          encodedProof: signedProof(),
          expected,
        }),
      ).rejects.toMatchObject({ code: 'trusted_time_unavailable' });
    }
  });

  it('bounds retained proof replay markers', async () => {
    const configured = new PreForwardRouteProofVerifier({
      trustedTimeAuthority: authority(),
      replayAuthority: new InMemoryForwardReplayAuthority(1),
      issuerKeys: new Map([['key-1', publicKey]]),
    } as PreForwardRouteProofVerifierConfig);
    const secondExpected = { ...expected, proofId: 'proof-2' };

    await configured.verify({ encodedProof: signedProof(), expected });
    await expect(
      configured.verify({
        encodedProof: signedProof({ proofId: 'proof-2' }),
        expected: secondExpected,
      }),
    ).rejects.toMatchObject({ code: 'proof_replay' });
  });

  it('uses strict JSON duplicate and unknown-field rejection without echoing content', async () => {
    const valid = JSON.parse(new TextDecoder().decode(signedProof())) as Record<string, unknown>;
    const duplicate = `${JSON.stringify(valid).slice(0, -1)},"proofId":"other"}`;
    await expect(
      verifier().verify({ encodedProof: new TextEncoder().encode(duplicate), expected }),
    ).rejects.toMatchObject({
      code: 'proof_invalid',
    });
    const unknown = { ...valid, prompt: 'sentinel customer content' };
    await expect(
      verifier().verify({
        encodedProof: new TextEncoder().encode(JSON.stringify(unknown)),
        expected,
      }),
    ).rejects.toMatchObject({ code: 'proof_invalid' });
    try {
      await verifier().verify({
        encodedProof: new TextEncoder().encode(JSON.stringify(unknown)),
        expected,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PreForwardRouteProofVerificationError);
      expect((error as Error).message).not.toContain('sentinel');
    }
    expect(preForwardRouteProofSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects non-ASCII member names at the ACI strict parser boundary', () => {
    const valid = JSON.parse(new TextDecoder().decode(signedProof())) as Record<string, unknown>;
    const nonAscii = { ...valid, ['proéfId']: 'proof-1' };

    expect(() =>
      parseStrictJsonBytes(new TextEncoder().encode(JSON.stringify(nonAscii)), 1_048_576, {
        asciiMemberNames: true,
      }),
    ).toThrow();
  });

  it('rejects concurrent reuse while the first verification is awaiting trusted time', async () => {
    let release: (() => void) | undefined;
    let reads = 0;
    const authorityWithGate: TrustedTimeAuthorityPort = {
      read: async () => {
        reads += 1;
        if (reads === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return {
          trustedNow: NOW,
          checkpointDigest: DIGEST_A,
          bootEpoch: expected.bootEpoch,
          orgId: expected.orgId,
          deploymentId: expected.deploymentId,
        };
      },
    };
    const instance = verifier(authorityWithGate);
    const first = instance.verify({ encodedProof: signedProof(), expected });
    await vi.waitFor(() => expect(reads).toBe(1));

    await expect(instance.verify({ encodedProof: signedProof(), expected })).rejects.toMatchObject({
      code: 'proof_replay',
    });
    release?.();
    await expect(first).resolves.toMatchObject({ proofId: 'proof-1' });
  });
});

function expectedProofKeyId(): string {
  return 'key-1';
}
