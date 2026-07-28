// SPDX-License-Identifier: Apache-2.0
import { createPublicKey, verify as verifyEd25519 } from 'node:crypto';
import { z } from 'zod';
// Phala Attested Confidential Inference (ACI) endpoints. Same host as the inference
// gateway, so the enclave vsock allowlist already permits them (ADL #40).
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
const receiptSigningKeySchema = z
    .object({ id: z.string().optional(), algorithm: z.string(), public_key: z.string() })
    .passthrough();
const attestationSchema = z
    .object({
    workload_id: z.string(),
    workload_keyset_digest: z.string(),
    attestation: z
        .object({
        workload_keyset: z
            .object({ receipt_signing_keys: z.array(receiptSigningKeySchema).min(1) })
            .passthrough(),
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
    workload_id: z.string(),
    workload_keyset_digest: z.string(),
    event_log: z.array(receiptEventSchema),
    signature: z.string().optional(),
})
    .passthrough();
// Thrown when an inference response cannot be proven to have come from a verified TEE
// upstream. Messages are content-free (model/session ids and reasons only) — never
// customer content or key bytes (ADL #12/#18).
export class InferenceAttestationError extends Error {
    constructor(reason) {
        super(`inference attestation failed: ${reason}`);
        this.name = 'InferenceAttestationError';
    }
}
export class AciReceiptVerifier {
    baseUrl;
    apiKey;
    telemetry;
    timeoutMs;
    policy;
    enforceReceiptSignature;
    fetchImpl;
    pinned = null;
    pinning = null;
    satisfied = false;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
        this.apiKey = config.apiKey;
        this.telemetry = config.telemetry;
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.policy = config.policy ?? 'first-call';
        this.enforceReceiptSignature = config.enforceReceiptSignature ?? false;
        this.fetchImpl = config.fetchImpl ?? fetch;
    }
    async ensureAttested() {
        await this.pin();
    }
    async verifyReceipt(receiptId) {
        if (this.policy === 'first-call' && this.satisfied)
            return;
        const pinned = await this.pin();
        if (!receiptId)
            throw this.fail('response carried no receipt id');
        const receipt = await this.fetchReceipt(receiptId);
        this.assertWorkloadMatches(receipt, pinned);
        const sessionId = this.assertUpstreamVerified(receipt);
        if (this.enforceReceiptSignature)
            this.assertSignature(receipt, pinned);
        this.satisfied = true;
        this.telemetry?.track('inference.receipt_verified', 'system', { sessionId });
    }
    async pin() {
        if (this.pinned)
            return this.pinned;
        this.pinning ??= this.fetchAttestation();
        try {
            this.pinned = await this.pinning;
            return this.pinned;
        }
        catch (err) {
            this.pinning = null;
            throw err;
        }
    }
    async fetchAttestation() {
        const raw = await this.getJson(`${this.baseUrl}${ACI_ATTESTATION_PATH}`, 'attestation');
        const parsed = this.parse(attestationSchema, raw, 'attestation');
        return {
            workloadId: parsed.workload_id,
            keysetDigest: parsed.workload_keyset_digest,
            signingKeys: parsed.attestation.workload_keyset.receipt_signing_keys,
        };
    }
    async fetchReceipt(receiptId) {
        const url = `${this.baseUrl}${ACI_RECEIPT_PATH_PREFIX}${encodeURIComponent(receiptId)}`;
        const raw = await this.getJson(url, 'receipt');
        return this.parse(receiptSchema, raw, 'receipt');
    }
    assertWorkloadMatches(receipt, pinned) {
        if (receipt.workload_id !== pinned.workloadId) {
            throw this.fail('receipt workload_id does not match pinned attestation');
        }
        if (receipt.workload_keyset_digest !== pinned.keysetDigest) {
            throw this.fail('receipt keyset digest does not match pinned attestation');
        }
    }
    assertUpstreamVerified(receipt) {
        const event = receipt.event_log.find((e) => (e.type ?? e.event) === UPSTREAM_VERIFIED_EVENT);
        if (!event)
            throw this.fail('receipt has no upstream.verified event');
        if (event.result !== VERIFIED_RESULT) {
            throw this.fail(`upstream not verified (result=${String(event.result)})`);
        }
        if (event.required !== true)
            throw this.fail('upstream verification was not required');
        if (!event.session_id)
            throw this.fail('verified upstream event carried no session id');
        return event.session_id;
    }
    assertSignature(receipt, pinned) {
        if (!receipt.signature)
            throw this.fail('receipt is unsigned');
        const message = Buffer.from(this.canonicalSignedPayload(receipt), 'utf8');
        const signature = this.decodeBytes(receipt.signature);
        const ok = pinned.signingKeys.some((key) => this.verifyWithKey(key, message, signature));
        if (!ok)
            throw this.fail('receipt signature did not match any attested signing key');
    }
    verifyWithKey(key, message, signature) {
        const raw = this.decodeBytes(key.public_key);
        if (raw.length !== ED25519_RAW_KEY_LEN)
            return false;
        try {
            const spki = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
            const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
            return verifyEd25519(null, message, publicKey, signature);
        }
        catch {
            return false;
        }
    }
    // The receipt minus its detached signature, canonicalized with sorted keys. The exact
    // Phala canonicalization is unconfirmed in public docs, so signature enforcement stays
    // opt-in (enforceReceiptSignature) until reconciled against live receipts.
    canonicalSignedPayload(receipt) {
        const { signature: _signature, ...rest } = receipt;
        return canonicalJson(rest);
    }
    decodeBytes(value) {
        if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
            return Buffer.from(value, 'hex');
        }
        return Buffer.from(value, 'base64');
    }
    async getJson(url, label) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const res = await this.fetchImpl(url, { headers: this.headers(), signal: controller.signal });
            if (res.status < 200 || res.status >= 300) {
                throw this.fail(`${label} fetch returned ${res.status}`);
            }
            return await res.json();
        }
        catch (err) {
            if (err instanceof InferenceAttestationError)
                throw err;
            throw this.fail(`${label} fetch failed`);
        }
        finally {
            clearTimeout(timer);
        }
    }
    parse(schema, raw, label) {
        const result = schema.safeParse(raw);
        if (!result.success)
            throw this.fail(`${label} response had an unexpected shape`);
        return result.data;
    }
    fail(reason) {
        this.telemetry?.track('inference.attestation_failed', 'system', { reason });
        return new InferenceAttestationError(reason);
    }
    headers() {
        const headers = { Accept: 'application/json' };
        if (this.apiKey)
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        return headers;
    }
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}
//# sourceMappingURL=aci-verifier.js.map