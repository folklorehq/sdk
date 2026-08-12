// SPDX-License-Identifier: Apache-2.0
import { createHash, createPublicKey, verify as verifyEd25519 } from 'node:crypto';
import { z } from 'zod';
import type { TelemetryClient } from '@folklore/telemetry';
import type { InferenceResponseVerifier } from './ports.js';

// Phala Attested Confidential Inference (ACI) endpoints. Same host as the inference
// gateway, so the enclave vsock allowlist already permits them.
const ACI_ATTESTATION_PATH = '/v1/aci/attestation';
const ACI_RECEIPT_PATH_PREFIX = '/v1/aci/receipts/';
export const ACI_RECEIPT_ID_HEADER = 'x-receipt-id';

const UPSTREAM_VERIFIED_EVENT = 'upstream.verified';
const VERIFIED_RESULT = 'verified';
const DEFAULT_TIMEOUT_MS = 15_000;

// Raw Ed25519 public keys are wrapped in this fixed SPKI DER prefix so node's crypto can
// build a KeyObject from the 32 raw bytes Phala publishes in the keyset.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_RAW_KEY_LEN = 32;

export interface AciVerifierConfig {
  baseUrl: string;
  expectedHost: string;
  expectedWorkloadId: string;
  expectedKeysetDigest: string;
  apiKey?: string;
  telemetry?: TelemetryClient;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const receiptSigningKeySchema = z
  .object({ key_id: z.string().min(1), algo: z.literal('ed25519'), public_key: z.string() })
  .passthrough();

const workloadKeysetSchema = z
  .object({
    not_after: z.number().int(),
    receipt_signing_keys: z.array(receiptSigningKeySchema).min(1),
  })
  .passthrough();

const attestationSchema = z
  .object({
    api_version: z.literal('aci/1'),
    workload_id: z.string(),
    workload_keyset_digest: z.string(),
    attestation: z
      .object({
        workload_keyset: workloadKeysetSchema,
      })
      .passthrough(),
  })
  .passthrough();

const receiptEventSchema = z
  .object({
    type: z.string().optional(),
    event: z.string().optional(),
    result: z.string().optional(),
    required: z.boolean().optional(),
    session_id: z.string().optional(),
  })
  .passthrough();

const receiptSchema = z
  .object({
    api_version: z.literal('aci/1'),
    key_id: z.string().min(1),
    workload_id: z.string(),
    workload_keyset_digest: z.string(),
    event_log: z.array(receiptEventSchema),
    expires_at: z.string(),
    signature: z.string().min(1).optional(),
  })
  .passthrough();

type Receipt = z.infer<typeof receiptSchema>;

interface PinnedAttestation {
  workloadId: string;
  keysetDigest: string;
  notAfter: number;
  signingKeys: ReadonlyArray<z.infer<typeof receiptSigningKeySchema>>;
}

// Thrown when an inference response cannot be proven to have come from a verified TEE
// upstream. Messages are content-free (model/session ids and reasons only) — never
// customer content or key bytes.
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
  private readonly fetchImpl: typeof fetch;
  private readonly expectedWorkloadId: string;
  private readonly expectedKeysetDigest: string;
  private readonly now: () => Date;

  private pinned: PinnedAttestation | null = null;
  private pinning: Promise<PinnedAttestation> | null = null;

  constructor(config: AciVerifierConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    this.apiKey = config.apiKey;
    this.telemetry = config.telemetry;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.expectedWorkloadId = config.expectedWorkloadId;
    this.expectedKeysetDigest = config.expectedKeysetDigest;
    this.now = config.now ?? (() => new Date());
    const endpoint = new URL(this.baseUrl);
    if (endpoint.protocol !== 'https:') {
      throw this.fail('endpoint must use https');
    }
    if (endpoint.hostname !== config.expectedHost) {
      throw this.fail('endpoint host does not match configured pin');
    }
  }

  async ensureAttested(): Promise<void> {
    await this.pin();
  }

