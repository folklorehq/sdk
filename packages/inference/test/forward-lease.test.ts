// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ForwardLeaseStore, ForwardLeaseStoreError } from '../src/aci/ForwardLeaseStore.js';
import type { ForwardProofReservation, PrivateOfficialAciRequestWire } from '../src/ports.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);

function wire(bytes = new Uint8Array([1, 2, 3])): PrivateOfficialAciRequestWire {
  return {
    bytes,
    requestWireSha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

function reservation(overrides: Partial<ForwardProofReservation> = {}): ForwardProofReservation {
  const privateRequestWire = wire();
  return {
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    tenantId: 'org-1',
    assignmentDigest: DIGEST_A,
    workloadId: 'workload-1',
    runtimeIdentityDigest: DIGEST_B,
    workloadArtifactDigest: DIGEST_C,
    pinnedTrustRootDigest: DIGEST_D,
    workloadKeysetDigest: DIGEST_A,
    tenantAadDigest: DIGEST_B,
    bootEpoch: 'boot-1',
    trustedTimeCheckpointDigest: DIGEST_C,
    gatewayNonce: 'gateway-nonce-1',
    proofId: 'proof-1',
    requestId: 'request-1',
    snapshotDigest: DIGEST_C,
    policyDigest: DIGEST_D,
    role: 'generate',
    sessionId: 'session-1',
    model: 'provider/model-1',
    modelRevision: 'revision-1',
    modelArtifactDigest: DIGEST_C,
    capabilityDigest: DIGEST_A,
    origin: 'https://model.example',
    route: '/v1/chat/completions',
    method: 'POST',
    routeIdentityDigest: DIGEST_B,
    channelKeyDigest: DIGEST_C,
    exporterLabel: 'EXPORTER-ACI-CHANNEL',
    exporterDigest: DIGEST_D,
    transcriptDigest: DIGEST_A,
    policyGeneration: 7,
    activationGeneration: 3,
    requestWireSha256: privateRequestWire.requestWireSha256,
    requestWireByteLength: privateRequestWire.byteLength,
    privateRequestWire,
    proofIssuedAt: 1_700_000_000_000,
    proofExpiresAt: 1_700_000_030_000,
    snapshotExpiresAt: 1_700_000_040_000,
    admissionExpiresAt: 1_700_000_025_000,
    boundedWriteValidUntil: 1_700_000_020_000,
    ...overrides,
  };
}

describe('ForwardLeaseStore', () => {
  it('atomically reserves one proof per org, deployment, boot epoch, and proof id', async () => {
    const store = new ForwardLeaseStore();
    const first = await store.reserve(reservation());

    expect(first.leaseId).not.toBe('');
    await expect(store.reserve(reservation())).rejects.toMatchObject({ code: 'proof_replay' });
    await expect(
      store.reserve(reservation({ deploymentId: 'deployment-2' })),
    ).resolves.toMatchObject({ deploymentId: 'deployment-2' });
    await expect(store.reserve(reservation({ orgId: 'org-2' }))).resolves.toMatchObject({
      orgId: 'org-2',
    });
  });

  it('rejects a private-wire hash, length, or byte mutation before consuming the lease', async () => {
    const store = new ForwardLeaseStore();
    const lease = await store.reserve(reservation());
    const mutated = new Uint8Array(lease.privateRequestWire.bytes);
    mutated[0] ^= 1;

    await expect(
      store.consume({ lease, candidateRequestWire: wire(mutated) }),
    ).rejects.toMatchObject({ code: 'request_wire_mismatch' });
    await expect(
      store.consume({ lease, candidateRequestWire: lease.privateRequestWire }),
    ).resolves.toBeUndefined();
  });

  it('rejects non-finite or incoherent lease times at reservation', async () => {
    const invalid: Array<Partial<ForwardProofReservation>> = [
      { proofIssuedAt: Number.NaN },
      { proofExpiresAt: Number.POSITIVE_INFINITY },
      { snapshotExpiresAt: 1_700_000_000_000.5 },
      { admissionExpiresAt: 0 },
      { boundedWriteValidUntil: 1_700_000_000_000 },
      { proofExpiresAt: 1_700_000_000_000 },
      { boundedWriteValidUntil: 1_700_000_030_001 },
    ];

    for (const override of invalid) {
      await expect(new ForwardLeaseStore().reserve(reservation(override))).rejects.toMatchObject({
        code: 'lease_invalid',
      });
    }
  });

  it('erases private wire bytes from a consumed returned lease while retaining the replay marker', async () => {
    const store = new ForwardLeaseStore();
    const lease = await store.reserve(reservation());
    const leaseBytes = Uint8Array.from(lease.privateRequestWire.bytes);

    await store.consume({ lease, candidateRequestWire: lease.privateRequestWire });

    expect(lease.privateRequestWire.bytes).toEqual(new Uint8Array(leaseBytes.length));
    await expect(
      store.consume({ lease, candidateRequestWire: lease.privateRequestWire }),
    ).rejects.toMatchObject({ code: 'lease_replay' });
    await expect(store.reserve(reservation())).rejects.toMatchObject({ code: 'proof_replay' });
  });

  it('fails closed when the bounded lease replay capacity is exhausted', async () => {
    const store = Reflect.construct(ForwardLeaseStore, [
      { replayCapacity: 1 },
    ]) as ForwardLeaseStore;

    await store.reserve(reservation());
    await expect(store.reserve(reservation({ proofId: 'proof-2' }))).rejects.toMatchObject({
      code: 'lease_capacity_exhausted',
    });
  });

  it('binds every lease field and rejects lease reuse without releasing the reservation', async () => {
    const store = new ForwardLeaseStore();
    const lease = await store.reserve(reservation());
    const mutations: Array<[keyof typeof lease, unknown]> = [
      ['orgId', 'org-2'],
      ['deploymentId', 'deployment-2'],
      ['tenantId', 'org-2'],
      ['assignmentDigest', '1'.repeat(64)],
      ['workloadId', 'workload-2'],
      ['runtimeIdentityDigest', '1'.repeat(64)],
      ['workloadArtifactDigest', '1'.repeat(64)],
      ['pinnedTrustRootDigest', '1'.repeat(64)],
      ['workloadKeysetDigest', '1'.repeat(64)],
      ['tenantAadDigest', '1'.repeat(64)],
      ['bootEpoch', 'boot-2'],
      ['trustedTimeCheckpointDigest', '1'.repeat(64)],
      ['gatewayNonce', 'gateway-nonce-2'],
      ['proofId', 'proof-2'],
      ['requestId', 'request-2'],
      ['snapshotDigest', '1'.repeat(64)],
      ['policyDigest', '1'.repeat(64)],
      ['role', 'embed'],
      ['sessionId', 'session-2'],
      ['model', 'provider/model-2'],
      ['modelRevision', 'revision-2'],
      ['modelArtifactDigest', '1'.repeat(64)],
      ['capabilityDigest', '1'.repeat(64)],
      ['origin', 'https://other.example'],
      ['route', '/v1/other'],
      ['routeIdentityDigest', '1'.repeat(64)],
      ['channelKeyDigest', '1'.repeat(64)],
      ['exporterLabel', 'EXPORTER-OTHER'],
      ['exporterDigest', '1'.repeat(64)],
      ['transcriptDigest', '1'.repeat(64)],
      ['policyGeneration', 8],
      ['activationGeneration', 4],
      ['requestWireSha256', '1'.repeat(64)],
      ['requestWireByteLength', lease.requestWireByteLength + 1],
      ['proofIssuedAt', lease.proofIssuedAt + 1],
      ['proofExpiresAt', lease.proofExpiresAt + 1],
      ['snapshotExpiresAt', lease.snapshotExpiresAt + 1],
      ['admissionExpiresAt', lease.admissionExpiresAt + 1],
      ['boundedWriteValidUntil', lease.boundedWriteValidUntil + 1],
    ];

    for (const [field, value] of mutations) {
      const changed = { ...lease, [field]: value };
      await expect(
        store.consume({ lease: changed, candidateRequestWire: lease.privateRequestWire }),
      ).rejects.toMatchObject({ code: 'lease_binding_mismatch' });
    }

    const changedWire = {
      ...lease,
      privateRequestWire: wire(new Uint8Array([9, 2, 3])),
    };
    await expect(
      store.consume({ lease: changedWire, candidateRequestWire: lease.privateRequestWire }),
    ).rejects.toMatchObject({ code: 'request_wire_mismatch' });
    await expect(
      store.consume({ lease, candidateRequestWire: lease.privateRequestWire }),
    ).resolves.toBeUndefined();
    await expect(
      store.consume({ lease, candidateRequestWire: lease.privateRequestWire }),
    ).rejects.toMatchObject({ code: 'lease_replay' });
    await expect(store.reserve(reservation())).rejects.toMatchObject({ code: 'proof_replay' });
  });

  it('keeps failures content-free', async () => {
    const store = new ForwardLeaseStore();
    const lease = await store.reserve(reservation());
    const candidate = { ...lease, model: 'provider/customer-secret' };

    try {
      await store.consume({ lease: candidate, candidateRequestWire: lease.privateRequestWire });
    } catch (error) {
      expect(error).toBeInstanceOf(ForwardLeaseStoreError);
      expect((error as Error).message).not.toContain('customer-secret');
    }
  });

  it('does not mutate caller-owned wire aliases while retaining only private copies', async () => {
    const store = new ForwardLeaseStore();
    const sourceBytes = new Uint8Array([7, 8, 9]);
    const sourceWire = wire(sourceBytes);
    const lease = await store.reserve(
      reservation({
        privateRequestWire: sourceWire,
        requestWireSha256: sourceWire.requestWireSha256,
        requestWireByteLength: sourceWire.byteLength,
      }),
    );
    const leaseBytes = Uint8Array.from(lease.privateRequestWire.bytes);
    const candidateBytes = Uint8Array.from(lease.privateRequestWire.bytes);

    await store.consume({
      lease,
      candidateRequestWire: wire(candidateBytes),
    });

    expect(sourceBytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(sourceWire.bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(candidateBytes).toEqual(leaseBytes);
    expect(lease.privateRequestWire.bytes).toEqual(new Uint8Array(leaseBytes.length));
  });
});
