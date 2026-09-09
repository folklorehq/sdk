// SPDX-License-Identifier: Apache-2.0
import { createHash, createPublicKey } from 'node:crypto';
import {
  aciPublicProviderEvidenceV1Schema,
  inferenceTrustPolicyV2Schema,
  type AciPublicProviderEvidenceV1,
  type AciWorkloadReport,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { z } from 'zod';
import { AciReportBindingVerifier } from './AciReportBindingVerifier.js';
import { AciVerificationError } from './AciVerificationError.js';

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const measurement = z.string().regex(/^[0-9a-f]{96}$/);
const identity = z.string().regex(/^[0-9a-f]{40}$/);
const observationsSchema = z.object({
  version: z.literal(2),
  verdict: z.literal('accepted'),
  failureCode: z.literal('none'),
  quoteDigestHex: digest,
  eventLogDigestHex: digest,
  vmConfigDigestHex: digest,
  quoteRootDigestHex: digest,
  reportDataHex: z.string().regex(/^[0-9a-f]{128}$/),
  teeVariant: z.literal('dstack-tdx'),
  tcbStatus: z.literal('UpToDate'),
  mrTdHex: measurement,
  rtmr0Hex: measurement,
  rtmr1Hex: measurement,
  rtmr2Hex: measurement,
  rtmr3Hex: measurement,
  replayedRtmr3Hex: measurement,
  appInfo: z.object({
    appIdHex: identity,
    instanceIdHex: identity,
    composeHashHex: digest,
    keyProviderInfoDigestHex: digest,
  }),
  keyProvider: z.object({
    name: z.literal('kms'),
    id: z
      .string()
      .min(2)
      .max(2_048)
      .regex(/^(?:[0-9a-f]{2})+$/),
  }),
});

/** Observations only, never caller-supplied expected identities or source claims. */
export type AciPublicQuoteObservations = z.infer<typeof observationsSchema>;

export interface AciPublicQuoteVerifierPort {
  verify(input: {
    readonly evidence: AciPublicProviderEvidenceV1;
    readonly evaluationTimeUnixSeconds: number;
    readonly deadline: number;
    readonly signal: AbortSignal;
  }): Promise<unknown>;
}

/** Public quote policy boundary. CA identity is not a k256 custody-chain claim. */
export class AciPublicQuotePolicyVerifier {
  private readonly policy: InferenceTrustPolicyV2;

  constructor(
    private readonly native: AciPublicQuoteVerifierPort,
    policy: InferenceTrustPolicyV2,
    private readonly timeoutMs: number,
  ) {
    const parsed = inferenceTrustPolicyV2Schema.safeParse(policy);
    if (
      !parsed.success ||
      parsed.data.evidence.profile !== 'dstack-tdx-public-v1' ||
      parsed.data.evidence.imageDigests.length !== 0 ||
      parsed.data.evidence.measuredComposeDigests.length === 0 ||
      typeof native?.verify !== 'function' ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > 60_000
    )
      throw new AciVerificationError('policy_invalid');
    this.policy = parsed.data;
  }

  async verify(
    report: AciWorkloadReport,
    nonce: Uint8Array,
    evaluationTimeUnixSeconds: number,
  ): Promise<void> {
    if (!(nonce instanceof Uint8Array) || nonce.byteLength !== 32)
      throw new AciVerificationError('nonce_must_be_32_bytes');
    if (!Number.isSafeInteger(evaluationTimeUnixSeconds) || evaluationTimeUnixSeconds <= 0)
      throw new AciVerificationError('clock_invalid');
    const expected = new AciReportBindingVerifier().verify(report, nonce);
    const parsed = aciPublicProviderEvidenceV1Schema.safeParse(report.attestation.evidence);
    if (!parsed.success) throw new AciVerificationError('report_malformed');
    const evidence = parsed.data;
    if (!/^(?:[0-9a-f]{2})+$/.test(evidence.quote))
      throw new AciVerificationError('report_malformed');
    const observed = await this.invoke(evidence, evaluationTimeUnixSeconds);
    if (
      observed.quoteDigestHex !== this.sha256(Buffer.from(evidence.quote, 'hex')) ||
      observed.eventLogDigestHex !== this.sha256(evidence.event_log) ||
      observed.vmConfigDigestHex !== this.sha256(evidence.vm_config) ||
      observed.reportDataHex !== `${expected.reportDataStatementDigest}${'0'.repeat(64)}` ||
      observed.reportDataHex !== evidence.quote_report_data ||
      observed.replayedRtmr3Hex !== observed.rtmr3Hex ||
      observed.appInfo.composeHashHex !== this.sha256(evidence.app_compose)
    )
      throw new AciVerificationError('native_binding_mismatch');

    const pins = this.policy.evidence;
    const rtmrs = [observed.rtmr0Hex, observed.rtmr1Hex, observed.rtmr2Hex, observed.rtmr3Hex];
    if (
      expected.teeType !== 'tdx' ||
      !pins.teeTypes.includes('tdx') ||
      !pins.quoteRootDigests.includes(observed.quoteRootDigestHex) ||
      !pins.tcbStatuses.includes(observed.tcbStatus) ||
      !pins.runtimeMeasurements.includes(observed.mrTdHex) ||
      !rtmrs.every((value) => pins.runtimeRtmrs.includes(value)) ||
      !pins.dstackAppIdentities.includes(`dstack-app:${observed.appInfo.appIdHex}`) ||
      !pins.runtimeIdentities.includes(`dstack-instance:${observed.appInfo.instanceIdHex}`) ||
      !pins.measuredComposeDigests.includes(`sha256:${observed.appInfo.composeHashHex}`) ||
      !pins.dstackKmsRoots.includes(this.kmsCaSpkiDigest(observed.keyProvider.id))
    )
      throw new AciVerificationError('native_policy_mismatch');
  }

  private async invoke(
    evidence: AciPublicProviderEvidenceV1,
    evaluationTimeUnixSeconds: number,
  ): Promise<AciPublicQuoteObservations> {
    const controller = new AbortController();
    const deadline = performance.now() + this.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AciVerificationError('native_verifier_timeout'));
        }, this.timeoutMs);
      });
      const result = await Promise.race([
        this.native.verify({
          evidence,
          evaluationTimeUnixSeconds,
          deadline,
          signal: controller.signal,
        }),
        timeout,
      ]);
      if (performance.now() >= deadline) {
        controller.abort();
        throw new AciVerificationError('native_verifier_timeout');
      }
      const parsed = observationsSchema.safeParse(result);
      if (!parsed.success) throw new AciVerificationError('native_result_malformed');
      return parsed.data;
    } catch (error) {
      if (error instanceof AciVerificationError) throw error;
      throw new AciVerificationError('native_verification_failed');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private kmsCaSpkiDigest(hex: string): string {
    try {
      const der = Buffer.from(hex, 'hex');
      const key = createPublicKey({ key: der, type: 'spki', format: 'der' });
      if (
        key.asymmetricKeyType !== 'ec' ||
        key.asymmetricKeyDetails?.namedCurve !== 'prime256v1' ||
        !der.equals(key.export({ type: 'spki', format: 'der' }))
      )
        throw new Error();
      return this.sha256(der);
    } catch {
      throw new AciVerificationError('native_policy_mismatch');
    }
  }
}