  async verifyReceipt(receiptId: string | null): Promise<void> {
    const pinned = await this.pin();
    if (!receiptId) throw this.fail('response carried no receipt id');

    const receipt = await this.fetchReceipt(receiptId);
    this.assertWorkloadMatches(receipt, pinned);
    this.assertNotExpired(receipt);
    const sessionId = this.assertUpstreamVerified(receipt);
    this.assertSignature(receipt, pinned);

    this.telemetry?.track('inference.receipt_verified', 'system', { sessionId });
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
    const parsed = this.parse(attestationSchema, raw, 'attestation');
    const pinned = {
      workloadId: parsed.workload_id,
      keysetDigest: parsed.workload_keyset_digest,
      notAfter: parsed.attestation.workload_keyset.not_after,
      signingKeys: parsed.attestation.workload_keyset.receipt_signing_keys,
    };
    const computedDigest = `sha256:${createHash('sha256')
      .update(canonicalJson(parsed.attestation.workload_keyset))
      .digest('hex')}`;
    if (
      pinned.workloadId !== this.expectedWorkloadId ||
      pinned.keysetDigest !== this.expectedKeysetDigest ||
      computedDigest !== this.expectedKeysetDigest
    ) {
      throw this.fail('attestation does not match configured pin');
    }
    if (pinned.notAfter <= Math.floor(this.now().getTime() / 1_000)) {
      throw this.fail('attested signing keyset expired');
    }
    return pinned;
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
    if (receipt.workload_keyset_digest !== pinned.keysetDigest) {
      throw this.fail('receipt keyset digest does not match pinned attestation');
    }
  }

  private assertNotExpired(receipt: Receipt): void {
    const expiresAt = Date.parse(receipt.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now().getTime()) {
      throw this.fail('receipt expired');
    }
  }

  private assertUpstreamVerified(receipt: Receipt): string {
    const event = receipt.event_log.find((e) => (e.type ?? e.event) === UPSTREAM_VERIFIED_EVENT);
    if (!event) throw this.fail('receipt has no upstream.verified event');
    if (event.result !== VERIFIED_RESULT) {
      throw this.fail(`upstream not verified (result=${String(event.result)})`);
    }
    if (event.required !== true) throw this.fail('upstream verification was not required');
    if (!event.session_id) throw this.fail('verified upstream event carried no session id');
    return event.session_id;
  }

  private assertSignature(receipt: Receipt, pinned: PinnedAttestation): void {
    if (!receipt.signature) throw this.fail('receipt is unsigned');
    const key = pinned.signingKeys.find((candidate) => candidate.key_id === receipt.key_id);
    if (!key) throw this.fail('receipt signing key was not in the attested keyset');
    const message = Buffer.from(this.canonicalSignedPayload(receipt), 'utf8');
    const signature = this.decodeBytes(receipt.signature);
    const ok = this.verifyWithKey(key, message, signature);
    if (!ok) throw this.fail('receipt signature did not match any attested signing key');
  }

  private verifyWithKey(
    key: z.infer<typeof receiptSigningKeySchema>,
    message: Buffer,
    signature: Buffer,
  ): boolean {
    const raw = this.decodeBytes(key.public_key);
    if (raw.length !== ED25519_RAW_KEY_LEN) return false;
    try {
      const spki = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
      const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
      return verifyEd25519(null, message, publicKey, signature);
    } catch {
      return false;
    }
  }

  private canonicalSignedPayload(receipt: Receipt): string {
    const { signature: _signature, ...rest } = receipt;
    return canonicalJson(rest);
  }

  private decodeBytes(value: string): Buffer {
    if (!/^[0-9a-f]+$/.test(value) || value.length % 2 !== 0) return Buffer.alloc(0);
    return Buffer.from(value, 'hex');
  }

  private async getJson(url: string, label: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { headers: this.headers(), signal: controller.signal });
      if (res.status < 200 || res.status >= 300) {
        throw this.fail(`${label} fetch returned ${res.status}`);
      }
      return await res.json();
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
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
