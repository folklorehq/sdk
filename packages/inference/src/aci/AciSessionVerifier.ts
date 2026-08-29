// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  aciSessionSchema,
  aciDstackRawEvidenceV1Schema,
  inferenceTrustPolicyV2Schema,
  type AciSession,
  type AciDstackRawEvidenceV1,
  type InferenceModelRole,
} from '@folklore/contracts';
import { z } from 'zod';

import { AciSessionVerificationError } from './AciSessionVerificationError.js';
import { AciNativeSessionEvidenceVerifier } from './AciNativeSessionEvidenceVerifier.js';
import { parseStrictJsonBytes } from './strict-json.js';
import { containsReservedRawEvidenceMarker } from './raw-evidence-classification.js';
import { isTrustedTimeContext, readTrustedTimeSample } from './trusted-time.js';
import type {
  AciEvidencePolicyAnchors,
  AciSessionCandidate,
  LegacyAciSessionEvidenceVerifierPort,
  AciSessionVerificationInput,
  AciSessionVerifierConfig,
  LegacyAciSessionVerifierConfig,
  AciTrustContext,
  VerifiedAciChannelPin,
  VerifiedAciSession,
  VerifiedAciSessionEvidenceBindings,
  VerifiedAciSessionEvidenceBindingsV2,
  VerifiedAciSessionSet,
} from '../ports.js';

const REQUIRED_ROLES: readonly InferenceModelRole[] = ['embed', 'generate', 'critique', 'judge'];
const MAX_CANONICAL_DEPTH = 32;
const MAX_CANONICAL_NODES = 4_096;
const MAX_CANONICAL_BYTES = 8_000_000;
const MAX_SESSION_BYTES = 8_000_000;
const MAX_AGGREGATE_SESSION_BYTES = 32_000_000;
const MAX_AGGREGATE_SESSION_NODES = 16_384;
const MAX_SESSION_CANDIDATES = 128;
const MAX_KEYSET_ITEMS = 32;
const PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const RAW_DIGEST = /^[0-9a-f]{64}$/;
const HEX = /^[0-9a-f]+$/;
const DEFAULT_NATIVE_VERIFIER_TIMEOUT_MS = 5_000;
const MAX_NATIVE_VERIFIER_TIMEOUT_MS = 60_000;
const LEGACY_MAX_SESSION_BYTES = 1_048_576;
const LEGACY_MAX_AGGREGATE_SESSION_BYTES = 4_194_304;

type AciTlsSpkiBinding = {
  readonly type: 'tls_spki_sha256';
  readonly origin: string;
  readonly spki_sha256: string;
};
type AciE2eeBinding = {
  readonly type: 'e2ee_public_key_sha256';
  readonly provider: string;
  readonly algorithm: string;
  readonly public_key_sha256: string;
  readonly key_id?: string;
};

const boundedStringSchema = z.string().min(1).max(512);
const keyRecordSchema = z
  .object({
    keyId: boundedStringSchema,
    algorithm: boundedStringSchema,
    publicKey: z.string().min(64).max(130).regex(HEX),
  })
  .strict();
const channelPinSchema = z
  .object({
    type: z.enum(['tls_spki_sha256', 'e2ee_public_key_sha256']),
    value: z.string().regex(RAW_DIGEST),
    domain: z.string().min(1).max(253).optional(),
    algorithm: boundedStringSchema.optional(),
    keyId: boundedStringSchema.optional(),
  })
  .strict();
const verifiedKeysetSchema = z
  .object({
    workloadId: z.string().regex(PREFIXED_DIGEST),
    workloadKeysetDigest: z.string().regex(PREFIXED_DIGEST),
    version: z.number().int().safe().positive(),
    notAfter: z.number().int().safe().positive(),
    receiptSigningKeys: z.array(keyRecordSchema).min(1).max(MAX_KEYSET_ITEMS),
    e2eePublicKeys: z.array(keyRecordSchema).min(1).max(MAX_KEYSET_ITEMS),
    tlsPublicKeys: z
      .array(
        z
          .object({
            spkiSha256: z.string().regex(RAW_DIGEST),
            domain: z.string().min(1).max(253).optional(),
          })
          .strict(),
      )
      .max(MAX_KEYSET_ITEMS),
    channelPins: z
      .array(channelPinSchema)
      .min(1)
      .max(MAX_KEYSET_ITEMS * 2),
    channelKeyDigest: z.string().regex(PREFIXED_DIGEST),
  })
  .strict();
const candidateEnvelopeSchema = z
  .object({
    role: z.enum(REQUIRED_ROLES as [InferenceModelRole, ...InferenceModelRole[]]),
    model: z.string().min(1).max(256),
    modelRevision: boundedStringSchema,
    sessionId: z.string().regex(RAW_DIGEST),
    workloadKeysetDigest: z.string().regex(PREFIXED_DIGEST),
    channelKeyDigest: z.string().regex(PREFIXED_DIGEST),
    policyGeneration: z.number().int().safe().nonnegative(),
    activationGeneration: z.number().int().safe().nonnegative(),
    session: z.unknown(),
    sessionBytes: z.instanceof(Uint8Array),
  })
  .strict();
