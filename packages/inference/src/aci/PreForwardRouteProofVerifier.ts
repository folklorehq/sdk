// SPDX-License-Identifier: Apache-2.0
import { createPublicKey, type KeyObject, verify as verifySignature } from 'node:crypto';

import { preForwardRouteProofSchema, type PreForwardRouteProofV1 } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';

import { parseStrictJsonBytes } from './strict-json.js';
import type {
  PreForwardRouteBinding,
  PreForwardRouteProofVerificationInput,
  PreForwardRouteProofVerifierPort,
  TrustedTimeAuthorityPort,
} from '../ports.js';
import { readTrustedTimeSample } from './trusted-time.js';

const PROOF_DOMAIN = 'folklore.pre-forward-route-proof.v1';
const DEFAULT_MAX_PROOF_BYTES = 1_048_576;
const DEFAULT_MAX_PROOF_LIFETIME_MS = 60_000;
const MAX_PROOF_BYTES = 1_048_576;
const MAX_PROOF_LIFETIME_MS = 300_000;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_RAW_LENGTH = 32;
const ED25519_DER_LENGTH = 44;
const BASE64_SIGNATURE_LENGTH = 64;
const MAX_REPLAY_CAPACITY = 65_536;

type PreForwardIssuerKey = KeyObject | Uint8Array | string;

type PreForwardRouteProofVerificationErrorCode =
  | 'proof_invalid'
  | 'proof_replay'
  | 'proof_stale'
  | 'trusted_time_unavailable';

export class PreForwardRouteProofVerificationError extends Error {
  readonly code: PreForwardRouteProofVerificationErrorCode;

  constructor(code: PreForwardRouteProofVerificationErrorCode) {
    super(`Pre-forward route proof verification failed: ${code}`);
    this.name = 'PreForwardRouteProofVerificationError';
    this.code = code;
  }
}

export interface PreForwardRouteProofVerifierConfig {
  readonly trustedTimeAuthority: TrustedTimeAuthorityPort;
  readonly issuerKeys?:
    | ReadonlyMap<string, PreForwardIssuerKey>
    | Readonly<Record<string, PreForwardIssuerKey>>;
  readonly issuerPublicKey?: PreForwardIssuerKey;
  readonly issuerPublicKeyId?: string;
  readonly resolveIssuerKey?: (
    keyId: string,
  ) => PreForwardIssuerKey | undefined | Promise<PreForwardIssuerKey | undefined>;
  readonly maximumProofLifetimeMs?: number;
  readonly maxProofBytes?: number;
  readonly replayCapacity?: number;
}

export function preForwardRouteProofPayload(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  const record = value as Record<string, unknown>;
  const auth = record['auth'];
  if (auth === null || typeof auth !== 'object' || Array.isArray(auth)) throw new Error();
  const { signature: _signature, ...unsignedAuth } = auth as Record<string, unknown>;
  return `${PROOF_DOMAIN}\u0000${canonicalJson({
    ...record,
    auth: unsignedAuth,
  })}`;
}

export class PreForwardRouteProofVerifier implements PreForwardRouteProofVerifierPort {
  private readonly trustedTimeAuthority: TrustedTimeAuthorityPort;
  private readonly issuerKeys:
    | ReadonlyMap<string, PreForwardIssuerKey>
    | Readonly<Record<string, PreForwardIssuerKey>>
    | undefined;
  private readonly issuerPublicKey: PreForwardIssuerKey | undefined;
  private readonly issuerPublicKeyId: string | undefined;
  private readonly resolveIssuerKey:
    | ((
        keyId: string,
      ) => PreForwardIssuerKey | undefined | Promise<PreForwardIssuerKey | undefined>)
    | undefined;
  private readonly maximumProofLifetimeMs: number;
  private readonly maxProofBytes: number;
  private readonly reservedProofs = new Set<string>();
  private readonly pendingProofs = new Set<string>();
  private readonly replayCapacity: number;

