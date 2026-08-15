// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from 'node:crypto';

import type {
  ForwardLease,
  ForwardProofReservation,
  ForwardLeaseStorePort,
  PrivateOfficialAciRequestWire,
} from '../ports.js';

const RESERVATION_KEY_SEPARATOR = '\u0000';
const DEFAULT_REPLAY_CAPACITY = 4_096;
const MAX_REPLAY_CAPACITY = 65_536;
const LEASE_TIME_FIELDS = [
  'proofIssuedAt',
  'proofExpiresAt',
  'snapshotExpiresAt',
  'admissionExpiresAt',
  'boundedWriteValidUntil',
] as const satisfies readonly (keyof ForwardProofReservation)[];

const LEASE_BINDING_FIELDS = [
  'orgId',
  'deploymentId',
  'tenantId',
  'assignmentDigest',
  'workloadId',
  'runtimeIdentityDigest',
  'workloadArtifactDigest',
  'pinnedTrustRootDigest',
  'workloadKeysetDigest',
  'tenantAadDigest',
  'bootEpoch',
  'trustedTimeCheckpointDigest',
  'gatewayNonce',
  'proofId',
  'requestId',
  'snapshotDigest',
  'policyDigest',
  'role',
  'sessionId',
  'model',
  'modelRevision',
  'modelArtifactDigest',
  'capabilityDigest',
  'origin',
  'route',
  'method',
  'routeIdentityDigest',
  'channelKeyDigest',
  'exporterLabel',
  'exporterDigest',
  'transcriptDigest',
  'policyGeneration',
  'activationGeneration',
  'requestWireSha256',
  'requestWireByteLength',
  'proofIssuedAt',
  'proofExpiresAt',
  'snapshotExpiresAt',
  'admissionExpiresAt',
  'boundedWriteValidUntil',
] as const satisfies readonly (keyof ForwardProofReservation)[];

export type ForwardLeaseStoreErrorCode =
  | 'lease_binding_mismatch'
  | 'lease_invalid'
  | 'lease_capacity_exhausted'
  | 'lease_replay'
  | 'proof_replay'
  | 'request_wire_mismatch';

export class ForwardLeaseStoreError extends Error {
  readonly code: ForwardLeaseStoreErrorCode;

  constructor(code: ForwardLeaseStoreErrorCode) {
    super(`Forward lease failed: ${code}`);
    this.name = 'ForwardLeaseStoreError';
    this.code = code;
  }
}

interface StoredLease {
  readonly lease: ForwardLease;
  consumed: boolean;
}

export interface ForwardLeaseStoreConfig {
  readonly replayCapacity?: number;
}

export class ForwardLeaseStore implements ForwardLeaseStorePort {
  private readonly reservations = new Map<string, StoredLease>();
  private readonly leases = new Map<string, StoredLease>();
  private readonly replayCapacity: number;

  constructor(config: ForwardLeaseStoreConfig = {}) {
    const replayCapacity = config.replayCapacity ?? DEFAULT_REPLAY_CAPACITY;
    if (
      !Number.isSafeInteger(replayCapacity) ||
      replayCapacity <= 0 ||
      replayCapacity > MAX_REPLAY_CAPACITY
    ) {
      throw new ForwardLeaseStoreError('lease_invalid');
    }
    this.replayCapacity = replayCapacity;
  }

  async reserve(input: ForwardProofReservation): Promise<ForwardLease> {
    this.validateLeaseTimes(input);
    this.validateWire(
      input.privateRequestWire,
      input.requestWireSha256,
      input.requestWireByteLength,
    );
    const reservationKey = this.reservationKey(input);
    if (this.reservations.has(reservationKey)) {
      throw new ForwardLeaseStoreError('proof_replay');
    }
    if (this.reservations.size >= this.replayCapacity) {
      throw new ForwardLeaseStoreError('lease_capacity_exhausted');
    }
    const lease: ForwardLease = {
      ...input,
      leaseId: randomBytes(16).toString('hex'),
      privateRequestWire: this.copyWire(input.privateRequestWire),
    };
    const stored: StoredLease = { lease, consumed: false };
    this.reservations.set(reservationKey, stored);
    this.leases.set(lease.leaseId, stored);
    return this.copyLease(lease);
  }

