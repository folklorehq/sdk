// SPDX-License-Identifier: Apache-2.0
import { createHash, createPublicKey, verify as verifyEd25519 } from 'node:crypto';
import {
  inferenceAttestationV1Payload,
  inferenceReceiptKeysetV1Payload,
  inferenceTrustPolicyV1Schema,
  type InferenceTrustPolicyV1,
} from '@folklore/contracts';
import type { TelemetryClient } from '@folklore/telemetry';
import { z } from 'zod';
import { dispatchAciProtocol } from './official-aci-attestation.js';
import type { InferenceExchangeEvidence, InferenceResponseVerifier } from './ports.js';

const ACI_ATTESTATION_PATH = '/v1/aci/attestation';
const ACI_RECEIPT_PATH_PREFIX = '/v1/aci/receipts/';
export const ACI_RECEIPT_ID_HEADER = 'x-receipt-id';
const UPSTREAM_VERIFIED_EVENT = 'upstream.verified';
const VERIFIED_RESULT = 'verified';
const DEFAULT_TIMEOUT_MS = 15_000;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_RAW_KEY_LEN = 32;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MEASUREMENT = /^[0-9a-f]{96}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ROUTE =
  /^\/(?:[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?$/;
const BASE64_SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const MAX_SESSION_ID_LENGTH = 200;
const MAX_SEQUENCE_STATE_ENTRIES = 256;

export type ReceiptVerificationPolicy = 'per-call' | 'first-call';

export interface AciVerifierConfig {
  baseUrl: string;
  trustPolicy: InferenceTrustPolicyV1;
  apiKey?: string;
  telemetry?: TelemetryClient;
  timeoutMs?: number;
  policy?: ReceiptVerificationPolicy;
  testOnlyAllowUnsignedReceipts?: boolean;
  verifiedReceiptSink?: (sessionId: string) => void | Promise<void>;
  /** Fetch bound to the same offline-authorized TLS pins used by inference requests. */
  fetchImpl: typeof fetch;
}

const attestationSchema = z
  .object({
    workload_id: z.string().regex(IDENTIFIER),
    workload_keyset_digest: z.string().regex(DIGEST),
    channel_key_digest: z.string().regex(DIGEST),
    quote_root_digest: z.string().regex(DIGEST),
    workload_measurement: z.string().regex(MEASUREMENT),
    receipt_keyset_digest: z.string().regex(DIGEST),
    policy_generation: z.number().int().safe().positive(),
    route: z.string().regex(ROUTE),
    signer_key_id: z.string().regex(IDENTIFIER),
    signature: z.string().regex(BASE64_SIGNATURE),
  })
  .strict();

const receiptEventSchema = z
  .object({
    type: z.string().optional(),
    event: z.string().optional(),
    result: z.string().optional(),
    required: z.boolean().optional(),
    session_id: z.string().min(1).max(MAX_SESSION_ID_LENGTH).optional(),
  })
  .strict();

const receiptSchema = z
  .object({
    workload_id: z.string().regex(IDENTIFIER),
    workload_keyset_digest: z.string().regex(DIGEST),
    receipt_keyset_digest: z.string().regex(DIGEST),
    channel_key_digest: z.string().regex(DIGEST),
    event_log: z.array(receiptEventSchema).min(1),
    signature: z.string().regex(BASE64_SIGNATURE).optional(),
    request_sha256: z.string().regex(DIGEST),
    response_sha256: z.string().regex(DIGEST),
    model: z.string().regex(MODEL),
    model_revision: z.string().regex(IDENTIFIER),
    nonce: z.string().length(44),
    route: z.string().regex(ROUTE),
    policy_generation: z.number().int().safe().positive(),
    sequence: z.number().int().safe().positive(),
    signer_key_id: z.string().regex(IDENTIFIER),
    algorithm: z.literal('Ed25519'),
  })
  .strict();

type Attestation = z.infer<typeof attestationSchema>;
type Receipt = z.infer<typeof receiptSchema>;

interface PinnedAttestation {
  workloadId: string;
  workloadKeysetDigest: string;
  channelKeyDigest: string;
  receiptKeysetDigest: string;
  route: string;
  policyGeneration: number;
}

export class InferenceAttestationError extends Error {
  constructor(reason: string) {
    super(`inference attestation failed: ${reason}`);
    this.name = 'InferenceAttestationError';
  }
}

export class AciReceiptVerifier implements InferenceResponseVerifier {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly telemetry: TelemetryClient | undefined;
  private readonly timeoutMs: number;
  private readonly policy: ReceiptVerificationPolicy;
  private readonly trustPolicy: InferenceTrustPolicyV1;
  private readonly testOnlyAllowUnsignedReceipts: boolean;
  private readonly verifiedReceiptSink: ((sessionId: string) => void | Promise<void>) | undefined;
  private readonly fetchImpl: typeof fetch;

  private pinned: PinnedAttestation | null = null;
  private pinning: Promise<PinnedAttestation> | null = null;
  private satisfied = false;
  private readonly lastSequenceByChannelSession = new Map<string, number>();

  constructor(config: AciVerifierConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    this.trustPolicy = inferenceTrustPolicyV1Schema.parse(config.trustPolicy);
    let endpoint: URL;
    try {
      endpoint = new URL(this.baseUrl);
    } catch {
      throw new InferenceAttestationError('endpoint must use https');
    }
    if (endpoint.protocol !== 'https:') {
      throw new InferenceAttestationError('endpoint must use https');
    }
    const expectedBaseUrl = `${this.trustPolicy.origin}${this.trustPolicy.route}`
      .replace(/\/$/, '')
      .replace(/\/v1$/, '');
    if (this.baseUrl !== expectedBaseUrl) {
      throw new InferenceAttestationError('endpoint does not match the offline trust policy');
    }
    this.apiKey = config.apiKey;
    this.telemetry = config.telemetry;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.policy = config.policy ?? 'per-call';
    this.testOnlyAllowUnsignedReceipts = config.testOnlyAllowUnsignedReceipts ?? false;
    if (this.testOnlyAllowUnsignedReceipts && process.env['NODE_ENV'] !== 'test') {
      throw new InferenceAttestationError('unsigned receipt test mode is unavailable');
    }
    if (!config.fetchImpl) {
      throw new InferenceAttestationError('pinned transport is required');
    }
    this.verifiedReceiptSink = config.verifiedReceiptSink;
    this.fetchImpl = config.fetchImpl;
  }

  async ensureAttested(): Promise<void> {
    await this.pin();
  }

  async verifyReceipt(
    receiptId: string | null,
    evidence: InferenceExchangeEvidence,
  ): Promise<void> {
    if (this.policy === 'first-call' && this.satisfied) return;
    const pinned = await this.pin();
    if (!receiptId) throw this.fail('response carried no receipt id');

    const receipt = await this.fetchReceipt(receiptId);
    this.assertWorkloadMatches(receipt, pinned);
    this.assertExchangeMatches(receipt, evidence);
    const sessionId = this.assertUpstreamVerified(receipt);
    if (!this.testOnlyAllowUnsignedReceipts) this.assertSignature(receipt);
    this.assertSequence(receipt, sessionId);
    if (this.verifiedReceiptSink) await this.verifiedReceiptSink(sessionId);
    else this.telemetry?.track('inference.receipt_verified', 'system', { sessionId });

    this.satisfied = true;
  }

  private assertExchangeMatches(receipt: Receipt, evidence: InferenceExchangeEvidence): void {
    if (receipt.request_sha256 !== evidence.requestSha256) {
      throw this.fail('receipt request digest mismatch');
    }
    if (receipt.response_sha256 !== evidence.responseSha256) {
      throw this.fail('receipt response digest mismatch');
    }
    if (receipt.model !== evidence.model) throw this.fail('receipt model mismatch');
    if (receipt.model_revision !== evidence.modelRevision) {
      throw this.fail('receipt model revision mismatch');
    }
    if (receipt.nonce !== evidence.nonce) throw this.fail('receipt nonce mismatch');
    const roleModel = evidence.modelRole
      ? this.trustPolicy.roleModels[evidence.modelRole]
      : Object.values(this.trustPolicy.roleModels).find(
          (binding) =>
            binding.model === evidence.model && binding.revision === evidence.modelRevision,
        );
    if (
      !roleModel ||
      roleModel.model !== receipt.model ||
      roleModel.revision !== receipt.model_revision
    ) {
      throw this.fail('receipt model is not authorized by the signed role policy');
    }
  }

  private async pin(): Promise<PinnedAttestation> {
    if (this.pinned) return this.pinned;
    this.pinning ??= this.fetchAttestation();
    try {
      this.pinned = await this.pinning;
      return this.pinned;
    } catch (err) {
      this.pinning = null;
      throw err;
    }
  }

  private async fetchAttestation(): Promise<PinnedAttestation> {
    const raw = await this.getJson(`${this.baseUrl}${ACI_ATTESTATION_PATH}`, 'attestation');
    const dispatch = dispatchAciProtocol(raw, (legacyRaw) =>
      this.parse(attestationSchema, legacyRaw, 'attestation'),
    );
    if (dispatch.protocol === 'error') {
      throw this.fail(`attestation protocol rejected: ${dispatch.code}`);
    }
    if (dispatch.protocol === 'official-aci/1') {
      throw this.fail('official ACI/1 attestation requires the official verifier');
    }
    const parsed = dispatch.body;
    this.assertAttestationSignature(parsed);
    const expectedReceiptKeysetDigest = this.receiptKeysetDigest();
    if (parsed.workload_id !== this.trustPolicy.workloadId) {
      throw this.fail('attested workload does not match the offline trust policy');
    }
    if (!this.trustPolicy.quoteRootDigests.includes(parsed.quote_root_digest)) {
      throw this.fail('attestation quote root is not authorized by the offline trust policy');
    }
    if (!this.trustPolicy.workloadMeasurements.includes(parsed.workload_measurement)) {
      throw this.fail(
        'attested workload measurement is not authorized by the offline trust policy',
      );
    }
    if (parsed.receipt_keyset_digest !== expectedReceiptKeysetDigest) {
      throw this.fail('attested receipt keyset digest does not match the signed policy');
    }
    if (parsed.policy_generation !== this.trustPolicy.generation) {
      throw this.fail('attestation policy generation does not match the signed policy');
    }
    if (parsed.route !== this.trustPolicy.route) {
      throw this.fail('attestation route does not match the signed policy');
    }
    return {
      workloadId: parsed.workload_id,
      workloadKeysetDigest: parsed.workload_keyset_digest,
      channelKeyDigest: parsed.channel_key_digest,
      receiptKeysetDigest: parsed.receipt_keyset_digest,
      route: parsed.route,
      policyGeneration: parsed.policy_generation,
    };
  }

  private async fetchReceipt(receiptId: string): Promise<Receipt> {
    const url = `${this.baseUrl}${ACI_RECEIPT_PATH_PREFIX}${encodeURIComponent(receiptId)}`;
    const raw = await this.getJson(url, 'receipt');
    return this.parse(receiptSchema, raw, 'receipt');
  }

  private assertWorkloadMatches(receipt: Receipt, pinned: PinnedAttestation): void {
    if (receipt.workload_id !== pinned.workloadId) {
      throw this.fail('receipt workload_id does not match pinned attestation');
    }
    if (receipt.workload_keyset_digest !== pinned.workloadKeysetDigest) {
      throw this.fail('receipt keyset digest does not match pinned attestation');
    }
    if (receipt.receipt_keyset_digest !== pinned.receiptKeysetDigest) {
      throw this.fail('receipt receipt-keyset digest does not match pinned attestation');
    }
    if (receipt.channel_key_digest !== pinned.channelKeyDigest) {
      throw this.fail('receipt channel key digest mismatch');
    }
    if (receipt.route !== pinned.route) throw this.fail('receipt route does not match attestation');
    if (receipt.policy_generation !== pinned.policyGeneration) {
      throw this.fail('receipt policy generation does not match attestation');
    }
  }

  private assertUpstreamVerified(receipt: Receipt): string {
    const event = receipt.event_log.find(
      (entry) => (entry.type ?? entry.event) === UPSTREAM_VERIFIED_EVENT,
    );
    if (!event) throw this.fail('receipt has no upstream.verified event');
    if (event.result !== VERIFIED_RESULT) {
      throw this.fail(`upstream not verified (result=${String(event.result)})`);
    }
    if (event.required !== true) throw this.fail('upstream verification was not required');
    if (!event.session_id) throw this.fail('verified upstream event carried no session id');
    return event.session_id;
  }

  private assertSequence(receipt: Receipt, sessionId: string): void {
    const stateKey = `${receipt.channel_key_digest}\u0000${sessionId}`;
    const lastSequence = this.lastSequenceByChannelSession.get(stateKey);
    if (lastSequence !== undefined && receipt.sequence <= lastSequence) {
      throw this.fail('receipt sequence replay');
    }
    if (
      lastSequence === undefined &&
      this.lastSequenceByChannelSession.size >= MAX_SEQUENCE_STATE_ENTRIES
    ) {
      throw this.fail('receipt sequence state capacity exhausted');
    }
    this.lastSequenceByChannelSession.set(stateKey, receipt.sequence);
  }

  private assertAttestationSignature(attestation: Attestation): void {
    const key = this.trustPolicy.attestationKeys.find(
      (candidate) => candidate.keyId === attestation.signer_key_id,
    );
    if (!key || key.algorithm !== 'Ed25519') {
      throw this.fail('attestation signer is not authorized by the signed policy');
    }
    const payload = Buffer.from(
      inferenceAttestationV1Payload({
        workloadId: attestation.workload_id,
        workloadKeysetDigest: attestation.workload_keyset_digest,
        channelKeyDigest: attestation.channel_key_digest,
        quoteRootDigest: attestation.quote_root_digest,
        workloadMeasurement: attestation.workload_measurement,
        receiptKeysetDigest: attestation.receipt_keyset_digest,
        trustPolicyGeneration: attestation.policy_generation,
        route: attestation.route,
        signerKeyId: attestation.signer_key_id,
      }),
      'utf8',
    );
    const signature = Buffer.from(attestation.signature, 'base64');
    if (!this.verifyRawKey(key.publicKey, payload, signature)) {
      throw this.fail('attestation signature did not match the signed policy');
    }
  }

  private assertSignature(receipt: Receipt): void {
    if (!receipt.signature) throw this.fail('receipt is unsigned');
    const key = this.trustPolicy.receiptKeys.find(
      (candidate) => candidate.keyId === receipt.signer_key_id,
    );
    if (!key || receipt.algorithm !== key.algorithm) {
      throw this.fail('receipt signer is not authorized by the signed policy');
    }
    const message = Buffer.from(this.canonicalSignedPayload(receipt), 'utf8');
    const signature = Buffer.from(receipt.signature, 'base64');
    if (!this.verifyRawKey(key.publicKey, message, signature)) {
      throw this.fail('receipt signature did not match the signed policy');
    }
  }

  private verifyRawKey(publicKeyBase64: string, message: Buffer, signature: Buffer): boolean {
    const raw = Buffer.from(publicKeyBase64, 'base64');
    if (raw.length !== ED25519_RAW_KEY_LEN || signature.length !== 64) return false;
    try {
      const publicKey = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
        format: 'der',
        type: 'spki',
      });
      return verifyEd25519(null, message, publicKey, signature);
    } catch {
      return false;
    }
  }

  private canonicalSignedPayload(receipt: Receipt): string {
    const { signature: _signature, ...rest } = receipt;
    return canonicalJson(rest);
  }

  private receiptKeysetDigest(): string {
    return createHash('sha256')
      .update(inferenceReceiptKeysetV1Payload(this.trustPolicy.receiptKeys), 'utf8')
      .digest('hex');
  }

  private async getJson(url: string, label: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        headers: this.headers(),
        redirect: 'error',
        signal: controller.signal,
      });
      if (res.status < 200 || res.status >= 300) {
        throw this.fail(`${label} fetch returned ${res.status}`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch (err) {
      if (err instanceof InferenceAttestationError) throw err;
      throw this.fail(`${label} fetch failed`);
    } finally {
      clearTimeout(timer);
    }
  }

  private parse<T>(schema: z.ZodType<T>, raw: unknown, label: string): T {
    const result = schema.safeParse(raw);
    if (!result.success) throw this.fail(`${label} response had an unexpected shape`);
    return result.data;
  }

  private fail(reason: string): InferenceAttestationError {
    this.telemetry?.track('inference.attestation_failed', 'system', { reason });
    return new InferenceAttestationError(reason);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    return headers;
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
