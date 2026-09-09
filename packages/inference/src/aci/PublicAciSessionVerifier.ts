// SPDX-License-Identifier: Apache-2.0
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

import {
  aciReceiptSchema,
  aciSessionSchema,
  type AciReceipt,
  type AciSession,
} from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';

import { parseStrictJsonBytes } from './strict-json.js';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const SESSION_ID = /^[0-9a-f]{64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PUBLIC_KEY = /^[0-9a-f]{64}$/;
const MAX_SESSION_BYTES = 1_048_576;
const DEFAULT_FETCH_TIMEOUT_MS = 5_000;

type UpstreamEvent = Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }>;

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
  /** Bare SHA-256 from the verified tenant role, over canonical {channel_binding}. */
  channelKeyDigest: string;
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
  evidenceDigest: string;
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
    const receipt = aciReceiptSchema.parse(input.receipt);
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
    const session = await this.fetchSession(policy.origin, validatedSessionId);
    this.validateSession(session, validatedSessionId, policy, input.trustedNow, receipt.served_at);
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
      evidenceDigest: session.evidence.digest,
    });
  }

  private validatePolicy(policy: PublicAciSessionPolicy): PublicAciSessionPolicy {
    if (!/^[0-9a-f]{64}$/.test(policy.channelKeyDigest)) {
      throw new Error('public ACI signed channel digest is invalid');
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

  private findUpstreamEvent(receipt: AciReceipt, model: string): UpstreamEvent {
    const event = receipt.event_log.find(
      (candidate): candidate is UpstreamEvent =>
        candidate.type === 'upstream.verified' &&
        candidate.result === 'verified' &&
        candidate.required === true &&
        candidate.model_id === model,
    );
    if (event === undefined) throw new Error('public ACI upstream verification is missing');
    return event;
  }

  private async fetchSession(origin: string, sessionId: string): Promise<AciSession> {
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
        return this.parseSession(bytes);
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
      return this.parseSession(bytes);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseSession(bytes: Uint8Array): AciSession {
    let value: unknown;
    try {
      value = parseStrictJsonBytes(bytes, MAX_SESSION_BYTES, { asciiMemberNames: true });
    } catch {
      throw new Error('public ACI session is malformed');
    }
    return aciSessionSchema.parse(value);
  }
  private validateSession(
    session: AciSession,
    sessionId: string,
    policy: PublicAciSessionPolicy,
    trustedNow: number,
    servedAt: number,
  ): void {
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
    const channelKeyDigest = createHash('sha256')
      .update(canonicalJson({ channel_binding: session.channel_binding }))
      .digest('hex');
    if (channelKeyDigest !== policy.channelKeyDigest) {
      throw new Error('public ACI session channel policy failed');
    }
    const encoded = session.evidence.data;
    if (encoded === undefined) throw new Error('public ACI session evidence is missing');
    const match = /^data:[^,]{1,256};base64,([A-Za-z0-9+/]*={0,2})$/.exec(encoded);
    const payload = match?.[1];
    if (!payload) throw new Error('public ACI session evidence encoding failed');
    const evidence = Buffer.from(payload, 'base64');
    if (evidence.length === 0 || evidence.toString('base64') !== payload) {
      throw new Error('public ACI session evidence encoding failed');
    }
    if (
      `sha256:${createHash('sha256').update(evidence).digest('hex')}` !== session.evidence.digest
    ) {
      throw new Error('public ACI session evidence digest failed');
    }
  }
}
