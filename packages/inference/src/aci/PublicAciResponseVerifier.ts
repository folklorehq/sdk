// SPDX-License-Identifier: Apache-2.0
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  aciReceiptSchema,
  type AciReceipt,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import type {
  InferenceAttestationContext,
  InferenceExchangeEvidence,
  InferenceResponseVerifier,
  VerifiedAciKeyset,
} from '../ports.js';
import { PublicAciReportVerifier } from './AciReportVerifier.js';
import { AciReceiptVerificationError } from './AciReceiptVerificationError.js';
import { parseStrictJsonBytes } from './strict-json.js';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const RECEIPT_ID = /^[A-Za-z0-9._:-]{1,256}$/;

type PublicSessionVerifier = (input: {
  receipt: AciReceipt;
  keyset: VerifiedAciKeyset;
  evidence: InferenceExchangeEvidence;
}) => Promise<{ sessionId: string }>;

export interface PublicAciResponseVerifierConfig {
  readonly reportVerifier: PublicAciReportVerifier;
  readonly policy: InferenceTrustPolicyV2;
  readonly fetchImpl: typeof fetch;
  readonly apiKey?: string;
  readonly verifySession: PublicSessionVerifier;
  readonly verifiedReceiptSink?: (sessionId: string) => void | Promise<void>;
  readonly maxReceiptBytes?: number;
}

/** Adapts the public ACI report/keyset to the existing pre-forward response-verifier port. */
const RECEIPT_FETCH_TIMEOUT_MS = 15_000;

export class PublicAciResponseVerifier implements InferenceResponseVerifier {
  private readonly maxReceiptBytes: number;
  private attestationPromise: Promise<VerifiedAciKeyset> | undefined;
  private keyset: VerifiedAciKeyset | undefined;
  private attestationContext: InferenceAttestationContext | undefined;
  private receiptConsumed = false;
  private attestationStarted = false;

  constructor(private readonly config: PublicAciResponseVerifierConfig) {
    if (config.policy.evidence.profile !== 'dstack-tdx-public-v1') {
      throw new AciReceiptVerificationError('policy_invalid');
    }
    if (typeof config.verifySession !== 'function') {
      throw new AciReceiptVerificationError('snapshot_invalid');
    }
    this.maxReceiptBytes = config.maxReceiptBytes ?? 16_777_216;
    if (!Number.isSafeInteger(this.maxReceiptBytes) || this.maxReceiptBytes < 1) {
      throw new AciReceiptVerificationError('policy_invalid');
    }
  }

  async ensureAttested(context?: InferenceAttestationContext): Promise<void> {
    if (
      context === undefined ||
      this.receiptConsumed ||
      this.attestationStarted ||
      this.attestationPromise !== undefined
    ) {
      throw new AciReceiptVerificationError('snapshot_invalid');
    }
    const role = context.modelRole ?? 'generate';
    const roleModel = this.config.policy.roleModels[role];
    if (
      roleModel === undefined ||
      roleModel.model !== context.model ||
      roleModel.revision !== context.modelRevision
    ) {
      throw new AciReceiptVerificationError('model_mismatch');
    }
    if (!['/v1/embeddings', '/v1/chat/completions'].includes(context.endpoint)) {
      throw new AciReceiptVerificationError('endpoint_mismatch');
    }
    this.attestationStarted = true;
    const promise = this.config.reportVerifier.verify();
    this.attestationPromise = promise;
    try {
      this.keyset = await promise;
      this.attestationContext = Object.freeze({ ...context });
    } finally {
      if (this.attestationPromise === promise) this.attestationPromise = undefined;
    }
  }