const highWaterSchema = z
  .object({
    minimumPolicyGeneration: z.number().int().safe().nonnegative(),
    minimumActivationGeneration: z.number().int().safe().nonnegative(),
    minimumKeysetVersion: z.number().int().safe().nonnegative(),
    supersededKeysetDigests: z
      .array(z.string().regex(PREFIXED_DIGEST))
      .max(MAX_SESSION_CANDIDATES)
      .refine((digests) => new Set(digests).size === digests.length),
  })
  .strict();
const verificationInputSchema = z
  .object({
    keyset: verifiedKeysetSchema,
    candidates: z.array(candidateEnvelopeSchema).min(1).max(MAX_SESSION_CANDIDATES),
    highWater: highWaterSchema,
  })
  .strict();

interface CanonicalizationState {
  readonly active: Set<object>;
  nodes: number;
  bytes: number;
}

interface StructuralNode {
  readonly value: unknown;
  readonly depth: number;
}

class AciSessionVerifierCore {
  private readonly trustedTimeAuthority: AciSessionVerifierConfig['trustedTimeAuthority'];
  private readonly trustedTimeContext: AciTrustContext;
  private readonly evidenceVerifier: AciNativeSessionEvidenceVerifier | null;
  private readonly legacyEvidenceVerifier: LegacyAciSessionEvidenceVerifierPort | null;
  private readonly nativeVerifierTimeoutMs: number;
  private readonly policy: AciSessionVerifierConfig['policy'];
  private readonly keysetHighWaterAuthority: NonNullable<
    AciSessionVerifierConfig['keysetHighWaterAuthority']
  >;
  private readonly rawEvidenceDigestAuthority:
    | AciSessionVerifierConfig['rawEvidenceDigestAuthority']
    | undefined;

  constructor(
    config: Omit<AciSessionVerifierConfig, 'rawEvidenceDigestAuthority'> &
      Partial<Pick<AciSessionVerifierConfig, 'rawEvidenceDigestAuthority'>>,
    legacyEvidenceVerifier?: LegacyAciSessionEvidenceVerifierPort,
  ) {
    this.trustedTimeAuthority = config.trustedTimeAuthority;
    this.trustedTimeContext = config.trustedTimeContext;
    if (typeof config.keysetHighWaterAuthority?.read !== 'function') {
      throw new AciSessionVerificationError('high_water_unavailable');
    }
    this.keysetHighWaterAuthority = config.keysetHighWaterAuthority;
    const policy = inferenceTrustPolicyV2Schema.safeParse(config.policy);
    if (!policy.success) throw new AciSessionVerificationError('policy_invalid');
    this.policy = this.deepFreeze(policy.data);
    if (typeof config.evidenceVerifier?.verify !== 'function') {
      throw new AciSessionVerificationError('evidence_verifier_unavailable');
    }
    this.legacyEvidenceVerifier = legacyEvidenceVerifier ?? null;
    this.evidenceVerifier =
      legacyEvidenceVerifier === undefined
        ? new AciNativeSessionEvidenceVerifier(config.evidenceVerifier)
        : null;
    if (
      legacyEvidenceVerifier === undefined &&
      typeof config.rawEvidenceDigestAuthority?.digest !== 'function'
    ) {
      throw new AciSessionVerificationError('evidence_digest_authority_unavailable');
    }
    this.rawEvidenceDigestAuthority = config.rawEvidenceDigestAuthority;
    this.nativeVerifierTimeoutMs =
      config.nativeVerifierTimeoutMs ?? DEFAULT_NATIVE_VERIFIER_TIMEOUT_MS;
    if (
      !Number.isSafeInteger(this.nativeVerifierTimeoutMs) ||
      this.nativeVerifierTimeoutMs <= 0 ||
      this.nativeVerifierTimeoutMs > MAX_NATIVE_VERIFIER_TIMEOUT_MS
    ) {
      throw new AciSessionVerificationError('evidence_verifier_unavailable');
    }
  }

  async verifyAndSelect(input: AciSessionVerificationInput): Promise<VerifiedAciSessionSet> {
    this.verifyEncodedSizeBudget(input);
    input = this.parseInput(input);
    const durable = await this.keysetHighWaterAuthority.read(this.trustedTimeContext);
    if (durable === undefined) throw new AciSessionVerificationError('high_water_unavailable');
    if (durable.currentKeysetDigest !== input.keyset.workloadKeysetDigest) {
      throw new AciSessionVerificationError('keyset_superseded');
    }
    const evaluationTimeUnixSeconds = await this.readTrustedTime(this.trustedTimeContext);
    this.validateState(
      { ...input, highWater: this.highWaterFor(durable) },
      evaluationTimeUnixSeconds,
    );
    this.validateCandidateBindings(input);
    const verifiedChannelDigests = await this.verifyCandidateEvidence(
      input.candidates,
      performance.now() + this.nativeVerifierTimeoutMs,
      evaluationTimeUnixSeconds,
    );
    return this.selectSessions(
      input,
      await this.readTrustedTime(this.trustedTimeContext),
      verifiedChannelDigests,
    );
  }

