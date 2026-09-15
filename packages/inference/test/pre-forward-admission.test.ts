// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import {
  digest64Schema,
  preForwardRouteProofSchema,
  type PreForwardRouteProofV1,
  type ProductionVerifiedModelProvenanceV1,
} from '@folklore/contracts';
import { describe, expect, it } from 'vitest';
import {
  createOfficialAciRequestDescriptor,
  type OfficialAciRequestDescriptorFieldsV1,
} from '../src/aci/official-aci-request-descriptor.js';
import { parseSha256DigestV1 } from '../src/aci/official-aci-digests.js';
import { consumeForwardBodyOpenCapability } from '../src/aci/forward-admission-capability.js';
import {
  PreForwardAdmissionService,
  type ClaimedPreForwardAdmissionInput,
  type PreForwardAdmissionServiceConfig,
  type PreForwardProofClaimInput,
} from '../src/aci/PreForwardAdmissionService.js';
import { committedProofClaim } from './doubles/aci/PreForwardProofClaimJournalDouble.js';
import {
  brandCommissionedControlledRouteIdentityV1,
  isCommissionedControlledRouteIdentityV1,
  type PreForwardAdmissionBindingAuthorityPort,
  type PreForwardRouteExpectation,
  type VerifiedAciSession,
  type VerifiedAciTrustSnapshot,
  type AciTrustContext,
} from '../src/ports.js';
import type {
  VerifiedActivePolicyRoleBindingV1,
  VerifiedActivePolicySnapshotV1,
} from '../src/aci/VerifiedActivePolicySnapshot.js';

const DIGEST = 'a'.repeat(64);
const GATEWAY_NONCE = Buffer.alloc(32, 1).toString('base64');
const SIGNATURE = Buffer.alloc(64, 2).toString('base64');
const SHA_DIGEST = parseSha256DigestV1(`sha256:${DIGEST}`);
const fallbackProvenanceGuard = new WeakSet<object>();

const fallbackAuthority: PreForwardAdmissionBindingAuthorityPort = {
  digestProof: (proof) =>
    parseSha256DigestV1(
      `sha256:${createHash('sha256').update(JSON.stringify(proof)).digest('hex')}`,
    ),
  digest64FromSha256Digest: (value) => digest64Schema.parse(value.slice('sha256:'.length)),
  sha256DigestFromDigest64: (value) => parseSha256DigestV1(`sha256:${value}`),
  parseDigest64: (value) => digest64Schema.parse(value),
  createBinding: ({ expected: route, proof, proofDigest }) => ({
    ...route,
    proofDigest: proofDigest.slice('sha256:'.length),
    bindingDigest: createHash('sha256')
      .update(JSON.stringify([proof.proofId, proof.requestId]))
      .digest('hex'),
    source: 'controlled-gateway',
  }),
  isCommissionedRoute: isCommissionedControlledRouteIdentityV1,
  isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
    typeof value === 'object' && value !== null && fallbackProvenanceGuard.has(value),
};

async function admissionAuthority(): Promise<PreForwardAdmissionBindingAuthorityPort> {
  const module = await import(
    /* @vite-ignore */ '../src/aci/' + 'ControlledGatewayModelArtifactBindingVerifier.js'
  ).catch(() => null);
  if (
    module !== null &&
    typeof module.createControlledGatewayPreForwardBindingAuthority === 'function'
  ) {
    return module.createControlledGatewayPreForwardBindingAuthority();
  }
  return fallbackAuthority;
}

