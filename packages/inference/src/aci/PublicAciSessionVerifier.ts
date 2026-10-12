// SPDX-License-Identifier: Apache-2.0
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

import {
  aciEvidenceFreeSessionSchema,
  aciReceiptSchema,
  aciSessionSchema,
  type AciEvidenceFreeSession,
  type AciReceipt,
  type AciSession,
  isAciKnownChannelBindingType,
  policyBindingAdmitsProvider,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';

import { attestedUpstreamModelId } from '../model-allowlist.js';
import { parseStrictJsonBytes } from './strict-json.js';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const SESSION_ID = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PUBLIC_KEY = /^[0-9a-f]{64}$/;
const MAX_SESSION_BYTES = 1_048_576;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

type UpstreamEvent = Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }>;
type AcceptedChannelBinding = InferenceTrustPolicyV2['channelPolicy']['acceptedBindings'][number];
type SessionChannelBinding = AciSession['channel_binding'][number];
type ParsedSession =
  | Readonly<{ evidenceMode: 'hashed'; session: AciSession }>
  | Readonly<{ evidenceMode: 'verifier-attested'; session: AciEvidenceFreeSession }>;

export type PublicAciVerifiedKeyset = Readonly<{
  workloadKeysetDigest: string;
  receiptSigningKeys: readonly Readonly<{
    keyId: string;
    algorithm: string;
    publicKey: string;
  }>[];
}>;

export type PublicAciSessionPolicy = Readonly<{
  origin: string;
  workloadKeysetDigest: string;
  model: string;
  maxSessionLifetimeSeconds: number;
  requiredSessionClaims: readonly string[];
  permittedClaimSources: readonly string[];
  /** The boot-signed provider policy's binding kinds; the session names its upstream, so domains are not compared. */
  acceptedChannelBindings: readonly AcceptedChannelBinding[];
  /** The provider policy's `evidenceFreeSessionVerifiers`; empty refuses every evidence-free session. */
  evidenceFreeVerifiers: readonly string[];
}>;

export type PublicAciSessionVerificationInput = Readonly<{
  receipt: unknown;
  keyset: PublicAciVerifiedKeyset;
  policy: PublicAciSessionPolicy;
  trustedNow: number;
}>;

export type PublicAciSessionVerificationResult = Readonly<{
  verificationMode: 'gateway-authenticated-public-session';
  sessionId: string;
  model: string;
  upstreamName: string;
  endpoint: string | null;
  verifierId: string;
  establishedAt: number;
  expiresAt: number;
  claims: AciSession['claims'];
  channelBindings: AciSession['channel_binding'];
  evidenceMode: ParsedSession['evidenceMode'];
  evidenceDigest: string | null;
}>;

export class PublicAciSessionVerifier {
  private readonly fetchImpl: typeof fetch;
  private readonly fetchTimeoutMs: number;

  constructor(fetchImpl: typeof fetch = fetch, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
    this.fetchImpl = fetchImpl;
    if (!Number.isSafeInteger(fetchTimeoutMs) || fetchTimeoutMs <= 0) {
      throw new Error('public ACI fetch timeout is invalid');
    }
    this.fetchTimeoutMs = fetchTimeoutMs;
  }

  async verify(
    input: PublicAciSessionVerificationInput,
  ): Promise<PublicAciSessionVerificationResult> {
    const policy = this.validatePolicy(input.policy);
    const keyset = this.validateKeyset(input.keyset);
    if (keyset.workloadKeysetDigest !== policy.workloadKeysetDigest) {
      throw new Error('public ACI keyset policy digest mismatch');
    }
    if (!Number.isSafeInteger(input.trustedNow) || input.trustedNow < 0) {
      throw new Error('public ACI trusted time is invalid');
    }
    const receipt = this.parseReceipt(input.receipt);
    if (receipt.workload_keyset_digest !== policy.workloadKeysetDigest) {
      throw new Error('public ACI receipt keyset digest mismatch');
    }
    this.verifyReceiptSignature(receipt, keyset);
    const event = this.findUpstreamEvent(receipt, policy.model);
    const sessionId = event.session_id;
    if (sessionId === undefined || !SESSION_ID.test(sessionId)) {
      throw new Error('public ACI receipt session reference is invalid');
    }
    const validatedSessionId: string = sessionId;
    const parsed = await this.fetchSession(policy, validatedSessionId);
    this.validateSession(parsed, validatedSessionId, policy, input.trustedNow, receipt.served_at);
    const { session } = parsed;
    return Object.freeze({
      verificationMode: 'gateway-authenticated-public-session',
      sessionId: validatedSessionId,
      model: policy.model,
      upstreamName: session.upstream_name,
      endpoint: session.endpoint ?? null,
      verifierId: session.verifier_id,
      establishedAt: session.established_at,
      expiresAt: session.expires_at,
      claims: session.claims,
      channelBindings: session.channel_binding,
      evidenceMode: parsed.evidenceMode,
      evidenceDigest: parsed.evidenceMode === 'hashed' ? parsed.session.evidence.digest : null,
    });
  }

