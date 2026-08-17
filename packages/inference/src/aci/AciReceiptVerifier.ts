// SPDX-License-Identifier: Apache-2.0
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  aciReceiptSchema,
  inferenceTrustPolicyV2Schema,
  type AciSession,
  type AciReceipt,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';

import type {
  AciReceiptVerificationInput,
  AciReceiptReplayClaim,
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
const MAX_FETCH_TIMEOUT_MS = 60_000;
const MAX_RECEIPT_BYTES = 16_777_216;
const RECEIPT_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

type UpstreamEvent = Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }>;

type VerifiedReceiptOutcome = 'served' | 'refused';

interface ReceiptValidation {
  readonly outcome: VerifiedReceiptOutcome;
  readonly sessionId?: string;
}

export class AciReceiptVerifier implements AciReceiptVerifierPort {
  private readonly baseUrl: string;
  private readonly policy: InferenceTrustPolicyV2;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string | undefined;
  private readonly trustedTimeAuthority: AciReceiptVerifierConfig['trustedTimeAuthority'];
  private readonly fetchTimeoutMs: number;
  private readonly maxReceiptBytes: number;
  private readonly replayStore: AciReceiptVerifierConfig['replayStore'];

  constructor(config: AciReceiptVerifierConfig) {
    const policy = inferenceTrustPolicyV2Schema.safeParse(config.policy);
    if (!policy.success) throw new AciReceiptVerificationError('policy_invalid');
    this.policy = policy.data;
    const replayStore = config.replayStore;
    if (typeof replayStore?.claim !== 'function') {
      throw new AciReceiptVerificationError('replay_store_required');
    }
    this.baseUrl = this.validateBaseUrl(config.baseUrl);
    this.fetchImpl = config.fetchImpl;
    this.apiKey = config.apiKey;
    this.trustedTimeAuthority = config.trustedTimeAuthority;
    this.replayStore = replayStore;
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
  }