function expected(): PreForwardRouteExpectation {
  return {
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    tenantId: 'org-1',
    assignmentDigest: DIGEST,
    proofId: 'proof-1',
    workloadId: 'workload-1',
    runtimeIdentityDigest: DIGEST,
    workloadArtifactDigest: DIGEST,
    pinnedTrustRootDigest: DIGEST,
    channelKeyDigest: DIGEST,
    exporterLabel: 'EXPORTER-ACI-CHANNEL',
    exporterDigest: DIGEST,
    transcriptDigest: DIGEST,
    snapshotDigest: DIGEST,
    policyDigest: DIGEST,
    tenantAadDigest: DIGEST,
    origin: 'https://model.example',
    route: '/v1/chat/completions',
    method: 'POST',
    routeIdentityDigest: DIGEST,
    role: 'generate',
    sessionId: 'session-1',
    model: 'provider/model-1',
    modelRevision: 'revision-1',
    modelArtifactDigest: DIGEST,
    workloadKeysetDigest: DIGEST,
    capabilityDigest: DIGEST,
    policyGeneration: 7,
    activationGeneration: 3,
    gatewayNonce: GATEWAY_NONCE,
    requestId: 'request-1',
    bootEpoch: 'boot-1',
    trustedTimeCheckpointDigest: DIGEST,
  };
}

function proof(): PreForwardRouteProofV1 {
  const value = expected();
  return preForwardRouteProofSchema.parse({
    proofVersion: 1,
    proofId: value.proofId,
    requestId: value.requestId,
    orgId: value.orgId,
    deploymentId: value.deploymentId,
    tenantContext: { tenantId: value.tenantId, assignmentDigest: value.assignmentDigest },
    issuer: {
      workloadId: value.workloadId,
      runtimeIdentityDigest: value.runtimeIdentityDigest,
      workloadArtifactDigest: value.workloadArtifactDigest,
      keyId: 'verifier-key-1',
      attestedKeysetDigest: value.workloadKeysetDigest,
    },
    pinnedTrustRootDigest: value.pinnedTrustRootDigest,
    auth: { algorithm: 'Ed25519', signature: SIGNATURE },
    challenge: { gatewayNonce: value.gatewayNonce, bootEpoch: value.bootEpoch },
    connection: {
      channelKeyDigest: value.channelKeyDigest,
      exporterLabel: value.exporterLabel,
      exporterDigest: value.exporterDigest,
      transcriptDigest: value.transcriptDigest,
    },
    route: {
      origin: value.origin,
      route: value.route,
      method: value.method,
      routeIdentityDigest: value.routeIdentityDigest,
      workloadId: value.workloadId,
    },
    role: value.role,
    sessionId: value.sessionId,
    model: value.model,
    modelRevision: value.modelRevision,
    modelArtifactDigest: value.modelArtifactDigest,
    snapshotDigest: value.snapshotDigest,
    policyDigest: value.policyDigest,
    tenantAadDigest: value.tenantAadDigest,
    capabilityDigest: value.capabilityDigest,
    workloadKeysetDigest: value.workloadKeysetDigest,
    policyGeneration: value.policyGeneration,
    activationGeneration: value.activationGeneration,
    issuedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_010_000,
  });
}

function descriptor() {
  return createOfficialAciRequestDescriptor(descriptorFields());
}

function descriptorFields(): OfficialAciRequestDescriptorFieldsV1 {
  return {
    version: 1,
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    assignmentDigest: SHA_DIGEST,
    requestId: 'request-1',
    activePolicyDigest: SHA_DIGEST,
    policyGeneration: 7,
    activationGeneration: 3,
    configurationGeneration: 1,
    keysetVersion: 1,
    bootEpoch: 'boot-1',
    role: 'generate',
    modelId: 'provider/model-1',
    modelRevision: 'revision-1',
    modelArtifactDigest: SHA_DIGEST,
    routeIdentityDigest: SHA_DIGEST,
    channelRootDigest: SHA_DIGEST,
    sessionId: 'session-1',
    trustedTimeCheckpointDigest: SHA_DIGEST,
  };
}

function route() {
  return brandCommissionedControlledRouteIdentityV1({
    channelRootDigest: SHA_DIGEST,
    verifierKeyId: 'verifier-key-1',
  });
}

