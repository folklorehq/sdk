// SPDX-License-Identifier: Apache-2.0
import type { InferenceTrustPolicyV2 } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { z } from 'zod';
import { AciVerificationError } from './AciVerificationError.js';
import type { ExpectedAciEvidenceBindings } from './AciReportBindingVerifier.js';
import type {
  AciEvidenceVerificationInput,
  AciEvidenceVerifierPort,
  VerifiedAciEvidenceBindings,
} from '../ports.js';

const MAX_BINDING_ITEMS = 32;
const PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MEASUREMENT = /^[0-9a-f]{96}$/;

const verifiedBindingsSchema = z
  .object({
    workloadId: z.string().regex(PREFIXED_DIGEST),
    nonce: z.string().regex(/^[0-9a-f]{64}$/),
    reportDataStatementDigest: z.string().regex(DIGEST),
    workloadKeysetDigest: z.string().regex(PREFIXED_DIGEST),
    channelKeyDigest: z.string().regex(PREFIXED_DIGEST),
    teeType: z.enum(['tdx', 'sev_snp']),
    runtimeIdentity: z.string().min(1).max(512),
    appIdentity: z.string().min(1).max(512),
    composeDigest: z.string().regex(PREFIXED_DIGEST).nullable(),
    imageDigest: z.string().regex(PREFIXED_DIGEST).nullable(),
    kmsRootDigest: z.string().regex(DIGEST),
    quoteRootDigest: z.string().regex(DIGEST),
    measurements: z.array(z.string().regex(MEASUREMENT)).min(1).max(MAX_BINDING_ITEMS),
    rtmrs: z.array(z.string().regex(MEASUREMENT)).min(1).max(MAX_BINDING_ITEMS),
    tcbStatus: z.string().min(1).max(128),
    sourceRevision: z.string().min(1).max(512),
    evidenceTranscriptDigest: z.string().regex(PREFIXED_DIGEST),
  })
  .strict();

export class AciNativeEvidenceVerifier {
  constructor(
    private readonly evidenceVerifier: AciEvidenceVerifierPort,
    private readonly policy: InferenceTrustPolicyV2,
    private readonly timeoutMs: number,
  ) {}

  async verify(
    input: Omit<AciEvidenceVerificationInput, 'deadline' | 'signal'>,
    expected: ExpectedAciEvidenceBindings,
  ): Promise<void> {
    const actual = await this.invoke(input);
    const independentlyBound = Object.fromEntries(
      Object.keys(expected).map((key) => [key, actual[key as keyof VerifiedAciEvidenceBindings]]),
    );
    if (canonicalJson(independentlyBound) !== canonicalJson(expected)) {
      throw new AciVerificationError('native_binding_mismatch');
    }
    this.verifyPolicy(actual);
  }

  private async invoke(
    input: Omit<AciEvidenceVerificationInput, 'deadline' | 'signal'>,
  ): Promise<VerifiedAciEvidenceBindings> {
    const controller = new AbortController();
    const deadline = performance.now() + this.timeoutMs;
    const timeoutError = new AciVerificationError('native_verifier_timeout');
    let didTimeout = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        didTimeout = true;
        controller.abort(timeoutError);
        reject(timeoutError);
      }, this.timeoutMs);
    });
    let operation: Promise<VerifiedAciEvidenceBindings>;
    try {
      operation = Promise.resolve(
        this.evidenceVerifier.verify({ ...input, deadline, signal: controller.signal }),
      );
    } catch {
      if (timer !== undefined) clearTimeout(timer);
      throw new AciVerificationError('native_verification_failed');
    }
    if (performance.now() >= deadline) {
      didTimeout = true;
      controller.abort(timeoutError);
      if (timer !== undefined) clearTimeout(timer);
      throw timeoutError;
    }
    let result: unknown;
    try {
      result = await Promise.race([operation, timeout]);
    } catch {
      if (didTimeout) throw timeoutError;
      throw new AciVerificationError('native_verification_failed');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    if (performance.now() >= deadline) {
      controller.abort(timeoutError);
      throw timeoutError;
    }
    const parsed = verifiedBindingsSchema.safeParse(result);
    if (!parsed.success) throw new AciVerificationError('native_result_malformed');
    return parsed.data;
  }

  private verifyPolicy(bindings: VerifiedAciEvidenceBindings): void {
    const evidence = this.policy.evidence;
    const hasAllMeasurements = bindings.measurements.every((value) =>
      evidence.runtimeMeasurements.includes(value),
    );
    const hasAllRtmrs = bindings.rtmrs.every((value) => evidence.runtimeRtmrs.includes(value));
    const composeAccepted =
      bindings.composeDigest === null
        ? evidence.measuredComposeDigests.length === 0
        : evidence.measuredComposeDigests.includes(bindings.composeDigest);
    const imageAccepted =
      bindings.imageDigest === null
        ? evidence.imageDigests.length === 0
        : evidence.imageDigests.includes(bindings.imageDigest);
    if (
      !evidence.teeTypes.includes(bindings.teeType) ||
      !evidence.dstackAppIdentities.includes(bindings.appIdentity) ||
      !evidence.runtimeIdentities.includes(bindings.runtimeIdentity) ||
      !evidence.dstackKmsRoots.includes(bindings.kmsRootDigest) ||
      !evidence.quoteRootDigests.includes(bindings.quoteRootDigest) ||
      !evidence.tcbStatuses.includes(bindings.tcbStatus) ||
      !hasAllMeasurements ||
      !hasAllRtmrs ||
      !composeAccepted ||
      !imageAccepted
    ) {
      throw new AciVerificationError('native_policy_mismatch');
    }
  }
}