  private verifyEncodedSizeBudget(input: AciSessionVerificationInput): void {
    const candidateInput = input as unknown;
    if (candidateInput === null || typeof candidateInput !== 'object') {
      throw new AciSessionVerificationError('session_malformed');
    }
    const candidates = (candidateInput as { readonly candidates?: unknown }).candidates;
    if (!Array.isArray(candidates) || candidates.length > MAX_SESSION_CANDIDATES) {
      throw new AciSessionVerificationError('session_malformed');
    }
    const perCandidateLimit =
      this.legacyEvidenceVerifier === null ? MAX_SESSION_BYTES : LEGACY_MAX_SESSION_BYTES;
    const aggregateLimit =
      this.legacyEvidenceVerifier === null
        ? MAX_AGGREGATE_SESSION_BYTES
        : LEGACY_MAX_AGGREGATE_SESSION_BYTES;
    let aggregateBytes = 0;
    for (const candidate of candidates) {
      if (candidate === null || typeof candidate !== 'object') {
        throw new AciSessionVerificationError('session_malformed');
      }
      const sessionBytes = (candidate as { readonly sessionBytes?: unknown }).sessionBytes;
      if (!(sessionBytes instanceof Uint8Array) || sessionBytes.byteLength > perCandidateLimit) {
        throw new AciSessionVerificationError('session_malformed');
      }
      aggregateBytes += sessionBytes.byteLength;
      if (aggregateBytes > aggregateLimit) {
        throw new AciSessionVerificationError('session_malformed');
      }
    }
  }

  private highWaterFor(
    durable: Readonly<{
      policyGeneration: number;
      activationGeneration: number;
      keysetVersion: number;
      supersededKeysetDigests: readonly string[];
    }>,
  ): AciSessionVerificationInput['highWater'] {
    return {
      minimumPolicyGeneration: durable.policyGeneration,
      minimumActivationGeneration: durable.activationGeneration,
      minimumKeysetVersion: durable.keysetVersion,
      supersededKeysetDigests: durable.supersededKeysetDigests,
    };
  }

  private validateState(input: AciSessionVerificationInput, now: number): void {
    const candidateRoles = new Set(input.candidates.map((candidate) => candidate.role));
    if (REQUIRED_ROLES.some((role) => !candidateRoles.has(role))) {
      throw new AciSessionVerificationError('role_incomplete');
    }
    if (input.keyset.notAfter <= now) {
      throw new AciSessionVerificationError('keyset_expired');
    }
    if (input.keyset.version < input.highWater.minimumKeysetVersion) {
      throw new AciSessionVerificationError('keyset_version_decreased');
    }
    if (this.policy.generation < input.highWater.minimumPolicyGeneration) {
      throw new AciSessionVerificationError('policy_generation_decreased');
    }
    const activationGeneration = input.candidates[0]?.activationGeneration;
    if (
      activationGeneration === undefined ||
      activationGeneration < input.highWater.minimumActivationGeneration
    ) {
      throw new AciSessionVerificationError('activation_generation_decreased');
    }
    if (input.highWater.supersededKeysetDigests.includes(input.keyset.workloadKeysetDigest)) {
      throw new AciSessionVerificationError('keyset_superseded');
    }
    if (
      input.candidates.some(
        (candidate) =>
          candidate.policyGeneration !== this.policy.generation ||
          candidate.activationGeneration !== activationGeneration,
      )
    ) {
      throw new AciSessionVerificationError('mixed_state');
    }
  }

  private validateCandidateBindings(input: AciSessionVerificationInput): void {
    const { candidates } = input;
    if (
      candidates.some(
        (candidate) => candidate.workloadKeysetDigest !== input.keyset.workloadKeysetDigest,
      )
    ) {
      throw new AciSessionVerificationError('workload_keyset_mismatch');
    }
    if (
      candidates.some(
        (candidate) => candidate.sessionId !== this.sessionContentId(candidate.session),
      )
    ) {
      throw new AciSessionVerificationError('session_id_mismatch');
    }
    if (candidates.some((candidate) => !this.evidenceDigestMatches(candidate.session))) {
      throw new AciSessionVerificationError('evidence_digest_mismatch');
    }
    if (candidates.some((candidate) => !this.channelBindingsAccepted(candidate.session))) {
      throw new AciSessionVerificationError('channel_binding_mismatch');
    }
  }