function context() {
  return {
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    bootEpoch: 'boot-1',
    checkpointDigest: DIGEST,
  } as const;
}

function snapshot(keysetVersion = 1): VerifiedAciTrustSnapshot {
  const session = {
    role: 'generate',
    sessionId: 'session-1',
    model: 'provider/model-1',
    modelRevision: 'revision-1',
    expiresAt: 1_700_000_020_000,
  } as VerifiedAciSession;
  return {
    generation: 1,
    policyGeneration: 7,
    activationGeneration: 3,
    expiresAt: 1_700_000_020_000,
    keyset: {
      workloadId: 'workload-1',
      workloadKeysetDigest: DIGEST,
      channelKeyDigest: DIGEST,
      version: keysetVersion,
    } as never,
    channelPins: [],
    sessions: { generate: session } as never,
    supersededKeysetDigests: [],
  };
}

function production(binding: {
  readonly proofDigest: string;
  readonly bindingDigest: string;
}): ProductionVerifiedModelProvenanceV1 {
  const value = {
    schema: 'folklore.production-verified-model-provenance.v1',
    executionMode: 'production',
    status: 'verified',
    source: 'controlled-gateway',
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    role: 'generate',
    modelId: 'provider/model-1',
    modelRevision: 'revision-1',
    modelArtifactDigest: DIGEST,
    tupleDigest: DIGEST,
    bindingDigest: binding.bindingDigest,
    routeBindingDigest: `sha256:${binding.bindingDigest}`,
    policyDigest: DIGEST,
    policyGeneration: 7,
    activationGeneration: 3,
    sessionId: 'session-1',
    workloadKeysetDigest: DIGEST,
    proofDigest: binding.proofDigest,
    nativeEvidenceDigest: null,
    routeIdentityDigest: DIGEST,
    descriptorDigest: descriptor().descriptorDigest,
    channelRootDigest: SHA_DIGEST,
    verifierKeyId: 'verifier-key-1',
    decisionDigest: SHA_DIGEST,
    provenanceDigest: SHA_DIGEST,
  };
  fallbackProvenanceGuard.add(value);
  return value;
}

function highWater(keysetVersion = 1) {
  return {
    policyGeneration: 7,
    activationGeneration: 3,
    keysetVersion,
    generation: 1,
    currentKeysetDigest: DIGEST,
    supersededKeysetDigests: [],
    trustContext: context(),
  };
}

function makeConfig(
  authority: PreForwardAdmissionBindingAuthorityPort,
  calls: string[],
  journalCalls: unknown[],
): PreForwardAdmissionServiceConfig {
  const currentSnapshot = snapshot();
  const currentContext = context();
  const channel = {
    channelKeyDigest: DIGEST,
    exporterLabel: 'EXPORTER-ACI-CHANNEL',
    exporterDigest: DIGEST,
    transcriptDigest: DIGEST,
    observedChannelPin: undefined,
    sendControl: async () => undefined,
    receiveControlProof: async () => new Uint8Array(),
    writeBodyOnce: () => ({ response: Promise.resolve({} as never) }),
    close: async () => calls.push('close'),
  } as never;
  const reservation = { reservationId: 'reservation-1' } as never;
  return {
    trustState: {
      acquireWithTrustedTime: async () => currentSnapshot,
      refreshWithTrustedTime: async () => false,
    },
    channelPort: { open: async () => (calls.push('open'), channel) },
    controlProofExchange: {
      exchange: async () => new TextEncoder().encode(JSON.stringify(proof())),
      confirmCommitment: async () => {
        throw new Error();
      },
    },
    proofVerifier: {
      verify: async () => (calls.push('verify'), proof()),
    },
    proofClaimJournal: {
      claimProof: async (input) => {
        journalCalls.push(input);
        return committedProofClaim(input);
      },
    },
    trustedTime: {
      read: async () => ({ trustedNow: 1_700_000_005_000, ...currentContext }),
    },
    leaseStore: {
      reserveFromVerifiedProof: async () => (calls.push('reserve'), reservation),
      prepareCommitment: async () => {
        throw new Error();
      },
      finalize: async () => {
        throw new Error();
      },
      writeOnce: async () => {
        throw new Error();
      },
      abort: async () => undefined,
      recoverAfterRestart: async () => undefined,
      cleanup: async () => undefined,
    },
    keysetHighWater: {
      read: async () => highWater(),
      admitKeyset: async () => 1,
    },
    requestSerializer: {
      serialize: async () => {
        throw new Error();
      },
    },
    bindingAuthority: authority,
  };
}

