// SPDX-License-Identifier: Apache-2.0
import type {
  AciChannelTransportResponse,
  ForwardAdmissionCapability,
  ForwardAdmissionReservation,
  ForwardBodyOpenCapability,
  ForwardLease,
  ForwardLeaseStorePort,
  ForwardWritePermit,
  MutuallyAttestedChannel,
  PrivateOfficialAciRequestWire,
  TrustedTimeAuthorityPort,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
  VerifiedCommitmentConfirmation,
} from '../ports.js';

export interface ForwardAdmissionCapabilityData {
  readonly channel: MutuallyAttestedChannel;
  readonly lease: ForwardLease;
  readonly requestWire: PrivateOfficialAciRequestWire;
  readonly confirmation: VerifiedCommitmentConfirmation;
  readonly leaseStore: ForwardLeaseStorePort;
  readonly trustedTime: TrustedTimeAuthorityPort;
}

const records = new WeakMap<object, ForwardAdmissionCapabilityData>();
const consumed = new WeakSet<object>();
const bodyOpenRecords = new WeakMap<object, ForwardBodyOpenCapabilityData>();
const bodyOpenConsumed = new WeakSet<object>();

export interface ForwardBodyOpenCapabilityData {
  readonly channel: MutuallyAttestedChannel;
  readonly reservation: ForwardAdmissionReservation;
  readonly snapshot: VerifiedAciTrustSnapshot;
  readonly session: VerifiedAciSession;
  readonly request: {
    readonly role: VerifiedAciSession['role'];
    readonly endpoint: string;
    readonly method: 'POST';
  };
}

export function issueForwardAdmissionCapability(
  data: ForwardAdmissionCapabilityData,
): ForwardAdmissionCapability {
  const capability = Object.freeze({});
  records.set(capability, {
    ...data,
    requestWire: copyWire(data.requestWire),
  });
  return capability as ForwardAdmissionCapability;
}

export function consumeForwardAdmissionCapability(
  capability: ForwardAdmissionCapability,
): ForwardAdmissionCapabilityData {
  if (typeof capability !== 'object' || capability === null) throw new Error('admission_required');
  const object = capability as object;
  const data = records.get(object);
  if (data === undefined || consumed.has(object)) throw new Error('admission_required');
  consumed.add(object);
  return data;
}

export function inspectForwardAdmissionCapability(
  capability: ForwardAdmissionCapability,
): ForwardAdmissionCapabilityData {
  if (typeof capability !== 'object' || capability === null) throw new Error('admission_required');
  const data = records.get(capability as object);
  if (data === undefined || consumed.has(capability as object)) {
    throw new Error('admission_required');
  }
  return data;
}

export function releaseForwardAdmissionCapability(capability: ForwardAdmissionCapability): void {
  if (typeof capability !== 'object' || capability === null) return;
  const object = capability as object;
  consumed.add(object);
  const data = records.get(object);
  data?.requestWire.bytes.fill(0);
  data?.lease.privateRequestWire.bytes.fill(0);
}

export async function abortForwardAdmissionCapability(
  capability: ForwardAdmissionCapability,
  reason: string,
): Promise<void> {
  let data: ForwardAdmissionCapabilityData;
  try {
    data = inspectForwardAdmissionCapability(capability);
  } catch {
    return;
  }
  try {
    await data.leaseStore.abort({
      context: {
        orgId: data.lease.orgId,
        deploymentId: data.lease.deploymentId,
        bootEpoch: data.lease.bootEpoch,
        checkpointDigest: data.lease.trustedTimeCheckpointDigest,
      },
      reservationId: data.lease.reservationId,
      leaseId: data.lease.leaseId,
      reason,
    });
  } catch {
    return;
  } finally {
    await closeChannel(data.channel);
    releaseForwardAdmissionCapability(capability);
  }
}

export function issueForwardBodyOpenCapability(
  data: ForwardBodyOpenCapabilityData,
): ForwardBodyOpenCapability {
  const capability = Object.freeze({});
  bodyOpenRecords.set(capability, data);
  return capability as ForwardBodyOpenCapability;
}

export function consumeForwardBodyOpenCapability(
  capability: ForwardBodyOpenCapability,
): ForwardBodyOpenCapabilityData {
  if (typeof capability !== 'object' || capability === null) throw new Error('admission_required');
  const object = capability as object;
  const data = bodyOpenRecords.get(object);
  if (data === undefined || bodyOpenConsumed.has(object)) throw new Error('admission_required');
  bodyOpenConsumed.add(object);
  return data;
}

export function releaseForwardBodyOpenCapability(capability: ForwardBodyOpenCapability): void {
  if (typeof capability === 'object' && capability !== null)
    bodyOpenConsumed.add(capability as object);
}

function copyWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
  return {
    bytes: Uint8Array.from(wire.bytes),
    requestWireSha256: wire.requestWireSha256,
    byteLength: wire.byteLength,
  };
}

async function closeChannel(channel: MutuallyAttestedChannel): Promise<void> {
  try {
    await channel.close();
  } catch {
    return;
  }
}

export type NativeAciResponse = AciChannelTransportResponse;
export type ForwardWritePermitType = ForwardWritePermit;
