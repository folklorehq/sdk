// SPDX-License-Identifier: Apache-2.0
import { ECDH, createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';

import {
  aciReceiptSchema,
  inferenceTrustPolicyV2Schema,
  type AciReceipt,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';

import type {
  AciReceiptVerificationInput,
  AciReceiptVerifierPort,
  AciReceiptVerifierConfig,
  AciTrustContext,
  VerifiedAciChannelPin,
  VerifiedAciReceipt,
  VerifiedAciSession,
} from '../ports.js';
import {
  AciReceiptVerificationError,
  type AciReceiptVerificationErrorCode,
} from './AciReceiptVerificationError.js';
import { parseStrictJsonBytes } from './strict-json.js';
import { isTrustedTimeContext, readTrustedTimeSample } from './trusted-time.js';

const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RECEIPT_BYTES = 1_048_576;
const DEFAULT_REPLAY_CAPACITY = 4_096;
const MAX_FETCH_TIMEOUT_MS = 60_000;
const MAX_RECEIPT_BYTES = 16_777_216;
const MAX_REPLAY_CAPACITY = 65_536;
const RECEIPT_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

type UpstreamEvent = Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }>;

export class AciReceiptVerifier implements AciReceiptVerifierPort {
  private readonly baseUrl: string;
  private readonly policy: InferenceTrustPolicyV2;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string | undefined;
  private readonly trustedTimeAuthority: AciReceiptVerifierConfig['trustedTimeAuthority'];
  private readonly fetchTimeoutMs: number;
  private readonly maxReceiptBytes: number;
  private readonly replayCapacity: number;
  private readonly inFlightReceiptKeys = new Set<string>();
  private readonly verifiedReceiptKeys = new Set<string>();
  private readonly replayOrder: string[] = [];

  constructor(config: AciReceiptVerifierConfig) {
    const policy = inferenceTrustPolicyV2Schema.safeParse(config.policy);
    if (!policy.success) throw new AciReceiptVerificationError('policy_invalid');
    this.policy = policy.data;
    this.baseUrl = this.validateBaseUrl(config.baseUrl);
    this.fetchImpl = config.fetchImpl;
    this.apiKey = config.apiKey;
    this.trustedTimeAuthority = config.trustedTimeAuthority;
    this.fetchTimeoutMs = this.boundedInteger(
      config.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
      MAX_FETCH_TIMEOUT_MS,
      'policy_invalid',
    );
    this.maxReceiptBytes = this.boundedInteger(
      config.maxReceiptBytes ?? DEFAULT_MAX_RECEIPT_BYTES,
      MAX_RECEIPT_BYTES,
      'policy_invalid',
    );
    this.replayCapacity = this.boundedInteger(
      config.replayCapacity ?? DEFAULT_REPLAY_CAPACITY,
      MAX_REPLAY_CAPACITY,
      'policy_invalid',
    );
  }

  async verify(input: AciReceiptVerificationInput): Promise<VerifiedAciReceipt> {
    const receiptId = this.validateReceiptId(input.receiptId);
    const replayKey = this.receiptReplayKey(input.trustedTimeContext, receiptId);
    this.claimReceiptKey(replayKey);
    try {
      const receipt = await this.fetchReceipt(receiptId);
      const session = await this.validateReceipt(receipt, input, receiptId);
      this.verifyReceiptSignature(receipt, input);
      this.rememberReceiptKey(replayKey);
      return Object.freeze({
        receiptId,
        servedAt: receipt.served_at,
        sessionId: session.sessionId,
      });
    } finally {
      this.inFlightReceiptKeys.delete(replayKey);
    }
  }

  private validateBaseUrl(value: string): string {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username !== '' ||
        url.password !== '' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.pathname !== '/' ||
        url.origin !== this.policy.origin
      ) {
        throw new Error();
      }
      return url.origin;
    } catch {
      throw new AciReceiptVerificationError('policy_invalid');
    }
  }

  private boundedInteger(
    value: number,
    maximum: number,
    code: AciReceiptVerificationErrorCode,
  ): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new AciReceiptVerificationError(code);
    }
    return value;
  }

  private validateReceiptId(value: string | null): string {
    if (value === null) throw new AciReceiptVerificationError('receipt_id_missing');
    if (!RECEIPT_ID.test(value)) throw new AciReceiptVerificationError('receipt_id_invalid');
    return value;
  }

  private claimReceiptKey(replayKey: string): void {
    if (this.inFlightReceiptKeys.has(replayKey) || this.verifiedReceiptKeys.has(replayKey)) {
      throw new AciReceiptVerificationError('receipt_replay');
    }
    if (this.replayOrder.length >= this.replayCapacity) {
      throw new AciReceiptVerificationError('replay_capacity_exhausted');
    }
    this.inFlightReceiptKeys.add(replayKey);
  }

  private rememberReceiptKey(replayKey: string): void {
    if (this.replayOrder.length >= this.replayCapacity) {
      throw new AciReceiptVerificationError('replay_capacity_exhausted');
    }
    this.verifiedReceiptKeys.add(replayKey);
    this.replayOrder.push(replayKey);
  }

  private async fetchReceipt(receiptId: string): Promise<AciReceipt> {
    const controller = new AbortController();
    try {
      return await this.withTimeout(this.performFetch(receiptId, controller.signal), () =>
        controller.abort(),
      );
    } catch (error) {
      if (error instanceof AciReceiptVerificationError) throw error;
      throw new AciReceiptVerificationError('receipt_fetch_failed');
    }
  }

  private async performFetch(receiptId: string, signal: AbortSignal): Promise<AciReceipt> {
    const response = await this.fetchImpl(
      new URL(`/v1/aci/receipts/${encodeURIComponent(receiptId)}`, this.baseUrl),
      {
        headers:
          this.apiKey === undefined || this.apiKey === ''
            ? undefined
            : { authorization: `Bearer ${this.apiKey}` },
        method: 'GET',
        redirect: 'error',
        signal,
      },
    );
    if (!response.ok) throw new AciReceiptVerificationError('receipt_fetch_failed');
    this.validateFinalOrigin(response);
    const bytes = await this.readBoundedBody(response);
    let value: unknown;
    try {
      value = parseStrictJsonBytes(bytes, this.maxReceiptBytes);
    } catch {
      throw new AciReceiptVerificationError('receipt_malformed');
    }
    const parsed = aciReceiptSchema.safeParse(value);
    if (!parsed.success) throw new AciReceiptVerificationError('receipt_malformed');
    return parsed.data;
  }

  private async readBoundedBody(response: Response): Promise<Uint8Array> {
    const declaredLength = response.headers.get('content-length');
    if (
      declaredLength !== null &&
      /^\d+$/.test(declaredLength) &&
      Number(declaredLength) > this.maxReceiptBytes
    ) {
      throw new AciReceiptVerificationError('receipt_too_large');
    }
    if (response.body === null) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > this.maxReceiptBytes) {
        throw new AciReceiptVerificationError('receipt_too_large');
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
        if (length > this.maxReceiptBytes) {
          await this.cancelReader(reader);
          throw new AciReceiptVerificationError('receipt_too_large');
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

  private async withTimeout<T>(operation: Promise<T>, onTimeout: () => void): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new AciReceiptVerificationError('receipt_timeout'));
      }, this.fetchTimeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async validateReceipt(
    receipt: AciReceipt,
    input: AciReceiptVerificationInput,
    receiptId: string,
  ): Promise<VerifiedAciSession> {
    const session = input.snapshot.sessions[input.role];
    if (session === undefined) throw new AciReceiptVerificationError('snapshot_invalid');
    if (receipt.receipt_id !== receiptId) {
      throw new AciReceiptVerificationError('receipt_id_mismatch');
    }
    if (receipt.workload_id !== input.snapshot.keyset.workloadId) {
      throw new AciReceiptVerificationError('workload_mismatch');
    }
    if (receipt.workload_keyset_digest !== input.snapshot.keyset.workloadKeysetDigest) {
      throw new AciReceiptVerificationError('keyset_mismatch');
    }
    if (receipt.model !== session.model) throw new AciReceiptVerificationError('model_mismatch');
    if (receipt.endpoint !== input.endpoint) {
      throw new AciReceiptVerificationError('endpoint_mismatch');
    }
    if (receipt.method !== input.method) throw new AciReceiptVerificationError('method_mismatch');
    this.validateEventOrder(receipt);
    await this.validateServingTime(receipt.served_at, input, session);
    this.validateHashes(receipt, input);
    this.validateUpstreamSession(receipt, session);
    return session;
  }

  private async validateServingTime(
    servedAt: number,
    input: AciReceiptVerificationInput,
    session: VerifiedAciSession,
  ): Promise<void> {
    const now = await this.readTrustedTime(input.trustedTimeContext);
    if (
      !Number.isSafeInteger(now) ||
      now <= 0 ||
      servedAt > now + this.policy.clockSkewSeconds ||
      servedAt < session.establishedAt - this.policy.clockSkewSeconds ||
      servedAt >= session.expiresAt ||
      servedAt >= input.snapshot.keyset.notAfter ||
      servedAt >= input.snapshot.expiresAt
    ) {
      throw new AciReceiptVerificationError(
        !Number.isSafeInteger(now) || now <= 0 ? 'clock_invalid' : 'served_at_invalid',
      );
    }
  }

  private validateHashes(receipt: AciReceipt, input: AciReceiptVerificationInput): void {
    const request = receipt.event_log.find((event) => event.type === 'request.received');
    const forwarded = receipt.event_log.find((event) => event.type === 'request.forwarded');
    const response = receipt.event_log.find((event) => event.type === 'response.returned');
    const requestDigest = this.digest(input.requestBytes);
    const responseDigest = this.digest(input.responseBytes);
    if (request?.body_hash !== requestDigest || forwarded?.body_hash !== requestDigest) {
      throw new AciReceiptVerificationError('request_hash_mismatch');
    }
    if (response?.wire_hash !== responseDigest || response.cleartext_hash !== responseDigest) {
      throw new AciReceiptVerificationError('response_hash_mismatch');
    }
  }

  private validateUpstreamSession(receipt: AciReceipt, session: VerifiedAciSession): void {
    const responseIndex = receipt.event_log.findIndex(
      (event) => event.type === 'response.returned',
    );
    const eligible = receipt.event_log.filter(
      (event): event is UpstreamEvent =>
        event.type === 'upstream.verified' &&
        event.result === 'verified' &&
        event.required === true,
    );
    const exact = eligible.filter(
      (event) =>
        receipt.event_log.indexOf(event) < responseIndex &&
        event.session_id === session.sessionId &&
        event.model_id === session.model &&
        this.upstreamIdentityMatches(event, session) &&
        this.channelPinsEqual(event.channel_bindings, session.channelPins),
    );
    if (exact.length !== 1) throw new AciReceiptVerificationError('upstream_session_mismatch');
  }

  private channelPinsEqual(
    bindings: UpstreamEvent['channel_bindings'],
    pins: readonly VerifiedAciChannelPin[],
  ): boolean {
    try {
      const normalized = bindings.map((binding): VerifiedAciChannelPin => {
        if (binding.type === 'e2ee_public_key_sha256') {
          return {
            type: binding.type,
            value: binding.public_key_sha256,
            provider: binding.provider,
            algorithm: binding.algorithm,
            ...(binding.key_id === undefined ? {} : { keyId: binding.key_id }),
          };
        }
        return {
          type: binding.type,
          value:
            binding.type === 'tls_spki_sha256' ? binding.spki_sha256 : binding.certificate_sha256,
          domain: new URL(binding.origin).hostname,
        };
      });
      const normalizedValues = normalized.map((pin) => canonicalJson(pin)).sort();
      const pinnedValues = pins.map((pin) => canonicalJson(pin)).sort();
      return canonicalJson(normalizedValues) === canonicalJson(pinnedValues);
    } catch {
      return false;
    }
  }

  private upstreamIdentityMatches(event: UpstreamEvent, session: VerifiedAciSession): boolean {
    if (event.session_id === undefined || event.claims === undefined) return false;
    const material = {
      upstream_name: event.upstream_name,
      url_origin: event.url_origin,
      verifier_id: event.verifier_id,
      channel_bindings: event.channel_bindings,
      claims: event.claims,
    };
    return (
      `sha256:${createHash('sha256').update(canonicalJson(material)).digest('hex')}` ===
      session.upstreamIdentityDigest
    );
  }

  private validateEventOrder(receipt: AciReceipt): void {
    const indexOf = (type: string): number =>
      receipt.event_log.findIndex((event) => event.type === type);
    const requestReceived = indexOf('request.received');
    const requestForwarded = indexOf('request.forwarded');
    const responseReceived = indexOf('response.received');
    const responseReturned = indexOf('response.returned');
    const responseModified = receipt.event_log
      .map((event, index) => (event.type === 'transparency.response_modified' ? index : -1))
      .filter((index) => index >= 0);
    if (
      requestReceived !== 0 ||
      requestForwarded <= requestReceived ||
      responseReturned <= requestForwarded ||
      responseModified.some(
        (index) => responseReceived < 0 || index <= responseReceived || index >= responseReturned,
      ) ||
      receipt.event_log.some(
        (event, index) =>
          (event.type === 'upstream.verified' &&
            (index <= requestForwarded || index >= responseReturned)) ||
          (event.type === 'response.received' && index >= responseReturned),
      )
    ) {
      throw new AciReceiptVerificationError('event_order_invalid');
    }
  }

  private validateFinalOrigin(response: Response): void {
    try {
      if (new URL(response.url).origin !== this.baseUrl) {
        throw new Error();
      }
    } catch {
      throw new AciReceiptVerificationError('receipt_fetch_failed');
    }
  }

  private verifyReceiptSignature(receipt: AciReceipt, input: AciReceiptVerificationInput): void {
    const signer = input.snapshot.keyset.receiptSigningKeys.find(
      (key) => key.keyId === receipt.signature.key_id,
    );
    if (signer === undefined) throw new AciReceiptVerificationError('signer_not_found');
    if (signer.algorithm !== receipt.signature.algo) {
      throw new AciReceiptVerificationError('signature_algorithm_mismatch');
    }
    const { value: _value, ...signature } = receipt.signature;
    const bytes = Buffer.from(canonicalJson({ ...receipt, signature }));
    const signatureBytes = Buffer.from(receipt.signature.value, 'hex');
    let isValid = false;
    try {
      if (receipt.signature.algo === 'ed25519') {
        const key = createPublicKey({
          format: 'der',
          key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(signer.publicKey, 'hex')]),
          type: 'spki',
        });
        isValid = verifySignature(null, bytes, key, signatureBytes);
      } else {
        const recoveryId = this.normalizeRecoveryId(signatureBytes[64]);
        const point = Buffer.from(
          ECDH.convertKey(
            Buffer.from(signer.publicKey, 'hex'),
            'secp256k1',
            undefined,
            undefined,
            'uncompressed',
          ),
        );
        const recoveredPoint = Buffer.from(
          secp256k1.Signature.fromCompact(signatureBytes.subarray(0, 64))
            .addRecoveryBit(recoveryId)
            .recoverPublicKey(createHash('sha256').update(bytes).digest())
            .toRawBytes(false),
        );
        if (!recoveredPoint.equals(point)) throw new Error();
        const key = createPublicKey({
          format: 'jwk',
          key: {
            crv: 'secp256k1',
            kty: 'EC',
            x: point.subarray(1, 33).toString('base64url'),
            y: point.subarray(33, 65).toString('base64url'),
          },
        });
        isValid = verifySignature(
          'sha256',
          bytes,
          { dsaEncoding: 'ieee-p1363', key },
          signatureBytes.subarray(0, 64),
        );
      }
    } catch {
      isValid = false;
    }
    if (!isValid) throw new AciReceiptVerificationError('signature_invalid');
  }

  private normalizeRecoveryId(value: number | undefined): number {
    if (value === undefined) throw new Error();
    if (value >= 0 && value <= 3) return value;
    if (value >= 27 && value <= 30) return value - 27;
    throw new Error();
  }

  private digest(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }

  private receiptReplayKey(context: AciTrustContext, receiptId: string): string {
    if (!isTrustedTimeContext(context)) {
      throw new AciReceiptVerificationError('clock_invalid');
    }
    return [
      context.orgId,
      context.deploymentId,
      context.bootEpoch,
      context.checkpointDigest,
      receiptId,
    ].join('\u0000');
  }

  private async readTrustedTime(context: AciTrustContext): Promise<number> {
    if (this.trustedTimeAuthority === undefined) {
      throw new AciReceiptVerificationError('clock_invalid');
    }
    if (!isTrustedTimeContext(context)) {
      throw new AciReceiptVerificationError('clock_invalid');
    }
    try {
      return (await readTrustedTimeSample(this.trustedTimeAuthority, context)).trustedNow;
    } catch {
      throw new AciReceiptVerificationError('clock_invalid');
    }
  }
}