  private validatePolicy(policy: PublicAciSessionPolicy): PublicAciSessionPolicy {
    if (policy.acceptedChannelBindings.length === 0) {
      throw new Error('public ACI channel policy is invalid');
    }
    let url: URL;
    try {
      url = new URL(policy.origin);
    } catch {
      throw new Error('public ACI policy origin is invalid');
    }
    if (
      url.protocol !== 'https:' ||
      url.origin !== policy.origin ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('public ACI policy origin is invalid');
    }
    if (
      policy.workloadKeysetDigest !== policy.workloadKeysetDigest.toLowerCase() ||
      !DIGEST.test(policy.workloadKeysetDigest) ||
      policy.model.length === 0 ||
      !Number.isSafeInteger(policy.maxSessionLifetimeSeconds) ||
      policy.maxSessionLifetimeSeconds <= 0
    ) {
      throw new Error('public ACI policy is invalid');
    }
    return policy;
  }

  private validateKeyset(keyset: PublicAciVerifiedKeyset): PublicAciVerifiedKeyset {
    if (!DIGEST.test(keyset.workloadKeysetDigest) || keyset.receiptSigningKeys.length === 0) {
      throw new Error('public ACI keyset is invalid');
    }
    for (const key of keyset.receiptSigningKeys) {
      if (key.algorithm !== 'ed25519' || !PUBLIC_KEY.test(key.publicKey)) {
        throw new Error('public ACI receipt signer is invalid');
      }
    }
    return keyset;
  }