  async verifyReceipt(
    receiptId: string | null,
    evidence: InferenceExchangeEvidence,
  ): Promise<void> {
    const keyset = this.keyset;
    const context = this.attestationContext;
    if (keyset === undefined || context === undefined || this.receiptConsumed) {
      throw new AciReceiptVerificationError('snapshot_invalid');
    }
    this.receiptConsumed = true;
    this.keyset = undefined;
    this.attestationContext = undefined;
    const role = evidence.modelRole ?? 'generate';
    const roleModel = this.config.policy.roleModels[role];
    if (
      roleModel === undefined ||
      roleModel.model !== evidence.model ||
      roleModel.revision !== evidence.modelRevision
    ) {
      throw new AciReceiptVerificationError('model_mismatch');
    }
    const id = this.receiptId(receiptId);
    const receipt = await this.fetchReceipt(id);
    if (receipt.workload_keyset_digest !== keyset.workloadKeysetDigest) {
      throw new AciReceiptVerificationError('keyset_mismatch');
    }
    if (
      receipt.endpoint !== context.endpoint ||
      receipt.model !== context.model ||
      evidence.model !== context.model ||
      evidence.modelRevision !== context.modelRevision ||
      evidence.modelRole !== context.modelRole
    ) {
      throw new AciReceiptVerificationError('model_mismatch');
    }
    this.verifyHashes(receipt, evidence);
    this.verifySignature(receipt, keyset);
    const session = await this.config.verifySession({ receipt, keyset, evidence });
    if (!session || typeof session.sessionId !== 'string' || session.sessionId.length === 0) {
      throw new AciReceiptVerificationError('upstream_session_mismatch');
    }
    await this.config.verifiedReceiptSink?.(session.sessionId);
  }

  private async fetchReceipt(receiptId: string): Promise<AciReceipt> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RECEIPT_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.config.fetchImpl(
        new URL(`/v1/aci/receipts/${encodeURIComponent(receiptId)}`, this.config.policy.origin),
        { method: 'GET', redirect: 'error', headers: this.headers(), signal: controller.signal },
      );
      if (!response.ok) throw new AciReceiptVerificationError('receipt_fetch_failed');
      if (new URL(response.url).origin !== this.config.policy.origin) {
        throw new AciReceiptVerificationError('receipt_fetch_failed');
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader !== undefined) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > this.maxReceiptBytes) {
            await reader.cancel();
            throw new AciReceiptVerificationError('receipt_too_large');
          }
          chunks.push(part.value);
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > this.maxReceiptBytes)
          throw new AciReceiptVerificationError('receipt_too_large');
        chunks.push(bytes);
        length = bytes.byteLength;
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return aciReceiptSchema.parse(
          parseStrictJsonBytes(bytes, this.maxReceiptBytes, { asciiMemberNames: true }),
        );
      } catch {
        throw new AciReceiptVerificationError('receipt_malformed');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(): Record<string, string> | undefined {
    return this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : undefined;
  }

  private receiptId(value: string | null): string {
    if (value === null || !RECEIPT_ID.test(value))
      throw new AciReceiptVerificationError('receipt_id_missing');
    return value;
  }

  private verifyHashes(receipt: AciReceipt, evidence: InferenceExchangeEvidence): void {
    const request = receipt.event_log.find((event) => event.type === 'request.received');
    const response = receipt.event_log.find((event) => event.type === 'response.returned');
    if (request?.body_hash !== `sha256:${evidence.requestSha256}`) {
      throw new AciReceiptVerificationError('request_hash_mismatch');
    }
    if (response?.body_hash !== `sha256:${evidence.responseSha256}`) {
      throw new AciReceiptVerificationError('response_hash_mismatch');
    }
  }

  private verifySignature(receipt: AciReceipt, keyset: VerifiedAciKeyset): void {
    const signer = keyset.receiptSigningKeys.find((key) => key.keyId === receipt.key_id);
    if (!signer || signer.algorithm.toLowerCase() !== 'ed25519') {
      throw new AciReceiptVerificationError('signer_not_found');
    }
    const { signature, ...unsigned } = receipt;
    try {
      const key = createPublicKey({
        format: 'der',
        type: 'spki',
        key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(signer.publicKey, 'hex')]),
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
      throw new AciReceiptVerificationError('signature_invalid');
    }
  }
}
