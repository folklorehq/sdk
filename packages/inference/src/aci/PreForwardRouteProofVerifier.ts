// SPDX-License-Identifier: Apache-2.0
import { createPublicKey, type KeyObject, verify as verifySignature } from 'node:crypto';

import { preForwardRouteProofSchema, type PreForwardRouteProofV1 } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';

import { parseStrictJsonBytes } from './strict-json.js';
import type {
  PreForwardRouteExpectation,
  PreForwardRouteProofVerificationInput,
  PreForwardRouteProofVerifierPort,
  TrustedTimeAuthorityPort,
  VerifiedPreForwardRouteProof,
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

type PreForwardIssuerKey = KeyObject | Uint8Array | string;

type PreForwardRouteProofVerificationErrorCode =
  | 'proof_invalid'
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
  }

  async verify(
    input: PreForwardRouteProofVerificationInput,
  ): Promise<VerifiedPreForwardRouteProof> {
    // Snapshot the caller-owned expectation before the first await: the bindings check and the
    // trusted-time read that follow must both see the expectation as it was when verification
    // began, never a copy the caller rewrites while this method is suspended.
    const expected = Object.freeze({ ...input.expected });
    const proof = this.parse(input.encodedProof);
    let issuerKey: PreForwardIssuerKey | undefined;
    try {
      issuerKey = await this.findIssuerKey(proof.issuer.keyId);
    } catch {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
    if (issuerKey === undefined || !this.verifySignature(proof, issuerKey)) {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
    this.verifyBindings(proof, expected);
    const trustedNow = await this.readTrustedTime(expected);
    if (
      proof.issuedAt > trustedNow ||
      proof.expiresAt <= trustedNow ||
      proof.expiresAt - proof.issuedAt > this.maximumProofLifetimeMs
    ) {
      throw new PreForwardRouteProofVerificationError('proof_stale');
    }
    return this.freeze(proof);
  }

  private parse(encodedProof: Uint8Array): PreForwardRouteProofV1 {
    try {
      const decoded = parseStrictJsonBytes(encodedProof, this.maxProofBytes, {
        asciiMemberNames: true,
      });
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

  private verifyBindings(
    proof: PreForwardRouteProofV1,
    expected: PreForwardRouteExpectation,
  ): void {
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

  private async readTrustedTime(expected: PreForwardRouteExpectation): Promise<number> {
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

  private positiveBoundedInteger(value: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new PreForwardRouteProofVerificationError('proof_invalid');
    }
    return value;
  }

  private freeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
      for (const nested of Object.values(value)) this.freeze(nested);
      Object.freeze(value);
    }
    return value;
  }

  private isKeyObject(value: PreForwardIssuerKey): value is KeyObject {
    return (
      typeof value === 'object' && value !== null && 'type' in value && 'asymmetricKeyType' in value
    );
  }
}