  private async verifyCandidateEvidence(
    candidates: readonly AciSessionCandidate[],
    deadline: number,
    evaluationTimeUnixSeconds: number,
  ): Promise<ReadonlyMap<AciSessionCandidate, string>> {
    const verifiedChannelDigests = new Map<AciSessionCandidate, string>();
    for (const candidate of candidates) {
      const evidenceBytes = this.sessionEvidenceBytes(candidate.session);
      if (evidenceBytes === undefined)
        throw new AciSessionVerificationError('session_evidence_missing');
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (deadline - performance.now() <= 0) {
          throw new AciSessionVerificationError('session_evidence_verification_failed');
        }
        if (
          this.legacyEvidenceVerifier !== null &&
          containsReservedRawEvidenceMarker(evidenceBytes)
        ) {
          throw new AciSessionVerificationError('session_malformed');
        }
        if (this.legacyEvidenceVerifier !== null) {
          const remainingMs = deadline - performance.now();
          if (remainingMs <= 0) {
            throw new AciSessionVerificationError('session_evidence_verification_failed');
          }
          const verification = this.legacyEvidenceVerifier.verify({
            sessionBytes: Uint8Array.from(candidate.sessionBytes),
            evidenceBytes: Uint8Array.from(evidenceBytes),
            policyAnchors: this.policy,
            signal: controller.signal,
            deadline,
          });
          const verified = await Promise.race([
            verification,
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(() => {
                controller.abort();
                reject(new AciSessionVerificationError('session_evidence_verification_failed'));
              }, remainingMs);
            }),
          ]);
          if (performance.now() >= deadline) {
            throw new AciSessionVerificationError('session_evidence_verification_failed');
          }
          verifiedChannelDigests.set(candidate, this.verifyReturnedBindings(candidate, verified));
          continue;
        }
        const rawEvidence = this.parseRawEvidence(evidenceBytes);
        if (rawEvidence === null) throw new AciSessionVerificationError('session_malformed');
        const subjectDigest = this.canonicalSessionSubjectDigest(candidate.session);
        const subjectBytes = this.canonicalSessionSubjectBytes(candidate.session);
        const evidenceDigest = this.digestRawEvidence(rawEvidence);
        if (
          rawEvidence.session_id !== subjectDigest ||
          rawEvidence.workload_keyset_digest !== candidate.workloadKeysetDigest
        ) {
          throw new AciSessionVerificationError('session_evidence_binding_mismatch');
        }
        const remainingMs = deadline - performance.now();
        if (remainingMs <= 0) {
          throw new AciSessionVerificationError('session_evidence_verification_failed');
        }
        if (this.evidenceVerifier === null) {
          throw new AciSessionVerificationError('session_evidence_verification_failed');
        }
        const verified = await this.evidenceVerifier.verify(
          {
            evidence: rawEvidence,
            subjectBytes,
            expectation: {
              purpose: 'session',
              subjectDigest,
              reportNonce: null,
              expectedSessionId: candidate.sessionId,
              expectedWorkloadKeysetDigest: candidate.workloadKeysetDigest,
              evidenceDigest,
              evaluationTimeUnixSeconds,
              policyAnchors: this.policyAnchors(),
            },
          },
          deadline,
        );
        verifiedChannelDigests.set(
          candidate,
          this.verifyReturnedBindings(candidate, verified, evidenceDigest),
        );
      } catch (error) {
        if (error instanceof AciSessionVerificationError) throw error;
        throw new AciSessionVerificationError('session_evidence_verification_failed');
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        controller.abort();
      }
    }
    return verifiedChannelDigests;
  }

  private digestRawEvidence(evidence: AciDstackRawEvidenceV1): string {
    if (this.rawEvidenceDigestAuthority === undefined) {
      throw new AciSessionVerificationError('evidence_digest_authority_unavailable');
    }
    try {
      const digest = this.rawEvidenceDigestAuthority.digest(evidence);
      if (!PREFIXED_DIGEST.test(digest)) {
        throw new AciSessionVerificationError('session_evidence_verification_failed');
      }
      return digest;
    } catch {
      throw new AciSessionVerificationError('session_evidence_verification_failed');
    }
  }

  private verifyReturnedBindings(
    candidate: AciSessionCandidate,
    verified: VerifiedAciSessionEvidenceBindings | VerifiedAciSessionEvidenceBindingsV2,
    evidenceDigest?: string,
  ): string {
    if (
      verified.sessionId !== candidate.sessionId ||
      verified.establishedAt !== candidate.session.established_at ||
      verified.expiresAt !== candidate.session.expires_at ||
      verified.channelKeyDigest !== this.sessionChannelKeyDigest(candidate.session) ||
      verified.upstreamIdentityDigest !== this.upstreamIdentityDigest(candidate.session) ||
      (evidenceDigest !== undefined &&
        (!('evidenceTranscriptDigest' in verified) ||
          typeof verified.evidenceTranscriptDigest !== 'string' ||
          !PREFIXED_DIGEST.test(verified.evidenceTranscriptDigest) ||
          verified.evidenceTranscriptDigest === evidenceDigest)) ||
      !this.matchesBoundedValue(verified.claims, candidate.session.claims) ||
      !this.matchesBoundedValue(verified.identity, candidate.session.identity ?? null) ||
      !this.matchesBoundedValue(verified.channelBindings, candidate.session.channel_binding)
    ) {
      throw new AciSessionVerificationError('session_evidence_binding_mismatch');
    }
    return verified.channelKeyDigest;
  }

  private parseRawEvidence(evidenceBytes: Uint8Array) {
    let value: unknown;
    try {
      value = parseStrictJsonBytes(evidenceBytes, MAX_CANONICAL_BYTES, { asciiMemberNames: true });
    } catch {
      return evidenceBytes[0] === 0x7b ? this.rejectMalformedEvidence() : null;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const parsed = aciDstackRawEvidenceV1Schema.safeParse(value);
    if (!parsed.success) throw new AciSessionVerificationError('session_malformed');
    return parsed.data;
  }

  private rejectMalformedEvidence(): null {
    throw new AciSessionVerificationError('session_malformed');
  }

  private canonicalSessionSubjectDigest(session: AciSession): string {
    return `sha256:${createHash('sha256')
      .update(this.canonicalSessionSubjectBytes(session))
      .digest('hex')}`;
  }

  private canonicalSessionSubjectBytes(session: AciSession): Uint8Array {
    return new TextEncoder().encode(this.canonicalJson({ ...session, evidence: null }));
  }

  private policyAnchors(): AciEvidencePolicyAnchors {
    return this.deepFreeze(
      structuredClone({
        origin: this.policy.origin,
        route: this.policy.route,
        channelPolicy: this.policy.channelPolicy,
        evidence: this.policy.evidence,
        sourceProvenance: this.policy.sourceProvenance,
        requiredSessionClaims: this.policy.requiredSessionClaims,
        permittedClaimSources: this.policy.permittedClaimSources,
      }),
    );
  }

  private selectSessions(
    input: AciSessionVerificationInput,
    now: number,
    verifiedChannelDigests: ReadonlyMap<AciSessionCandidate, string>,
  ): VerifiedAciSessionSet {
    return this.deepFreeze({
      embed: this.selectSession('embed', input, now, verifiedChannelDigests),
      generate: this.selectSession('generate', input, now, verifiedChannelDigests),
      critique: this.selectSession('critique', input, now, verifiedChannelDigests),
      judge: this.selectSession('judge', input, now, verifiedChannelDigests),
    });
  }

  private selectSession(
    role: InferenceModelRole,
    input: AciSessionVerificationInput,
    now: number,
    verifiedChannelDigests: ReadonlyMap<AciSessionCandidate, string>,
  ): VerifiedAciSession {
    const { candidates } = input;
    const expected = this.policy.roleModels[role];
    const candidate = candidates
      .filter(
        (item) =>
          item.role === role &&
          item.model === expected.model &&
          item.modelRevision === expected.revision &&
          this.policy.permittedModels.some(
            (model) => model.model === item.model && model.revision === item.modelRevision,
          ) &&
          this.claimsAccepted(item.session) &&
          this.isCurrentlyEligible(item.session, now),
      )
      .sort((left, right) => {
        if (left.session.established_at !== right.session.established_at) {
          return left.session.established_at > right.session.established_at ? -1 : 1;
        }
        if (left.sessionId === right.sessionId) return 0;
        return left.sessionId < right.sessionId ? -1 : 1;
      })[0];
    if (candidate === undefined) throw new AciSessionVerificationError('no_eligible_session');
    const channelKeyDigest = verifiedChannelDigests.get(candidate);
    if (channelKeyDigest === undefined) {
      throw new AciSessionVerificationError('session_evidence_verification_failed');
    }
    return {
      role,
      model: candidate.model,
      modelRevision: candidate.modelRevision,
      sessionId: candidate.sessionId,
      establishedAt: candidate.session.established_at,
      expiresAt: candidate.session.expires_at,
      workloadKeysetDigest: input.keyset.workloadKeysetDigest,
      channelKeyDigest,
      channelPins: this.sessionChannelPins(candidate.session),
      upstreamIdentityDigest: this.upstreamIdentityDigest(candidate.session),
      upstreamIdentity: {
        upstreamName: candidate.session.upstream_name,
        urlOrigin: candidate.session.endpoint ?? null,
        verifierId: candidate.session.verifier_id,
        claims: candidate.session.claims,
      },
    };
  }

  private parseInput(input: AciSessionVerificationInput): AciSessionVerificationInput {
    try {
      const parsed = verificationInputSchema.safeParse(input);
      if (!parsed.success) throw new AciSessionVerificationError('input_invalid');
      const candidates: AciSessionCandidate[] = parsed.data.candidates.map((candidate) => ({
        role: candidate.role,
        model: candidate.model,
        modelRevision: candidate.modelRevision,
        sessionId: candidate.sessionId,
        workloadKeysetDigest: candidate.workloadKeysetDigest,
        channelKeyDigest: candidate.channelKeyDigest,
        policyGeneration: candidate.policyGeneration,
        activationGeneration: candidate.activationGeneration,
        session: this.parseSession(candidate.session, candidate.sessionBytes),
        sessionBytes: Uint8Array.from(candidate.sessionBytes),
      }));
      this.assertAggregateCandidateBudget(candidates);
      return { keyset: parsed.data.keyset, candidates, highWater: parsed.data.highWater };
    } catch (error) {
      if (error instanceof AciSessionVerificationError) throw error;
      throw new AciSessionVerificationError('input_invalid');
    }
  }

  private assertAggregateCandidateBudget(
    candidates: readonly { session: unknown; sessionBytes: Uint8Array }[],
  ): void {
    let bytes = 0;
    let nodes = 0;
    for (const candidate of candidates) {
      bytes += candidate.sessionBytes.byteLength;
      nodes += this.countStructureNodes(candidate.session);
      if (bytes > MAX_AGGREGATE_SESSION_BYTES || nodes > MAX_AGGREGATE_SESSION_NODES) {
        throw new AciSessionVerificationError('session_malformed');
      }
    }
  }

  private countStructureNodes(value: unknown): number {
    const stack: unknown[] = [value];
    const seen = new WeakSet<object>();
    let nodes = 0;
    while (stack.length > 0) {
      const item = stack.pop();
      nodes += 1;
      if (nodes > MAX_AGGREGATE_SESSION_NODES) return nodes;
      if (item === null || typeof item !== 'object') continue;
      if (seen.has(item)) throw new AciSessionVerificationError('session_malformed');
      seen.add(item);
      if (Array.isArray(item)) stack.push(...item);
      else stack.push(...Object.values(item));
    }
    return nodes;
  }

  private parseSession(session: unknown, sessionBytes: Uint8Array): AciSession {
    this.assertBoundedStructure(session);
    const supplied = aciSessionSchema.safeParse(session);
    if (!supplied.success) throw new AciSessionVerificationError('session_malformed');
    let decoded: unknown;
    try {
      decoded = parseStrictJsonBytes(sessionBytes, MAX_SESSION_BYTES, { asciiMemberNames: true });
    } catch {
      throw new AciSessionVerificationError('session_malformed');
    }
    this.assertBoundedStructure(decoded);
    const parsed = aciSessionSchema.safeParse(decoded);
    if (!parsed.success || !isDeepStrictEqual(parsed.data, supplied.data)) {
      throw new AciSessionVerificationError('session_malformed');
    }
    return parsed.data;
  }

  private assertBoundedStructure(value: unknown): void {
    const stack: StructuralNode[] = [{ value, depth: 0 }];
    const seen = new WeakSet<object>();
    let nodes = 0;
    let bytes = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      nodes += 1;
      if (current.depth > MAX_CANONICAL_DEPTH || nodes > MAX_CANONICAL_NODES) {
        throw new AciSessionVerificationError('session_malformed');
      }
      const item = current.value;
      if (item === null || typeof item === 'boolean') continue;
      if (typeof item === 'string') {
        bytes += Buffer.byteLength(item, 'utf8');
        if (bytes > MAX_CANONICAL_BYTES) throw new AciSessionVerificationError('session_malformed');
        continue;
      }
      if (typeof item === 'number') {
        if (!Number.isSafeInteger(item)) throw new AciSessionVerificationError('session_malformed');
        continue;
      }
      if (typeof item !== 'object') throw new AciSessionVerificationError('session_malformed');
      if (seen.has(item)) throw new AciSessionVerificationError('session_malformed');
      seen.add(item);
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype) {
          throw new AciSessionVerificationError('session_malformed');
        }
        for (let index = item.length - 1; index >= 0; index -= 1) {
          stack.push({ value: item[index], depth: current.depth + 1 });
        }
        continue;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new AciSessionVerificationError('session_malformed');
      }
      for (const [key, nested] of Object.entries(item)) {
        bytes += Buffer.byteLength(key, 'utf8');
        if (bytes > MAX_CANONICAL_BYTES) throw new AciSessionVerificationError('session_malformed');
        stack.push({ value: nested, depth: current.depth + 1 });
      }
    }
  }

  private deepFreeze<T>(value: T): T {
    const stack: object[] = [];
    if (value !== null && typeof value === 'object') stack.push(value);
    const seen = new WeakSet<object>();
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || seen.has(current)) continue;
      seen.add(current);
      for (const nested of Object.values(current)) {
        if (nested !== null && typeof nested === 'object') stack.push(nested);
      }
      Object.freeze(current);
    }
    return value;
  }

  private async readTrustedTime(context: AciTrustContext): Promise<number> {
    if (this.trustedTimeAuthority === undefined) {
      throw new AciSessionVerificationError('clock_invalid');
    }
    if (!isTrustedTimeContext(context)) {
      throw new AciSessionVerificationError('clock_invalid');
    }
    try {
      return (await readTrustedTimeSample(this.trustedTimeAuthority, context)).trustedNow;
    } catch {
      throw new AciSessionVerificationError('clock_invalid');
    }
  }

  private sessionContentId(session: AciSession): string {
    return createHash('sha256').update(this.canonicalJson(session)).digest('hex');
  }

  private matchesBoundedValue(left: unknown, right: unknown): boolean {
    try {
      this.assertBoundedStructure(left);
      this.assertBoundedStructure(right);
      return isDeepStrictEqual(left, right);
    } catch {
      return false;
    }
  }

  private evidenceDigestMatches(session: AciSession): boolean {
    const data = session.evidence.data;
    if (data === undefined) return false;
    const digest = session.evidence.digest;
    const bytes = this.sessionEvidenceBytes(session);
    if (digest === undefined || bytes === undefined) return false;
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}` === digest;
  }

  private sessionEvidenceBytes(session: AciSession): Buffer | undefined {
    const data = session.evidence.data;
    if (data === undefined) return undefined;
    return this.decodeEvidenceData(data);
  }

  private decodeEvidenceData(data: string): Buffer | undefined {
    const match = /^data:[^,]{1,256};base64,([A-Za-z0-9+/]*={0,2})$/.exec(data);
    const encoded = match?.[1];
    if (encoded === undefined) return undefined;
    try {
      const decoded = Buffer.from(encoded, 'base64');
      return decoded.toString('base64') === encoded ? decoded : undefined;
    } catch {
      return undefined;
    }
  }

  private claimsAccepted(session: AciSession): boolean {
    return this.policy.requiredSessionClaims.every((claimName) => {
      const claim = session.claims[claimName];
      if (claim === null || typeof claim !== 'object' || Array.isArray(claim)) return false;
      const status = (claim as Record<string, unknown>).status;
      const source = (claim as Record<string, unknown>).source;
      return (
        status === 'asserted' &&
        typeof source === 'string' &&
        this.policy.permittedClaimSources.includes(
          source as (typeof this.policy.permittedClaimSources)[number],
        )
      );
    });
  }

  private isCurrentlyEligible(session: AciSession, now: number): boolean {
    const lifetime = session.expires_at - session.established_at;
    return (
      lifetime > 0 &&
      lifetime <= this.policy.maxSessionLifetimeSeconds &&
      session.established_at <= now + this.policy.clockSkewSeconds &&
      session.expires_at > now
    );
  }

  private channelBindingsAccepted(session: AciSession): boolean {
    let acceptedKnownBindings = 0;
    for (const binding of session.channel_binding) {
      if (binding.type === 'e2ee_public_key_sha256') {
        if (!this.e2eeBindingAccepted(session, binding as AciE2eeBinding)) return false;
        acceptedKnownBindings += 1;
        continue;
      }
      if (binding.type !== 'tls_spki_sha256') continue;
      const tlsBinding = binding as AciTlsSpkiBinding;
      let hostname: string;
      try {
        hostname = new URL(tlsBinding.origin).hostname;
      } catch {
        return false;
      }
      if (session.endpoint != null && tlsBinding.origin !== session.endpoint) return false;
      const policyAccepts = this.policy.channelPolicy.acceptedBindings.some(
        (accepted) => accepted.type === tlsBinding.type && accepted.domains.includes(hostname),
      );
      if (!policyAccepts) return false;
      acceptedKnownBindings += 1;
    }
    return acceptedKnownBindings > 0;
  }

  private e2eeBindingAccepted(session: AciSession, binding: AciE2eeBinding): boolean {
    const endpoint = session.endpoint;
    if (endpoint === undefined) return false;
    const policyAccepts = this.policy.channelPolicy.acceptedBindings.some(
      (accepted) =>
        accepted.type === binding.type &&
        (endpoint === null || accepted.domains.includes(new URL(endpoint).hostname)) &&
        accepted.algorithms.some((algorithm) => algorithm === binding.algorithm),
    );
    return policyAccepts;
  }

  private sessionChannelKeyDigest(session: AciSession): string {
    const material = { channel_binding: session.channel_binding };
    return `sha256:${createHash('sha256').update(this.canonicalJson(material)).digest('hex')}`;
  }

  private sessionChannelPins(session: AciSession): readonly VerifiedAciChannelPin[] {
    const pins: VerifiedAciChannelPin[] = [];
    for (const binding of session.channel_binding) {
      if (binding.type === 'e2ee_public_key_sha256') {
        const e2eeBinding = binding as AciE2eeBinding;
        pins.push({
          type: binding.type,
          value: e2eeBinding.public_key_sha256,
          algorithm: e2eeBinding.algorithm,
          ...(e2eeBinding.key_id === undefined ? {} : { keyId: e2eeBinding.key_id }),
          provider: e2eeBinding.provider,
        });
        continue;
      }
      if (binding.type !== 'tls_spki_sha256') continue;
      const tlsBinding = binding as AciTlsSpkiBinding;
      pins.push({
        type: binding.type,
        value: tlsBinding.spki_sha256,
        domain: new URL(tlsBinding.origin).hostname,
      });
    }
    if (pins.length === 0) throw new AciSessionVerificationError('channel_binding_mismatch');
    return pins;
  }

  private canonicalJson(value: unknown): string {
    const state: CanonicalizationState = { active: new Set(), nodes: 0, bytes: 0 };
    try {
      return this.serializeCanonical(value, 0, state);
    } catch (error) {
      if (error instanceof AciSessionVerificationError) throw error;
      throw new AciSessionVerificationError('session_malformed');
    }
  }

  private upstreamIdentityDigest(session: AciSession): string {
    const material = {
      upstream_name: session.upstream_name,
      url_origin: session.endpoint ?? null,
      verifier_id: session.verifier_id,
      channel_bindings: session.channel_binding,
      claims: session.claims,
    };
    return `sha256:${createHash('sha256').update(this.canonicalJson(material)).digest('hex')}`;
  }

  private serializeCanonical(value: unknown, depth: number, state: CanonicalizationState): string {
    state.nodes += 1;
    if (depth > MAX_CANONICAL_DEPTH || state.nodes > MAX_CANONICAL_NODES) {
      throw new AciSessionVerificationError('session_malformed');
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > MAX_CANONICAL_BYTES) {
        throw new AciSessionVerificationError('session_malformed');
      }
      const serialized = JSON.stringify(value);
      this.addCanonicalBytes(state, serialized);
      return serialized;
    }
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        throw new AciSessionVerificationError('session_malformed');
      }
      const serialized = JSON.stringify(value);
      this.addCanonicalBytes(state, serialized);
      return serialized;
    }
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new AciSessionVerificationError('session_malformed');
      }
      if (state.active.has(value)) throw new AciSessionVerificationError('session_malformed');
      state.active.add(value);
      this.addCanonicalBytes(state, '[');
      try {
        const items = value.map((item, index) => {
          if (index > 0) this.addCanonicalBytes(state, ',');
          return this.serializeCanonical(item, depth + 1, state);
        });
        this.addCanonicalBytes(state, ']');
        return `[${items.join(',')}]`;
      } finally {
        state.active.delete(value);
      }
    }
    if (value !== null && typeof value === 'object') {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new AciSessionVerificationError('session_malformed');
      }
      if (state.active.has(value)) throw new AciSessionVerificationError('session_malformed');
      state.active.add(value);
      const object = value as Record<string, unknown>;
      this.addCanonicalBytes(state, '{');
      try {
        const entries = Object.keys(object)
          .sort()
          .map((key, index) => {
            if (index > 0) this.addCanonicalBytes(state, ',');
            const serializedKey = JSON.stringify(key);
            this.addCanonicalBytes(state, serializedKey);
            this.addCanonicalBytes(state, ':');
            return `${serializedKey}:${this.serializeCanonical(object[key], depth + 1, state)}`;
          });
        this.addCanonicalBytes(state, '}');
        return `{${entries.join(',')}}`;
      } finally {
        state.active.delete(value);
      }
    }
    throw new AciSessionVerificationError('session_malformed');
  }

  private addCanonicalBytes(state: CanonicalizationState, value: string): void {
    state.bytes += Buffer.byteLength(value, 'utf8');
    if (state.bytes > MAX_CANONICAL_BYTES) {
      throw new AciSessionVerificationError('session_malformed');
    }
  }
}

export class AciSessionVerifier {
  private readonly core: AciSessionVerifierCore;

  constructor(config: AciSessionVerifierConfig) {
    this.core = new AciSessionVerifierCore(config);
  }

  async verifyAndSelect(input: AciSessionVerificationInput): Promise<VerifiedAciSessionSet> {
    return this.core.verifyAndSelect(input);
  }
}

export class LegacyAciSessionVerifier {
  private readonly core: AciSessionVerifierCore;

  constructor(config: LegacyAciSessionVerifierConfig) {
    this.core = new AciSessionVerifierCore(
      {
        ...config,
        evidenceVerifier: {
          verify: async () => {
            throw new AciSessionVerificationError('session_evidence_verification_failed');
          },
        },
      },
      config.evidenceVerifier,
    );
  }

  async verifyAndSelect(input: AciSessionVerificationInput): Promise<VerifiedAciSessionSet> {
    return this.core.verifyAndSelect(input);
  }
}