  async consume(input: {
    lease: ForwardLease;
    candidateRequestWire: PrivateOfficialAciRequestWire;
  }): Promise<void> {
    const stored = this.leases.get(input.lease.leaseId);
    if (stored === undefined) throw new ForwardLeaseStoreError('lease_invalid');
    this.validateLeaseTimes(input.lease);
    if (!this.sameBinding(stored.lease, input.lease)) {
      throw new ForwardLeaseStoreError('lease_binding_mismatch');
    }
    if (stored.consumed) throw new ForwardLeaseStoreError('lease_replay');
    this.validateWire(
      input.candidateRequestWire,
      input.lease.requestWireSha256,
      input.lease.requestWireByteLength,
    );
    if (!this.sameWire(stored.lease.privateRequestWire, input.candidateRequestWire)) {
      throw new ForwardLeaseStoreError('request_wire_mismatch');
    }
    if (!this.sameWire(stored.lease.privateRequestWire, input.lease.privateRequestWire)) {
      throw new ForwardLeaseStoreError('request_wire_mismatch');
    }
    stored.consumed = true;
    this.eraseWire(stored.lease.privateRequestWire);
    this.eraseWire(input.lease.privateRequestWire);
  }

  private reservationKey(input: ForwardProofReservation): string {
    return [input.orgId, input.deploymentId, input.bootEpoch, input.proofId].join(
      RESERVATION_KEY_SEPARATOR,
    );
  }

  private sameBinding(left: ForwardLease, right: ForwardLease): boolean {
    return (
      left.leaseId === right.leaseId &&
      LEASE_BINDING_FIELDS.every((field) => left[field] === right[field])
    );
  }

  private validateWire(
    wire: PrivateOfficialAciRequestWire,
    expectedHash: string,
    expectedLength: number,
  ): void {
    if (
      wire.byteLength !== expectedLength ||
      wire.bytes.byteLength !== expectedLength ||
      wire.requestWireSha256 !== expectedHash ||
      expectedHash !== this.digest(wire.bytes)
    ) {
      throw new ForwardLeaseStoreError('request_wire_mismatch');
    }
  }

  private validateLeaseTimes(lease: ForwardProofReservation): void {
    if (
      LEASE_TIME_FIELDS.some((field) => !Number.isSafeInteger(lease[field]) || lease[field] <= 0)
    ) {
      throw new ForwardLeaseStoreError('lease_invalid');
    }
    const expiries = [lease.proofExpiresAt, lease.snapshotExpiresAt, lease.admissionExpiresAt];
    if (
      expiries.some((expiry) => expiry <= lease.proofIssuedAt) ||
      lease.boundedWriteValidUntil <= lease.proofIssuedAt ||
      lease.boundedWriteValidUntil > Math.min(...expiries)
    ) {
      throw new ForwardLeaseStoreError('lease_invalid');
    }
  }

  private sameWire(
    left: PrivateOfficialAciRequestWire,
    right: PrivateOfficialAciRequestWire,
  ): boolean {
    if (
      left.byteLength !== right.byteLength ||
      left.requestWireSha256 !== right.requestWireSha256 ||
      left.bytes.byteLength !== right.bytes.byteLength
    ) {
      return false;
    }
    for (let index = 0; index < left.bytes.byteLength; index += 1) {
      if (left.bytes[index] !== right.bytes[index]) return false;
    }
    return true;
  }

  private copyWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
    return Object.freeze({
      bytes: Uint8Array.from(wire.bytes),
      requestWireSha256: wire.requestWireSha256,
      byteLength: wire.byteLength,
    });
  }

  private copyLease(lease: ForwardLease): ForwardLease {
    return Object.freeze({ ...lease, privateRequestWire: this.copyWire(lease.privateRequestWire) });
  }

  private eraseWire(wire: PrivateOfficialAciRequestWire): void {
    wire.bytes.fill(0);
  }

  private digest(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