  async verify(input: AciReceiptVerificationInput): Promise<VerifiedAciReceipt> {
    const receiptId = this.validateReceiptId(input.receiptId);
    const replayClaim = this.receiptReplayClaim(input, receiptId);
    const claim = await this.claimReceipt(replayClaim);
    let verified = false;
    try {
      const receipt = await this.fetchReceipt(receiptId);
      const validation = await this.validateReceipt(receipt, input, receiptId);
      this.verifyReceiptSignature(receipt, input);
      await this.replayStore.markVerified(claim);
      verified = true;
      return Object.freeze(
        validation.sessionId === undefined
          ? { outcome: validation.outcome, receiptId, servedAt: receipt.served_at }
          : {
              outcome: validation.outcome,
              receiptId,
              servedAt: receipt.served_at,
              sessionId: validation.sessionId,
            },
      );
    } finally {
      if (!verified) await this.replayStore.releasePending(claim);
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

  private async claimReceipt(replayClaim: AciReceiptReplayClaim): Promise<AciReceiptReplayClaim> {
    try {
      return await this.replayStore.claim(replayClaim);
    } catch (error) {
      if (error instanceof AciReceiptVerificationError) throw error;
      throw new AciReceiptVerificationError('receipt_replay');
    }
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
      value = parseStrictJsonBytes(bytes, this.maxReceiptBytes, { asciiMemberNames: true });
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
  ): Promise<ReceiptValidation> {
    const session = input.snapshot.sessions[input.role];
    if (session === undefined) throw new AciReceiptVerificationError('snapshot_invalid');
    if (receipt.receipt_id !== receiptId) {
      throw new AciReceiptVerificationError('receipt_id_mismatch');
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
    const outcome = this.validateUpstreamSession(receipt, session);
    return outcome === 'served' && this.hasServingUpstream(receipt, session)
      ? { outcome, sessionId: session.sessionId }
      : { outcome };
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
    const request = receipt.event_log.find(
      (event): event is Extract<AciReceipt['event_log'][number], { type: 'request.received' }> =>
        event.type === 'request.received',
    );
    const response = receipt.event_log.find(
      (event): event is Extract<AciReceipt['event_log'][number], { type: 'response.returned' }> =>
        event.type === 'response.returned',
    );
    const requestDigest = this.digest(input.requestBytes);
    const responseDigest = this.digest(input.responseBytes);
    if (request?.body_hash !== requestDigest) {
      throw new AciReceiptVerificationError('request_hash_mismatch');
    }
    if (response?.body_hash !== responseDigest) {
      throw new AciReceiptVerificationError('response_hash_mismatch');
    }
  }

  private isUpstreamEvent(event: AciReceipt['event_log'][number]): event is UpstreamEvent {
    return (
      event.type === 'upstream.verified' &&
      'result' in event &&
      'required' in event &&
      'model_id' in event
    );
  }

  private validateUpstreamSession(
    receipt: AciReceipt,
    session: VerifiedAciSession,
  ): VerifiedReceiptOutcome {
    const responseIndex = receipt.event_log.findIndex(
      (event) => event.type === 'response.returned',
    );
    const exactVerified: UpstreamEvent[] = [];
    const exactVerifiedIndexes: number[] = [];
    const exactRefusals: UpstreamEvent[] = [];
    const exactRefusalIndexes: number[] = [];
    const successfulEvents: UpstreamEvent[] = [];
    for (const [index, event] of receipt.event_log.entries()) {
      if (!this.isUpstreamEvent(event) || index >= responseIndex) continue;
      if (event.result === 'verified') successfulEvents.push(event);
      if (
        event.result === 'verified' &&
        event.required === true &&
        event.session_id === session.sessionId &&
        event.model_id === session.model &&
        this.upstreamIdentityMatches(event, session)
      ) {
        exactVerified.push(event);
        exactVerifiedIndexes.push(index);
      }
      if (
        event.result === 'failed' &&
        event.required === true &&
        event.model_id === session.model
      ) {
        exactRefusals.push(event);
        exactRefusalIndexes.push(index);
      }
    }
    if (successfulEvents.length > 0) {
      if (exactVerified.length !== 1) {
        throw new AciReceiptVerificationError('upstream_session_mismatch');
      }
      const verifiedIndex = exactVerifiedIndexes[0];
      if (
        verifiedIndex === undefined ||
        exactRefusalIndexes.some((index) => index > verifiedIndex)
      ) {
        throw new AciReceiptVerificationError('upstream_session_mismatch');
      }
      return 'served';
    }
    if (exactRefusals.length > 0) {
      if (exactRefusals.length !== 1) {
        throw new AciReceiptVerificationError('upstream_session_mismatch');
      }
      return 'refused';
    }
    throw new AciReceiptVerificationError('upstream_session_mismatch');
  }

  private hasServingUpstream(receipt: AciReceipt, session: VerifiedAciSession): boolean {
    return receipt.event_log.some(
      (event) =>
        this.isUpstreamEvent(event) &&
        event.result === 'verified' &&
        event.required === true &&
        event.session_id === session.sessionId &&
        event.model_id === session.model &&
        this.upstreamIdentityMatches(event, session),
    );
  }

  private channelPinsEqual(
    bindings: UpstreamEvent['channel_bindings'],
    pins: readonly VerifiedAciChannelPin[],
  ): boolean {
    if (bindings === undefined) return false;
    try {
      const normalized: VerifiedAciChannelPin[] = [];
      for (const binding of bindings) {
        if (binding.type !== 'e2ee_public_key_sha256' && binding.type !== 'tls_spki_sha256')
          continue;
        const pin = this.normalizeChannelBinding(binding);
        if (pin === undefined) return false;
        normalized.push(pin);
      }
      const normalizedValues = normalized.map((pin) => canonicalJson(pin)).sort();
      const pinnedValues = pins.map((pin) => canonicalJson(pin)).sort();
      return canonicalJson(normalizedValues) === canonicalJson(pinnedValues);
    } catch {
      return false;
    }
  }

  private normalizeChannelBinding(
    binding: AciSession['channel_binding'][number],
  ): VerifiedAciChannelPin | undefined {
    if (binding.type === 'e2ee_public_key_sha256') {
      const publicKey = this.stringProperty(binding, 'public_key_sha256');
      const provider = this.stringProperty(binding, 'provider');
      const algorithm = this.stringProperty(binding, 'algorithm');
      if (publicKey === undefined || provider === undefined || algorithm === undefined) {
        return undefined;
      }
      const keyId = this.stringProperty(binding, 'key_id');
      return {
        type: binding.type,
        value: publicKey,
        provider,
        algorithm,
        ...(keyId === undefined ? {} : { keyId }),
      };
    }
    if (binding.type !== 'tls_spki_sha256') {
      return undefined;
    }
    const origin = this.stringProperty(binding, 'origin');
    const value = this.stringProperty(binding, 'spki_sha256');
    if (origin === undefined || value === undefined) return undefined;
    return { type: binding.type, value, domain: new URL(origin).hostname };
  }

  private stringProperty(value: object, key: string): string | undefined {
    const property = (value as Record<string, unknown>)[key];
    return typeof property === 'string' ? property : undefined;
  }

  private upstreamIdentityMatches(event: UpstreamEvent, session: VerifiedAciSession): boolean {
    if (event.session_id === undefined) return false;
    if (
      event.channel_bindings !== undefined &&
      !this.channelPinsEqual(event.channel_bindings, session.channelPins)
    ) {
      return false;
    }
    const identity = session.upstreamIdentity;
    if (identity === undefined) return false;
    return (
      (event.upstream_name === undefined || event.upstream_name === identity.upstreamName) &&
      (event.url_origin === undefined || event.url_origin === identity.urlOrigin) &&
      (event.verifier_id === undefined || event.verifier_id === identity.verifierId) &&
      (event.claims === undefined || isDeepStrictEqual(event.claims, identity.claims))
    );
  }

  private validateEventOrder(receipt: AciReceipt): void {
    const indexOf = (type: string): number =>
      receipt.event_log.findIndex((event) => event.type === type);
    const requestReceived = indexOf('request.received');
    const requestForwarded = indexOf('request.forwarded');
    const responseReturned = indexOf('response.returned');
    if (
      requestReceived !== 0 ||
      responseReturned <= requestReceived ||
      receipt.event_log.some(
        (event, index) =>
          (event.type === 'request.forwarded' &&
            (index <= requestReceived || index >= responseReturned)) ||
          (event.type === 'upstream.verified' &&
            (index <= requestReceived ||
              (requestForwarded >= 0 && index <= requestForwarded) ||
              index >= responseReturned)),
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
      (key) => key.keyId === receipt.key_id,
    );
    if (signer === undefined) throw new AciReceiptVerificationError('signer_not_found');
    if (signer.algorithm !== 'ed25519') {
      throw new AciReceiptVerificationError('signature_algorithm_mismatch');
    }
    const { signature, ...unsigned } = receipt;
    const bytes = Buffer.from(canonicalJson(unsigned));
    const signatureBytes = Buffer.from(signature, 'hex');
    let isValid = false;
    try {
      const key = createPublicKey({
        format: 'der',
        key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(signer.publicKey, 'hex')]),
        type: 'spki',
      });
      isValid = verifySignature(null, bytes, key, signatureBytes);
    } catch {
      isValid = false;
    }
    if (!isValid) throw new AciReceiptVerificationError('signature_invalid');
  }

  private digest(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }

  private receiptReplayClaim(
    input: AciReceiptVerificationInput,
    receiptId: string,
  ): AciReceiptReplayClaim {
    if (!isTrustedTimeContext(input.trustedTimeContext)) {
      throw new AciReceiptVerificationError('clock_invalid');
    }
    return {
      orgId: input.trustedTimeContext.orgId,
      deploymentId: input.trustedTimeContext.deploymentId,
      receiptId,
      workloadKeysetDigest: input.snapshot.keyset.workloadKeysetDigest,
      sessionId: input.snapshot.sessions[input.role]?.sessionId ?? '',
    };
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