  private verifyReceiptSignature(receipt: AciReceipt, keyset: PublicAciVerifiedKeyset): void {
    const signer = keyset.receiptSigningKeys.find((key) => key.keyId === receipt.key_id);
    if (signer === undefined) throw new Error('public ACI receipt signer is unknown');
    const { signature, ...unsigned } = receipt;
    try {
      const key = createPublicKey({
        format: 'der',
        key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(signer.publicKey, 'hex')]),
        type: 'spki',
      });
      if (
        !verifySignature(
          null,
          Buffer.from(canonicalJson(unsigned)),
          key,
          Buffer.from(signature, 'hex'),
        )
      ) {
        throw new Error();
      }
    } catch {
      throw new Error('public ACI receipt signature is invalid');
    }
  }

  // Each refusal names the furthest predicate any upstream event reached and carries no receipt value.
  private findUpstreamEvent(receipt: AciReceipt, alias: string): UpstreamEvent {
    const upstream = receipt.event_log.filter(
      (candidate): candidate is UpstreamEvent => candidate.type === 'upstream.verified',
    );
    if (upstream.length === 0) throw new Error('public ACI upstream event is absent');
    const verified = upstream.filter((candidate) => candidate.result === 'verified');
    if (verified.length === 0) throw new Error('public ACI upstream result is not verified');
    const required = verified.filter((candidate) => candidate.required === true);
    if (required.length === 0) throw new Error('public ACI upstream is not required');
    const model = attestedUpstreamModelId(alias);
    if (model === undefined) throw new Error('public ACI upstream model alias is unmapped');
    const event = required.find((candidate) => candidate.model_id === model);
    if (event !== undefined) return event;
    if (required.some((candidate) => candidate.model_id.toLowerCase() === model.toLowerCase())) {
      throw new Error('public ACI upstream model differs only in case');
    }
    throw new Error('public ACI upstream model does not match');
  }

  private async fetchSession(
    policy: PublicAciSessionPolicy,
    sessionId: string,
  ): Promise<ParsedSession> {
    const { origin } = policy;
    const url = new URL(`/v1/aci/sessions/${sessionId}`, origin);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok || new URL(response.url).origin !== new URL(origin).origin) {
        throw new Error('public ACI session fetch failed');
      }
      const reader = response.body?.getReader();
      if (reader === undefined) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_SESSION_BYTES)
          throw new Error('public ACI session is too large');
        return this.parseSession(bytes, policy);
      }
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > MAX_SESSION_BYTES) throw new Error('public ACI session is too large');
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return this.parseSession(bytes, policy);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseReceipt(value: unknown): AciReceipt {
    const parsed = aciReceiptSchema.safeParse(value);
    if (!parsed.success) throw new Error('public ACI receipt schema is invalid');
    return parsed.data;
  }

  private parseSession(bytes: Uint8Array, policy: PublicAciSessionPolicy): ParsedSession {
    let value: unknown;
    try {
      value = parseStrictJsonBytes(bytes, MAX_SESSION_BYTES, { asciiMemberNames: true });
    } catch {
      throw new Error('public ACI session is malformed');
    }
    if (!this.hasEvidenceDigest(value)) return this.parseEvidenceFreeSession(value, policy);
    const parsed = aciSessionSchema.safeParse(value);
    if (!parsed.success) throw new Error('public ACI session schema is invalid');
    return { evidenceMode: 'hashed', session: parsed.data };
  }

  // Only an exactly empty `evidence` from a policy-allowlisted verifier is accepted.
  private parseEvidenceFreeSession(value: unknown, policy: PublicAciSessionPolicy): ParsedSession {
    if (!this.namesAllowlistedVerifier(value, policy)) {
      throw new Error('public ACI session evidence is missing');
    }
    const parsed = aciEvidenceFreeSessionSchema.safeParse(value);
    if (!parsed.success) throw new Error('public ACI session schema is invalid');
    return { evidenceMode: 'verifier-attested', session: parsed.data };
  }

  private namesAllowlistedVerifier(value: unknown, policy: PublicAciSessionPolicy): boolean {
    if (typeof value !== 'object' || value === null || !('verifier_id' in value)) return false;
    const verifierId = value.verifier_id;
    return typeof verifierId === 'string' && policy.evidenceFreeVerifiers.includes(verifierId);
  }

  private hasEvidenceDigest(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || !('evidence' in value)) return false;
    const evidence = value.evidence;
    return typeof evidence === 'object' && evidence !== null && 'digest' in evidence;
  }
  private validateSession(
    parsed: ParsedSession,
    sessionId: string,
    policy: PublicAciSessionPolicy,
    trustedNow: number,
    servedAt: number,
  ): void {
    const { session } = parsed;
    const contentId = createHash('sha256').update(canonicalJson(session)).digest('hex');
    if (
      contentId !== sessionId ||
      session.established_at > trustedNow ||
      session.expires_at <= trustedNow ||
      session.expires_at - session.established_at > policy.maxSessionLifetimeSeconds ||
      servedAt < session.established_at ||
      servedAt >= session.expires_at
    ) {
      throw new Error('public ACI session time or content binding is invalid');
    }
    for (const claimName of policy.requiredSessionClaims) {
      const claim = (session.claims as Record<string, unknown>)[claimName];
      if (
        claim === undefined ||
        typeof claim !== 'object' ||
        claim === null ||
        !('status' in claim) ||
        claim.status !== 'asserted' ||
        !('source' in claim) ||
        typeof claim.source !== 'string' ||
        !policy.permittedClaimSources.includes(claim.source)
      ) {
        throw new Error('public ACI session claim policy failed');
      }
    }
    const known = session.channel_binding.filter((binding) =>
      isAciKnownChannelBindingType(binding.type),
    );
    if (
      known.length === 0 ||
      !known.every((binding) =>
        this.channelBindingAccepted(binding, policy.acceptedChannelBindings),
      )
    ) {
      throw new Error('public ACI session channel policy failed');
    }
    if (parsed.evidenceMode === 'hashed') this.validateEvidence(parsed.session.evidence);
  }

  private validateEvidence(evidence: AciSession['evidence']): void {
    const encoded = evidence.data;
    if (encoded === undefined) throw new Error('public ACI session evidence is missing');
    const match = /^data:[^,]{1,256};base64,([A-Za-z0-9+/]*={0,2})$/.exec(encoded);
    const payload = match?.[1];
    if (!payload) throw new Error('public ACI session evidence encoding failed');
    const bytes = Buffer.from(payload, 'base64');
    if (bytes.length === 0 || bytes.toString('base64') !== payload) {
      throw new Error('public ACI session evidence encoding failed');
    }
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== evidence.digest) {
      throw new Error('public ACI session evidence digest failed');
    }
  }

  private channelBindingAccepted(
    binding: SessionChannelBinding,
    accepted: readonly AcceptedChannelBinding[],
  ): boolean {
    return accepted.some((candidate) => {
      if (candidate.type !== binding.type) return false;
      if (candidate.type !== 'e2ee_public_key_sha256') return true;
      const algorithm = 'algorithm' in binding ? binding.algorithm : undefined;
      const provider = 'provider' in binding ? binding.provider : undefined;
      return (
        candidate.algorithms.some((allowed) => allowed === algorithm) &&
        policyBindingAdmitsProvider(candidate, provider)
      );
    });
  }
}