  constructor(config: PreForwardRouteProofVerifierConfig) {
    if (typeof config.trustedTimeAuthority?.read !== 'function') {
      throw new PreForwardRouteProofVerificationError('trusted_time_unavailable');
    }
    this.trustedTimeAuthority = config.trustedTimeAuthority;
    this.issuerKeys = config.issuerKeys;
    this.issuerPublicKey = config.issuerPublicKey;
    this.issuerPublicKeyId = config.issuerPublicKeyId;
    this.resolveIssuerKey = config.resolveIssuerKey;
    this.maximumProofLifetimeMs = this.positiveBoundedInteger(
      config.maximumProofLifetimeMs ?? DEFAULT_MAX_PROOF_LIFETIME_MS,
      MAX_PROOF_LIFETIME_MS,
    );
    this.maxProofBytes = this.positiveBoundedInteger(
      config.maxProofBytes ?? DEFAULT_MAX_PROOF_BYTES,
      MAX_PROOF_BYTES,
    );
    this.replayCapacity = this.boundedReplayCapacity(config.replayCapacity ?? MAX_REPLAY_CAPACITY);
  }

  async verify(input: PreForwardRouteProofVerificationInput): Promise<PreForwardRouteProofV1> {
    const proof = this.parse(input.encodedProof);
    const proofKey = this.proofKey(proof);
    if (this.reservedProofs.has(proofKey) || this.pendingProofs.has(proofKey)) {
      throw new PreForwardRouteProofVerificationError('proof_replay');
    }
    if (this.reservedProofs.size >= this.replayCapacity) {
      throw new PreForwardRouteProofVerificationError('proof_replay');
    }
    let issuerKey: PreForwardIssuerKey | undefined;
    try {
      issuerKey = await this.findIssuerKey(proof.issuer.keyId);
    } catch {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
    if (issuerKey === undefined || !this.verifySignature(proof, issuerKey)) {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
    this.verifyBindings(proof, input.expected);
    if (this.reservedProofs.has(proofKey) || this.pendingProofs.has(proofKey)) {
      throw new PreForwardRouteProofVerificationError('proof_replay');
    }
    if (this.pendingProofs.size >= this.replayCapacity) {
      throw new PreForwardRouteProofVerificationError('proof_replay');
    }
    this.pendingProofs.add(proofKey);
    try {
      const trustedNow = await this.readTrustedTime(input.expected);
      if (
        proof.issuedAt > trustedNow ||
        proof.expiresAt <= trustedNow ||
        proof.expiresAt - proof.issuedAt > this.maximumProofLifetimeMs
      ) {
        throw new PreForwardRouteProofVerificationError('proof_stale');
      }
      this.reservedProofs.add(proofKey);
      return proof;
    } finally {
      this.pendingProofs.delete(proofKey);
    }
  }

  private parse(encodedProof: Uint8Array): PreForwardRouteProofV1 {
    try {
      const decoded = parseStrictJsonBytes(encodedProof, this.maxProofBytes);
      const parsed = preForwardRouteProofSchema.safeParse(decoded);
      if (!parsed.success) throw new Error();
      return parsed.data;
    } catch {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
  }

  private async findIssuerKey(keyId: string): Promise<PreForwardIssuerKey | undefined> {
    if (this.resolveIssuerKey !== undefined) return this.resolveIssuerKey(keyId);
    if (this.issuerKeys instanceof Map) return this.issuerKeys.get(keyId);
    if (this.issuerKeys !== undefined) {
      return (this.issuerKeys as Readonly<Record<string, PreForwardIssuerKey>>)[keyId];
    }
    return this.issuerPublicKeyId === keyId ? this.issuerPublicKey : undefined;
  }

  private verifySignature(proof: PreForwardRouteProofV1, issuerKey: PreForwardIssuerKey): boolean {
    try {
      const key = this.toPublicKey(issuerKey);
      if (key.asymmetricKeyType !== 'ed25519') return false;
      const signature = Buffer.from(proof.auth.signature, 'base64');
      if (signature.byteLength !== BASE64_SIGNATURE_LENGTH) return false;
      return verifySignature(null, Buffer.from(preForwardRouteProofPayload(proof)), key, signature);
    } catch {
      return false;
    }
  }

  private toPublicKey(value: PreForwardIssuerKey): KeyObject {
    if (this.isKeyObject(value)) return value;
    if (value instanceof Uint8Array) {
      if (value.byteLength === ED25519_RAW_LENGTH) {
        return createPublicKey({
          format: 'der',
          key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(value)]),
          type: 'spki',
        });
      }
      if (value.byteLength !== ED25519_DER_LENGTH) throw new Error();
      return createPublicKey({ format: 'der', key: Buffer.from(value), type: 'spki' });
    }
    if (value.startsWith('-----BEGIN')) {
      return createPublicKey(value);
    }
    const decoded = this.decodeKeyString(value);
    if (decoded.byteLength === ED25519_RAW_LENGTH) {
      return createPublicKey({
        format: 'der',
        key: Buffer.concat([ED25519_SPKI_PREFIX, decoded]),
        type: 'spki',
      });
    }
    if (decoded.byteLength !== ED25519_DER_LENGTH) throw new Error();
    return createPublicKey({ format: 'der', key: decoded, type: 'spki' });
  }

  private decodeKeyString(value: string): Buffer {
    if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex');
    const decoded = Buffer.from(value, 'base64');
    if (decoded.byteLength === 0) throw new Error();
    return decoded;
  }

  private verifyBindings(proof: PreForwardRouteProofV1, expected: PreForwardRouteBinding): void {
    if (
      proof.orgId !== expected.orgId ||
      proof.deploymentId !== expected.deploymentId ||
      proof.tenantContext.tenantId !== expected.tenantId ||
      proof.tenantContext.assignmentDigest !== expected.assignmentDigest ||
      proof.proofId !== expected.proofId ||
      proof.issuer.workloadId !== expected.workloadId ||
      proof.issuer.runtimeIdentityDigest !== expected.runtimeIdentityDigest ||
      proof.issuer.workloadArtifactDigest !== expected.workloadArtifactDigest ||
      proof.issuer.attestedKeysetDigest !== expected.workloadKeysetDigest ||
      proof.pinnedTrustRootDigest !== expected.pinnedTrustRootDigest ||
      proof.challenge.gatewayNonce !== expected.gatewayNonce ||
      proof.challenge.bootEpoch !== expected.bootEpoch ||
      proof.connection.channelKeyDigest !== expected.channelKeyDigest ||
      proof.connection.exporterLabel !== expected.exporterLabel ||
      proof.connection.exporterDigest !== expected.exporterDigest ||
      proof.connection.transcriptDigest !== expected.transcriptDigest ||
      proof.route.origin !== expected.origin ||
      proof.route.route !== expected.route ||
      proof.route.method !== expected.method ||
      proof.route.routeIdentityDigest !== expected.routeIdentityDigest ||
      proof.route.workloadId !== expected.workloadId ||
      proof.role !== expected.role ||
      proof.sessionId !== expected.sessionId ||
      proof.model !== expected.model ||
      proof.modelRevision !== expected.modelRevision ||
      proof.modelArtifactDigest !== expected.modelArtifactDigest ||
      proof.snapshotDigest !== expected.snapshotDigest ||
      proof.policyDigest !== expected.policyDigest ||
      proof.tenantAadDigest !== expected.tenantAadDigest ||
      proof.capabilityDigest !== expected.capabilityDigest ||
      proof.workloadKeysetDigest !== expected.workloadKeysetDigest ||
      proof.policyGeneration !== expected.policyGeneration ||
      proof.activationGeneration !== expected.activationGeneration ||
      proof.requestId !== expected.requestId
    ) {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
  }

  private async readTrustedTime(expected: PreForwardRouteBinding): Promise<number> {
    try {
      const sample = await readTrustedTimeSample(this.trustedTimeAuthority, {
        orgId: expected.orgId,
        deploymentId: expected.deploymentId,
        bootEpoch: expected.bootEpoch,
        checkpointDigest: expected.trustedTimeCheckpointDigest,
      });
      return sample.trustedNow;
    } catch {
      throw new PreForwardRouteProofVerificationError('trusted_time_unavailable');
    }
  }

  private proofKey(proof: PreForwardRouteProofV1): string {
    return [proof.orgId, proof.deploymentId, proof.challenge.bootEpoch, proof.proofId].join(
      '\u0000',
    );
  }

  private positiveBoundedInteger(value: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
    return value;
  }

  private boundedReplayCapacity(value: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_REPLAY_CAPACITY) {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
    return value;
  }

  private isKeyObject(value: PreForwardIssuerKey): value is KeyObject {
    return (
      typeof value === 'object' && value !== null && 'type' in value && 'asymmetricKeyType' in value
    );
  }
}
