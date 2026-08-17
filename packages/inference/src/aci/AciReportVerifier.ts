// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from 'node:crypto';
import {
  aciWorkloadReportSchema,
  inferenceTrustPolicyV2Schema,
  type AciWorkloadReport,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { AciNativeEvidenceVerifier } from './AciNativeEvidenceVerifier.js';
import { AciReportBindingVerifier } from './AciReportBindingVerifier.js';
import { AciVerificationError } from './AciVerificationError.js';
import { parseStrictJsonBytes } from './strict-json.js';
import { isTrustedTimeContext, readTrustedTimeSample } from './trusted-time.js';
import type {
  AciEvidencePolicyAnchors,
  AciReportVerifierConfig,
  AciTrustContext,
  VerifiedAciChannelPin,
  VerifiedAciKeyset,
} from '../ports.js';

const ACI_REPORT_PATH = '/v1/aci/attestation';
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_NATIVE_VERIFIER_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_REPORT_BYTES = 1_048_576;
const MAX_REPORT_BYTES = 1_048_576;
const NONCE_BYTES = 32;

export class AciReportVerifier {
  private readonly bindingVerifier = new AciReportBindingVerifier();
  private readonly origin: string;
  private readonly policy: InferenceTrustPolicyV2;
  private readonly nativeEvidenceVerifier: AciNativeEvidenceVerifier;
  private readonly fetchImpl: typeof fetch;
  private readonly nonceSource: () => Uint8Array | Promise<Uint8Array>;
  private readonly trustedTimeAuthority: AciReportVerifierConfig['trustedTimeAuthority'];
  private readonly trustedTimeContext: AciTrustContext;
  private readonly keysetHighWaterAuthority: NonNullable<
    AciReportVerifierConfig['keysetHighWaterAuthority']
  >;
  private readonly activationGeneration: number;
  private readonly fetchTimeoutMs: number;
  private readonly maxReportBytes: number;
  private readonly apiKey: string | undefined;

  constructor(config: AciReportVerifierConfig) {
    this.policy = this.parsePolicy(config.policy);
    this.origin = this.pinOrigin(config.baseUrl);
    if (typeof config.fetchImpl !== 'function') {
      throw new AciVerificationError('pinned_transport_required');
    }
    if (typeof config.evidenceVerifier?.verify !== 'function') {
      throw new AciVerificationError('evidence_verifier_required');
    }
    this.fetchImpl = config.fetchImpl;
    this.nonceSource = config.nonceSource ?? (() => randomBytes(NONCE_BYTES));
    this.trustedTimeAuthority = config.trustedTimeAuthority;
    this.trustedTimeContext = config.trustedTimeContext;
    if (
      typeof config.keysetHighWaterAuthority?.read !== 'function' ||
      typeof config.keysetHighWaterAuthority?.admitKeyset !== 'function'
    ) {
      throw new AciVerificationError('high_water_unavailable');
    }
    this.keysetHighWaterAuthority = config.keysetHighWaterAuthority;
    this.activationGeneration = this.positiveSafeInteger(
      config.activationGeneration,
      'activation_generation_invalid',
    );
    this.fetchTimeoutMs = this.boundedInteger(
      config.fetchTimeoutMs,
      DEFAULT_FETCH_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      'fetch_timeout_invalid',
    );
    const nativeVerifierTimeoutMs = this.boundedInteger(
      config.nativeVerifierTimeoutMs,
      DEFAULT_NATIVE_VERIFIER_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      'native_verifier_timeout_invalid',
    );
    this.nativeEvidenceVerifier = new AciNativeEvidenceVerifier(
      config.evidenceVerifier,
      this.policy,
      nativeVerifierTimeoutMs,
    );
    this.maxReportBytes = this.boundedInteger(
      config.maxReportBytes,
      DEFAULT_MAX_REPORT_BYTES,
      MAX_REPORT_BYTES,
      'report_size_invalid',
    );
    this.apiKey = config.apiKey;
  }

  async verify(): Promise<VerifiedAciKeyset> {
    const nonce = await this.createNonce();
    const reportBytes = await this.fetchReport(nonce);
    const report = this.parseReport(reportBytes);
    const { evidenceBytes } = this.bindingVerifier.parseEvidence(report.attestation.evidence);
    const expected = this.bindingVerifier.verify(report, evidenceBytes, nonce);
    await this.verifyFreshness(report, this.trustedTimeContext);
    this.verifySourceProvenance(report, expected.sourceRevision);
    const channelPins = this.createChannelPins(report);
    await this.nativeEvidenceVerifier.verify(
      {
        reportBytes: Uint8Array.from(reportBytes),
        evidenceBytes: Uint8Array.from(evidenceBytes),
        nonce: Uint8Array.from(nonce),
        policyAnchors: this.policyAnchors(),
      },
      expected,
    );
    await this.verifyFreshness(report, this.trustedTimeContext);
    let version: number;
    try {
      version = await this.keysetHighWaterAuthority.admitKeyset({
        context: this.trustedTimeContext,
        keysetDigest: report.workload_keyset_digest,
        policyGeneration: this.policy.generation,
        activationGeneration: this.activationGeneration,
      });
    } catch {
      throw new AciVerificationError('high_water_unavailable');
    }
    return this.publishKeyset(report, channelPins, expected.channelKeyDigest, version);
  }

  private parsePolicy(policy: AciReportVerifierConfig['policy']): InferenceTrustPolicyV2 {
    const parsed = inferenceTrustPolicyV2Schema.safeParse(policy);
    if (!parsed.success) throw new AciVerificationError('policy_invalid');
    return this.deepFreeze(parsed.data);
  }

  private pinOrigin(baseUrl: string): string {
    try {
      const parsed = new URL(baseUrl);
      const path = parsed.pathname.replace(/\/$/, '') || '/';
      if (
        parsed.origin !== this.policy.origin ||
        !['/', '/v1'].includes(path) ||
        parsed.username !== '' ||
        parsed.password !== '' ||
        parsed.search !== '' ||
        parsed.hash !== ''
      ) {
        throw new AciVerificationError('origin_mismatch');
      }
      return parsed.origin;
    } catch (error) {
      if (error instanceof AciVerificationError) throw error;
      throw new AciVerificationError('origin_mismatch');
    }
  }

  private boundedInteger(
    value: number | undefined,
    fallback: number,
    maximum: number,
    errorCode: 'fetch_timeout_invalid' | 'native_verifier_timeout_invalid' | 'report_size_invalid',
  ): number {
    const selected = value ?? fallback;
    if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
      throw new AciVerificationError(errorCode);
    }
    return selected;
  }

  private positiveSafeInteger(
    value: number | undefined,
    errorCode: 'activation_generation_invalid',
  ): number {
    if (!Number.isSafeInteger(value) || value === undefined || value <= 0) {
      throw new AciVerificationError(errorCode);
    }
    return value;
  }

  private async createNonce(): Promise<Uint8Array> {
    let value: Uint8Array;
    try {
      value = Uint8Array.from(await this.nonceSource());
    } catch {
      throw new AciVerificationError('nonce_must_be_32_bytes');
    }
    if (value.byteLength !== NONCE_BYTES) {
      throw new AciVerificationError('nonce_must_be_32_bytes');
    }
    return value;
  }

  private async fetchReport(nonce: Uint8Array): Promise<Uint8Array> {
    const url = new URL(ACI_REPORT_PATH, this.origin);
    url.searchParams.set('nonce', Buffer.from(nonce).toString('hex'));
    const controller = new AbortController();
    const operation = this.performFetch(url, controller.signal);
    try {
      return await this.withTimeout(operation, this.fetchTimeoutMs, 'report_timeout', () =>
        controller.abort(),
      );
    } catch (error) {
      if (error instanceof AciVerificationError) throw error;
      throw new AciVerificationError('report_fetch_failed');
    }
  }

  private async performFetch(url: URL, signal: AbortSignal): Promise<Uint8Array> {
    const response = await this.fetchImpl(url, {
      headers: this.headers(),
      method: 'GET',
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new AciVerificationError('report_fetch_failed');
    this.validateFinalOrigin(response);
    return this.readBoundedBody(response);
  }

  private validateFinalOrigin(response: Response): void {
    try {
      if (new URL(response.url).origin !== this.origin) throw new Error();
    } catch {
      throw new AciVerificationError('report_fetch_failed');
    }
  }

  private async readBoundedBody(response: Response): Promise<Uint8Array> {
    const declaredLength = response.headers.get('content-length');
    if (
      declaredLength !== null &&
      /^\d+$/.test(declaredLength) &&
      Number(declaredLength) > this.maxReportBytes
    ) {
      throw new AciVerificationError('report_too_large');
    }
    if (response.body === null) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > this.maxReportBytes) {
        throw new AciVerificationError('report_too_large');
      }
      return bytes;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > this.maxReportBytes) {
          await this.cancelReader(reader);
          throw new AciVerificationError('report_too_large');
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  private async cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      await reader.cancel();
    } catch {
      return;
    }
  }

  private parseReport(reportBytes: Uint8Array): AciWorkloadReport {
    try {
      const decoded = parseStrictJsonBytes(reportBytes, this.maxReportBytes, {
        asciiMemberNames: true,
      });
      return aciWorkloadReportSchema.parse(decoded);
    } catch {
      throw new AciVerificationError('report_malformed');
    }
  }

  private async verifyFreshness(
    report: AciWorkloadReport,
    context: AciTrustContext,
  ): Promise<number> {
    const now = await this.readTrustedTime(context);
    if (!Number.isFinite(now) || now < 0) throw new AciVerificationError('clock_invalid');
    const notAfter = report.attestation.workload_keyset.not_after;
    if (now >= notAfter) throw new AciVerificationError('keyset_expired');
    return now;
  }

  private verifySourceProvenance(report: AciWorkloadReport, sourceRevision: string): void {
    const provenance = report.attestation.source_provenance;
    if (provenance === undefined || provenance === null) {
      throw new AciVerificationError('source_provenance_mismatch');
    }
    const repoUrl = provenance.repo_url ?? null;
    const repoCommit = provenance.repo_commit ?? null;
    if ((repoUrl === null) !== (repoCommit === null)) {
      throw new AciVerificationError('source_provenance_mismatch');
    }
    if (repoUrl !== null && repoCommit !== null) {
      const repository = this.policy.sourceProvenance.repositories.find(
        (candidate) => candidate.repoUrl === repoUrl,
      );
      if (repository === undefined || !repository.commits.includes(repoCommit)) {
        throw new AciVerificationError('source_provenance_mismatch');
      }
    }
    if (
      provenance.image_digest !== undefined &&
      provenance.image_digest !== null &&
      !this.policy.sourceProvenance.imageDigests.includes(provenance.image_digest)
    ) {
      throw new AciVerificationError('source_provenance_mismatch');
    }
    if (sourceRevision === '') throw new AciVerificationError('source_provenance_mismatch');
  }

  private createChannelPins(report: AciWorkloadReport): readonly VerifiedAciChannelPin[] {
    const hostname = new URL(this.origin).hostname;
    const pins: VerifiedAciChannelPin[] = [];
    const acceptsSpki = this.policy.channelPolicy.acceptedBindings.some(
      (binding) => binding.type === 'tls_spki_sha256' && binding.domains.includes(hostname),
    );
    if (acceptsSpki) {
      for (const key of report.attestation.workload_keyset.tls_public_keys ?? []) {
        if (key.domain === undefined || key.domain === hostname) {
          pins.push({
            type: 'tls_spki_sha256',
            value: key.spki_sha256,
            ...(key.domain === undefined ? {} : { domain: key.domain }),
          });
        }
      }
    }
    for (const binding of this.policy.channelPolicy.acceptedBindings) {
      if (binding.type !== 'e2ee_public_key_sha256' || !binding.domains.includes(hostname))
        continue;
      for (const key of report.attestation.workload_keyset.e2ee_public_keys) {
        if (!binding.algorithms.includes(key.algo as (typeof binding.algorithms)[number])) continue;
        pins.push({
          algorithm: key.algo,
          domain: hostname,
          keyId: key.key_id,
          type: 'e2ee_public_key_sha256',
          value: this.digest(Buffer.from(key.public_key, 'hex')),
        });
      }
    }
    if (pins.length === 0) throw new AciVerificationError('channel_binding_missing');
    return pins;
  }

  private publishKeyset(
    report: AciWorkloadReport,
    channelPins: readonly VerifiedAciChannelPin[],
    channelKeyDigest: string,
    version: number,
  ): VerifiedAciKeyset {
    const keyset = report.attestation.workload_keyset;
    return this.deepFreeze({
      workloadId: report.workload_keyset_digest,
      workloadKeysetDigest: report.workload_keyset_digest,
      version,
      notAfter: keyset.not_after,
      receiptSigningKeys: keyset.receipt_signing_keys.map((key) => ({
        keyId: key.key_id,
        algorithm: key.algo,
        publicKey: key.public_key,
      })),
      e2eePublicKeys: keyset.e2ee_public_keys.map((key) => ({
        keyId: key.key_id,
        algorithm: key.algo,
        publicKey: key.public_key,
      })),
      tlsPublicKeys: (keyset.tls_public_keys ?? []).map((key) => ({
        spkiSha256: key.spki_sha256,
        ...(key.domain === undefined ? {} : { domain: key.domain }),
      })),
      channelPins: channelPins.map((pin) => ({ ...pin })),
      channelKeyDigest,
    });
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

  private async readTrustedTime(context: AciTrustContext): Promise<number> {
    if (this.trustedTimeAuthority === undefined) {
      throw new AciVerificationError('clock_invalid');
    }
    if (!isTrustedTimeContext(context)) {
      throw new AciVerificationError('clock_invalid');
    }
    try {
      return (await readTrustedTimeSample(this.trustedTimeAuthority, context)).trustedNow;
    } catch {
      throw new AciVerificationError('clock_invalid');
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey !== undefined && this.apiKey !== '') {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private digest(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    code: 'native_verifier_timeout' | 'report_timeout',
    onTimeout: () => void = () => undefined,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new AciVerificationError(code));
      }, timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private deepFreeze<T>(value: T): T {
    if (typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) return value;
    for (const child of Object.values(value as Record<string, unknown>)) {
      this.deepFreeze(child);
    }
    return Object.freeze(value);
  }
}