function claimInput(): PreForwardProofClaimInput {
  return {
    descriptor: descriptor(),
    encodedProof: new TextEncoder().encode(JSON.stringify(proof())),
    expected: expected(),
    snapshot: { configurationGeneration: 1 } as VerifiedActivePolicySnapshotV1,
    roleBinding: {} as VerifiedActivePolicyRoleBindingV1,
    commissionedRoute: route(),
  };
}

function admittedInput(
  serviceDecision: Awaited<ReturnType<PreForwardAdmissionService['claimProof']>>,
  provenance: ProductionVerifiedModelProvenanceV1,
): ClaimedPreForwardAdmissionInput {
  return {
    admittedProof: serviceDecision,
    provenance,
    request: { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
    context: context(),
    challenge: { requestId: 'request-1', gatewayNonce: GATEWAY_NONCE, bootEpoch: 'boot-1' },
    descriptor: descriptor(),
  };
}

describe('PreForwardAdmissionService', () => {
  it('claims proof once before controlled provenance and admits only the service-minted decision', async () => {
    const authority = await admissionAuthority();
    const provenanceGuard = new WeakSet<object>();
    const calls: string[] = [];
    const journalCalls: unknown[] = [];
    const config = makeConfig(
      {
        ...authority,
        isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
          typeof value === 'object' && value !== null && provenanceGuard.has(value),
      },
      calls,
      journalCalls,
    );
    const service = new PreForwardAdmissionService(config);
    const decision = await service.claimProof(claimInput());
    const provenanceValue = production(decision.binding);
    provenanceGuard.add(provenanceValue);
    const capability = await service.admitClaimed(admittedInput(decision, provenanceValue));
    expect(capability).toBeDefined();
    expect(calls).toEqual(['verify', 'open', 'reserve']);
    expect(journalCalls).toHaveLength(1);
  });

  it('rejects endpoint substitution and leaves the admitted decision available only once', async () => {
    const authority = await admissionAuthority();
    const provenanceGuard = new WeakSet<object>();
    const calls: string[] = [];
    const config = makeConfig(
      {
        ...authority,
        isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
          typeof value === 'object' && value !== null && provenanceGuard.has(value),
      },
      calls,
      [],
    );
    const service = new PreForwardAdmissionService(config);
    const decision = await service.claimProof(claimInput());
    const provenanceValue = production(decision.binding);
    provenanceGuard.add(provenanceValue);
    const substituted = admittedInput(decision, provenanceValue);
    await expect(
      service.admitClaimed({
        ...substituted,
        request: { role: 'generate', endpoint: '/v1/other', method: 'POST' },
      }),
    ).rejects.toThrow();
    expect(calls).toEqual(['verify']);
  });

  it('rejects route substitution after claiming when the caller mutates expected', async () => {
    const authority = await admissionAuthority();
    const provenanceGuard = new WeakSet<object>();
    const calls: string[] = [];
    const config = makeConfig(
      {
        ...authority,
        isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
          typeof value === 'object' && value !== null && provenanceGuard.has(value),
      },
      calls,
      [],
    );
    const service = new PreForwardAdmissionService(config);
    const mutableExpected = { ...expected() } as { route: string } & Record<string, unknown>;
    const decision = await service.claimProof({ ...claimInput(), expected: mutableExpected });
    mutableExpected.route = '/v1/other';
    const provenanceValue = production(decision.binding);
    provenanceGuard.add(provenanceValue);
    await expect(
      service.admitClaimed({
        ...admittedInput(decision, provenanceValue),
        request: { role: 'generate', endpoint: '/v1/other', method: 'POST' },
      }),
    ).rejects.toThrow();
    expect(calls).toEqual(['verify']);
  });

  it('rejects checkpoint substitution after claiming', async () => {
    const authority = await admissionAuthority();
    const provenanceGuard = new WeakSet<object>();
    const calls: string[] = [];
    const config = makeConfig(
      {
        ...authority,
        isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
          typeof value === 'object' && value !== null && provenanceGuard.has(value),
      },
      calls,
      [],
    );
    const service = new PreForwardAdmissionService(config);
    const decision = await service.claimProof(claimInput());
    const provenanceValue = production(decision.binding);
    provenanceGuard.add(provenanceValue);
    await expect(
      service.admitClaimed({
        ...admittedInput(decision, provenanceValue),
        context: { ...context(), checkpointDigest: 'b'.repeat(64) },
      }),
    ).rejects.toThrow();
    expect(calls).toEqual(['verify']);
  });

  it('uses admission input snapshots when the caller mutates them during trust acquisition', async () => {
    const authority = await admissionAuthority();
    const provenanceGuard = new WeakSet<object>();
    const calls: string[] = [];
    let trustStarted!: () => void;
    let releaseTrust!: () => void;
    const trustStartedPromise = new Promise<void>((resolve) => {
      trustStarted = resolve;
    });
    const trustReleasePromise = new Promise<void>((resolve) => {
      releaseTrust = resolve;
    });
    const baseConfig = makeConfig(
      {
        ...authority,
        isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
          typeof value === 'object' && value !== null && provenanceGuard.has(value),
      },
      calls,
      [],
    );
    const originalContext = context();
    const config: PreForwardAdmissionServiceConfig = {
      ...baseConfig,
      trustState: {
        acquireWithTrustedTime: async (receivedContext) => {
          expect(receivedContext).toEqual(originalContext);
          expect(Object.isFrozen(receivedContext)).toBe(true);
          trustStarted();
          await trustReleasePromise;
          return snapshot();
        },
        refreshWithTrustedTime: async () => false,
      },
      keysetHighWater: {
        ...baseConfig.keysetHighWater,
        read: async (receivedContext: AciTrustContext) => {
          expect(receivedContext).toEqual(originalContext);
          return {
            policyGeneration: 7,
            activationGeneration: 3,
            keysetVersion: 1,
            generation: 1,
            currentKeysetDigest: DIGEST,
            supersededKeysetDigests: [],
            trustContext: originalContext,
          };
        },
      },
    };
    const service = new PreForwardAdmissionService(config);
    const decision = await service.claimProof(claimInput());
    const provenanceValue = production(decision.binding);
    provenanceGuard.add(provenanceValue);
    const admitted = admittedInput(decision, provenanceValue);
    const admission = service.admitClaimed(admitted);
    await trustStartedPromise;
    (admitted.request as { endpoint: string }).endpoint = '/v1/other';
    (admitted.context as { checkpointDigest: string }).checkpointDigest = 'c'.repeat(64);
    releaseTrust();
    const capability = await admission;
    expect(consumeForwardBodyOpenCapability(capability).request).toEqual({
      role: 'generate',
      endpoint: '/v1/chat/completions',
      method: 'POST',
    });
    expect(calls).toEqual(['verify', 'open', 'reserve']);
  });

  it('rejects replayed decisions and substituted provenance', async () => {
    const authority = await admissionAuthority();
    const provenanceGuard = new WeakSet<object>();
    const calls: string[] = [];
    const config = makeConfig(
      {
        ...authority,
        isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
          typeof value === 'object' && value !== null && provenanceGuard.has(value),
      },
      calls,
      [],
    );
    const service = new PreForwardAdmissionService(config);
    const decision = await service.claimProof(claimInput());
    const valid = production(decision.binding);
    provenanceGuard.add(valid);
    await expect(service.admitClaimed(admittedInput(decision, { ...valid }))).rejects.toThrow();
    await service.admitClaimed(admittedInput(decision, valid));
    await expect(service.admitClaimed(admittedInput(decision, valid))).rejects.toThrow();
  });

  it('rejects descriptor substitution and an uncommissioned route before claiming', async () => {
    const authority = await admissionAuthority();
    const config = makeConfig(authority, [], []);
    const service = new PreForwardAdmissionService(config);
    await expect(
      service.claimProof({
        ...claimInput(),
        descriptor: createOfficialAciRequestDescriptor({ ...descriptor(), requestId: 'request-2' }),
      }),
    ).rejects.toThrow();
    await expect(
      service.claimProof({
        ...claimInput(),
        commissionedRoute: {
          channelRootDigest: SHA_DIGEST,
          verifierKeyId: 'verifier-key-1',
        } as never,
      }),
    ).rejects.toThrow();
    expect(() =>
      brandCommissionedControlledRouteIdentityV1({
        channelRootDigest: 'not-a-sha256-digest',
        verifierKeyId: 'verifier-key-1',
      } as never),
    ).toThrow();
  });

  it('rejects a descriptor naming a different checkpoint than the verified expectation', async () => {
    const service = new PreForwardAdmissionService(makeConfig(await admissionAuthority(), [], []));
    await expect(
      service.claimProof({
        ...claimInput(),
        descriptor: createOfficialAciRequestDescriptor({
          ...descriptorFields(),
          trustedTimeCheckpointDigest: parseSha256DigestV1(`sha256:${'b'.repeat(64)}`),
        }),
      }),
    ).rejects.toThrow();
  });

  it('rejects a descriptor naming a different configuration generation than the policy snapshot', async () => {
    const service = new PreForwardAdmissionService(makeConfig(await admissionAuthority(), [], []));
    await expect(
      service.claimProof({
        ...claimInput(),
        descriptor: createOfficialAciRequestDescriptor({
          ...descriptorFields(),
          configurationGeneration: 2,
        }),
      }),
    ).rejects.toThrow();
    await expect(
      service.claimProof({
        ...claimInput(),
        snapshot: { configurationGeneration: 2 } as VerifiedActivePolicySnapshotV1,
      }),
    ).rejects.toThrow();
  });

  it('rejects a commissioned route whose verifier key is not the proof issuer key', async () => {
    const service = new PreForwardAdmissionService(makeConfig(await admissionAuthority(), [], []));
    await expect(
      service.claimProof({
        ...claimInput(),
        commissionedRoute: brandCommissionedControlledRouteIdentityV1({
          channelRootDigest: SHA_DIGEST,
          verifierKeyId: 'other-key-1',
        }),
      }),
    ).rejects.toThrow();
  });

  it('rejects a claim whose descriptor names a keyset version other than the verified keyset', async () => {
    const authority = await admissionAuthority();
    const provenanceGuard = new WeakSet<object>();
    const journalCalls: unknown[] = [];
    const baseConfig = makeConfig(
      {
        ...authority,
        isProductionProvenance: (value): value is ProductionVerifiedModelProvenanceV1 =>
          typeof value === 'object' && value !== null && provenanceGuard.has(value),
      },
      [],
      journalCalls,
    );
    const service = new PreForwardAdmissionService({
      ...baseConfig,
      trustState: {
        ...baseConfig.trustState,
        acquireWithTrustedTime: async () => snapshot(2),
      },
      keysetHighWater: { ...baseConfig.keysetHighWater, read: async () => highWater(2) },
    });
    // The claim is what mints the durable request identity, so a descriptor naming a keyset the
    // verified snapshot does not attest is rejected before any claim record exists.
    await expect(service.claimProof(claimInput())).rejects.toThrow();
    expect(journalCalls).toEqual([]);
  });

  it('stamps the durable proof claim from the injected trusted time, not the host clock', async () => {
    const journalCalls: unknown[] = [];
    const service = new PreForwardAdmissionService(
      makeConfig(await admissionAuthority(), [], journalCalls),
    );
    const decision = await service.claimProof(claimInput());
    expect(decision.proofClaim.record.recordedAt).toBe('2023-11-14T22:13:25.000Z');
    expect(journalCalls).toEqual([
      expect.objectContaining({ recordedAt: '2023-11-14T22:13:25.000Z' }),
    ]);
  });

  describe('descriptor field authority binding', () => {
    // Every field hashed into `descriptorDigest` becomes durable request identity, so every field
    // must be compared against an authority carrier in `assertDescriptorMatchesProof`: the signed
    // proof (including its tenant context), the caller's proof-verified expectation, the branded
    // commissioned route, or the branded verified policy snapshot. A field that only the caller
    // controls would let a request mint an identity for a route or assignment no authority attests.
    //
    // The table below is complete by construction: the first test compares its keys to the fields
    // of a minted descriptor, so a new preimage field fails here until it has a mutation here, and
    // the value is only admitted once a carrier rejects the mutation.
    const OTHER_SHA_DIGEST = parseSha256DigestV1(`sha256:${'b'.repeat(64)}`);

    function mutations(): Record<string, unknown> {
      return {
        version: 2,
        orgId: 'org-2',
        deploymentId: 'deployment-2',
        assignmentDigest: OTHER_SHA_DIGEST,
        requestId: 'request-2',
        activePolicyDigest: OTHER_SHA_DIGEST,
        policyGeneration: 8,
        activationGeneration: 4,
        configurationGeneration: 2,
        keysetVersion: 2,
        bootEpoch: 'boot-2',
        role: 'embed',
        modelId: 'provider/other-model',
        modelRevision: 'revision-2',
        modelArtifactDigest: OTHER_SHA_DIGEST,
        routeIdentityDigest: OTHER_SHA_DIGEST,
        channelRootDigest: OTHER_SHA_DIGEST,
        sessionId: 'session-2',
        trustedTimeCheckpointDigest: OTHER_SHA_DIGEST,
      };
    }

    function descriptorFieldNames(): string[] {
      return Object.keys(descriptor()).filter(
        (key) =>
          key !== 'schema' &&
          key !== 'descriptorDigest' &&
          key !== '__officialAciRequestDescriptorV1',
      );
    }

    it('binds every minted descriptor field to a carrier', () => {
      expect(Object.keys(mutations()).sort()).toEqual(descriptorFieldNames().sort());
    });

    it('admits the unmutated descriptor, so the rejection table is not vacuous', async () => {
      const service = new PreForwardAdmissionService(
        makeConfig(await admissionAuthority(), [], []),
      );
      await expect(service.claimProof(claimInput())).resolves.toBeDefined();
    });

    it.each(Object.keys(mutations()))(
      'rejects a descriptor whose %s names no carrier value',
      async (field) => {
        const service = new PreForwardAdmissionService(
          makeConfig(await admissionAuthority(), [], []),
        );
        const mutated = {
          ...descriptorFields(),
          [field]: mutations()[field],
        } as OfficialAciRequestDescriptorFieldsV1;
        // The async wrapper keeps a construction-time rejection (`version`) and an admission-time
        // rejection indistinguishable to the assertion, which is what "never admitted" means here.
        await expect(
          (async () =>
            service.claimProof({
              ...claimInput(),
              descriptor: createOfficialAciRequestDescriptor(mutated),
            }))(),
        ).rejects.toThrow();
      },
    );
  });
});
