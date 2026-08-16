// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import { inferenceTrustPolicyV2Schema, type InferenceTrustPolicyV2 } from '@folklore/contracts';

import type {
  OfficialAciExchangeConfig,
  OfficialAciRequest,
  ForwardLease,
  AciTrustContext,
  OfficialAciRequestWireSerializerPort,
  PrivateOfficialAciRequestWire,
  TrustedTimeSample,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
} from '../ports.js';
import { AciTrustStateError } from './AciTrustState.js';
import { OfficialAciExchangeError } from './OfficialAciExchangeError.js';
import { isTrustedTimeContext, readTrustedTimeSample } from './trusted-time.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_REQUEST_BYTES = 16_777_216;
const DEFAULT_MAX_RESPONSE_BYTES = 16_777_216;
const MAX_TIMEOUT_MS = 300_000;
const MAX_BODY_BYTES = 67_108_864;
const RECEIPT_ID_HEADER = 'x-receipt-id';

export class OfficialAciExchange implements OfficialAciRequestWireSerializerPort {
  private readonly baseUrl: string;
  private readonly policy: InferenceTrustPolicyV2;
  private readonly trustState: OfficialAciExchangeConfig['trustState'];
  private readonly receiptVerifier: OfficialAciExchangeConfig['receiptVerifier'];
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string | undefined;
  private readonly trustedTimeAuthority: OfficialAciExchangeConfig['trustedTimeAuthority'];
  private readonly trustedTimeContext: AciTrustContext;
  private readonly leaseStore: OfficialAciExchangeConfig['leaseStore'];
  private readonly timeoutMs: number;
  private readonly maxRequestBytes: number;
  private readonly maxResponseBytes: number;

  constructor(config: OfficialAciExchangeConfig) {
    const policy = inferenceTrustPolicyV2Schema.safeParse(config.policy);
    if (!policy.success) throw new OfficialAciExchangeError('policy_invalid');
    this.policy = policy.data;
    this.baseUrl = this.validateBaseUrl(config.baseUrl);
    this.trustState = config.trustState;
    this.receiptVerifier = config.receiptVerifier;
    this.fetchImpl = config.fetchImpl;
    this.apiKey = config.apiKey;
    this.trustedTimeAuthority = config.trustedTimeAuthority;
    this.trustedTimeContext = config.trustedTimeContext;
    this.leaseStore = config.leaseStore;
    this.timeoutMs = this.boundedInteger(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    this.maxRequestBytes = this.boundedInteger(
      config.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES,
      MAX_BODY_BYTES,
    );
    this.maxResponseBytes = this.boundedInteger(
      config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      MAX_BODY_BYTES,
    );
  }

  async execute<T>(
    request: OfficialAciRequest,
    decode: (verifiedRawResponse: Uint8Array) => T,
  ): Promise<T> {
    const snapshot = await this.acquireSnapshot(this.trustedTimeContext);
    if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    this.validateSnapshotContext(snapshot, this.trustedTimeContext);
    const session = await this.validateTrust(snapshot, request, this.trustedTimeContext);
    const requestWire = this.serializeRequest(request.body, session);
    const { receiptId, responseBytes } = await this.fetchInference(
      request,
      new TextDecoder().decode(requestWire.bytes),
    );
    try {
      await this.receiptVerifier.verify({
        snapshot,
        receiptId,
        requestBytes: Uint8Array.from(requestWire.bytes),
        responseBytes: Uint8Array.from(responseBytes),
        role: request.role,
        endpoint: request.endpoint,
        method: request.method,
        trustedTimeContext: this.trustedTimeContext,
      });
    } catch {
      throw new OfficialAciExchangeError('receipt_verification_failed');
    }
    try {
      return decode(Uint8Array.from(responseBytes));
    } catch {
      throw new OfficialAciExchangeError('decode_failed');
    }
  }

  async serialize(request: OfficialAciRequest): Promise<PrivateOfficialAciRequestWire> {
    const snapshot = await this.acquireSnapshot(this.trustedTimeContext);
    if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    this.validateSnapshotContext(snapshot, this.trustedTimeContext);
    const session = await this.validateTrust(snapshot, request, this.trustedTimeContext);
    return this.serializeRequest(request.body, session);
  }

  async executeSerialized<T>(
    request: Omit<OfficialAciRequest, 'body'>,
    lease: ForwardLease,
    decode: (verifiedRawResponse: Uint8Array) => T,
  ): Promise<T> {
    if (this.leaseStore === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    const trustContext = this.leaseTimeContext(lease);
    const snapshot = await this.acquireSnapshot(trustContext);
    if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    this.validateSnapshotContext(snapshot, trustContext);
    this.validateSerializedRequest(snapshot, request, lease);
    const initialTime = await this.readTrustedTime(trustContext);
    this.validateLeaseTime(lease, snapshot, request.role, initialTime);
    const requestWire = this.copyRequestWire(lease.privateRequestWire);
    this.validateRequestWire(requestWire, lease);
    const beforeWrite = await this.readTrustedTime(trustContext);
    this.validateLeaseTime(lease, snapshot, request.role, beforeWrite);
    this.validateRequestWire(requestWire, lease);
    try {
      await this.leaseStore.consume({ lease, candidateRequestWire: requestWire });
    } catch {
      throw new OfficialAciExchangeError('trust_mismatch');
    }
    try {
      const afterConsume = await this.readTrustedTime(trustContext);
      this.validateLeaseTime(lease, snapshot, request.role, afterConsume);
    } catch (error) {
      requestWire.bytes.fill(0);
      throw error;
    } finally {
      lease.privateRequestWire.bytes.fill(0);
    }
    let responseBytes: Uint8Array | undefined;
    try {
      const response = await this.fetchInference(request, requestWire.bytes);
      responseBytes = response.responseBytes;
      const { receiptId } = response;
      try {
        const beforeReceipt = await this.readTrustedTime(trustContext);
        this.validateLeaseTime(lease, snapshot, request.role, beforeReceipt);
        await this.receiptVerifier.verify({
          snapshot,
          receiptId,
          requestBytes: Uint8Array.from(requestWire.bytes),
          responseBytes: Uint8Array.from(responseBytes),
          role: request.role,
          endpoint: request.endpoint,
          method: request.method,
          trustedTimeContext: trustContext,
        });
      } catch (error) {
        if (error instanceof OfficialAciExchangeError) throw error;
        throw new OfficialAciExchangeError('receipt_verification_failed');
      }
      const beforeRelease = await this.readTrustedTime(trustContext);
      this.validateLeaseTime(lease, snapshot, request.role, beforeRelease);
      try {
        return decode(Uint8Array.from(responseBytes));
      } catch {
        throw new OfficialAciExchangeError('decode_failed');
      }
    } finally {
      requestWire.bytes.fill(0);
      responseBytes?.fill(0);
    }
  }

  private async acquireSnapshot(
    context: AciTrustContext,
  ): Promise<VerifiedAciTrustSnapshot | undefined> {
    if (!isTrustedTimeContext(context)) {
      throw new OfficialAciExchangeError('trust_unavailable');
    }
    if (typeof this.trustState.acquireWithTrustedTime !== 'function') {
      throw new OfficialAciExchangeError('trust_unavailable');
    }
    try {
      return await this.trustState.acquireWithTrustedTime(context);
    } catch (error) {
      if (error instanceof OfficialAciExchangeError) throw error;
      if (error instanceof AciTrustStateError && error.code === 'context_mismatch') {
        throw new OfficialAciExchangeError('trust_mismatch');
      }
      throw new OfficialAciExchangeError('clock_invalid');
    }
  }

  private validateSnapshotContext(
    snapshot: VerifiedAciTrustSnapshot,
    context: AciTrustContext,
  ): void {
    const snapshotContext = snapshot.trustContext;
    if (
      snapshotContext === undefined ||
      snapshotContext.orgId !== context.orgId ||
      snapshotContext.deploymentId !== context.deploymentId ||
      snapshotContext.bootEpoch !== context.bootEpoch ||
      snapshotContext.checkpointDigest !== context.checkpointDigest
    ) {
      throw new OfficialAciExchangeError('trust_mismatch');
    }
  }

  private validateBaseUrl(value: string): string {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username !== '' ||
        url.password !== '' ||
        url.pathname !== '/' ||
        url.search !== '' ||
        url.hash !== '' ||
        url.origin !== this.policy.origin
      ) {
        throw new Error();
      }
      return url.origin;
    } catch {
      throw new OfficialAciExchangeError('policy_invalid');
    }
  }

  private boundedInteger(value: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
      throw new OfficialAciExchangeError('policy_invalid');
    }
    return value;
  }

  private async validateTrust(
    snapshot: VerifiedAciTrustSnapshot,
    request: OfficialAciRequest,
    context: AciTrustContext,
  ): Promise<VerifiedAciSession> {
    const session = snapshot.sessions[request.role];
    const model = this.policy.roleModels[request.role];
    if (
      session === undefined ||
      model === undefined ||
      snapshot.policyGeneration !== this.policy.generation ||
      session.role !== request.role ||
      session.model !== model.model ||
      session.modelRevision !== model.revision
    ) {
      throw new OfficialAciExchangeError('trust_mismatch');
    }
    if (request.endpoint !== this.policy.route || request.method !== 'POST') {
      throw new OfficialAciExchangeError('endpoint_mismatch');
    }
    const now = (await this.readTrustedTime(context)).trustedNow;
    if (
      snapshot.expiresAt <= now ||
      snapshot.keyset.notAfter <= now ||
      session.expiresAt <= now ||
      session.establishedAt > now + this.policy.clockSkewSeconds
    ) {
      throw new OfficialAciExchangeError('trust_expired');
    }
    return session;
  }

  private serializeRequest(
    body: unknown,
    session: VerifiedAciSession,
  ): PrivateOfficialAciRequestWire {
    let requestText: string | undefined;
    try {
      requestText = JSON.stringify(body);
    } catch {
      throw new OfficialAciExchangeError('request_malformed');
    }
    if (requestText === undefined) throw new OfficialAciExchangeError('request_malformed');
    if (new TextEncoder().encode(requestText).byteLength > this.maxRequestBytes) {
      throw new OfficialAciExchangeError('request_too_large');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(requestText) as unknown;
    } catch {
      throw new OfficialAciExchangeError('request_malformed');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new OfficialAciExchangeError('request_malformed');
    }
    const record = parsed as Record<string, unknown>;
    if (record['model'] !== session.model) throw new OfficialAciExchangeError('model_mismatch');
    if (record['stream'] === true) throw new OfficialAciExchangeError('streaming_unsupported');
    const provider = this.bindOfficialProviderControls(record['provider'], session);
    const boundRequestBytes = new TextEncoder().encode(JSON.stringify({ ...record, provider }));
    if (boundRequestBytes.byteLength > this.maxRequestBytes) {
      throw new OfficialAciExchangeError('request_too_large');
    }
    return {
      bytes: boundRequestBytes,
      requestWireSha256: this.digest(boundRequestBytes),
      byteLength: boundRequestBytes.byteLength,
    };
  }

  private bindOfficialProviderControls(
    value: unknown,
    session: VerifiedAciSession,
  ): Record<string, unknown> {
    if (
      value !== undefined &&
      (typeof value !== 'object' || value === null || Array.isArray(value))
    ) {
      throw new OfficialAciExchangeError('request_malformed');
    }
    const provider = (value ?? {}) as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(provider, 'aci_verified') ||
      Object.prototype.hasOwnProperty.call(provider, 'aci_session_ids')
    ) {
      throw new OfficialAciExchangeError('trust_mismatch');
    }
    return {
      ...provider,
      aci_verified: true,
      aci_session_ids: [session.sessionId],
    };
  }

  private async fetchInference(
    request: Omit<OfficialAciRequest, 'body'> | OfficialAciRequest,
    body: string | Uint8Array,
  ): Promise<{ receiptId: string; responseBytes: Uint8Array }> {
    const controller = new AbortController();
    try {
      return await this.withTimeout(this.performFetch(request, body, controller.signal), () =>
        controller.abort(),
      );
    } catch (error) {
      if (error instanceof OfficialAciExchangeError) throw error;
      throw new OfficialAciExchangeError('inference_fetch_failed');
    }
  }

  private async performFetch(
    request: Omit<OfficialAciRequest, 'body'> | OfficialAciRequest,
    body: string | Uint8Array,
    signal: AbortSignal,
  ): Promise<{ receiptId: string; responseBytes: Uint8Array }> {
    const response = await this.fetchImpl(new URL(request.endpoint, this.baseUrl), {
      method: request.method,
      headers: this.headers(),
      body: typeof body === 'string' ? body : Buffer.from(body),
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new OfficialAciExchangeError('inference_fetch_failed');
    this.validateFinalOrigin(response);
    const receiptId = response.headers.get(RECEIPT_ID_HEADER);
    if (receiptId === null || receiptId === '') {
      throw new OfficialAciExchangeError('receipt_id_missing');
    }
    return { receiptId, responseBytes: await this.readBoundedBody(response) };
  }

  private validateFinalOrigin(response: Response): void {
    try {
      if (new URL(response.url).origin !== this.baseUrl) throw new Error();
    } catch {
      throw new OfficialAciExchangeError('inference_fetch_failed');
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-upstream-verification': 'required',
    };
    if (this.apiKey !== undefined && this.apiKey !== '') {
      headers['authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async readBoundedBody(response: Response): Promise<Uint8Array> {
    const declaredLength = response.headers.get('content-length');
    if (
      declaredLength !== null &&
      /^\d+$/.test(declaredLength) &&
      Number(declaredLength) > this.maxResponseBytes
    ) {
      throw new OfficialAciExchangeError('response_too_large');
    }
    if (response.body === null) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > this.maxResponseBytes) {
          await this.cancelReader(reader);
          throw new OfficialAciExchangeError('response_too_large');
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
        reject(new OfficialAciExchangeError('inference_timeout'));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private validateSerializedRequest(
    snapshot: VerifiedAciTrustSnapshot,
    request: Omit<OfficialAciRequest, 'body'>,
    lease: ForwardLease,
  ): void {
    const session = snapshot.sessions[request.role];
    if (
      session === undefined ||
      request.method !== 'POST' ||
      request.endpoint !== lease.route ||
      lease.origin !== this.policy.origin ||
      lease.route !== this.policy.route ||
      lease.method !== 'POST' ||
      lease.role !== request.role ||
      lease.policyGeneration !== snapshot.policyGeneration ||
      lease.activationGeneration !== snapshot.activationGeneration ||
      lease.sessionId !== session.sessionId ||
      lease.model !== session.model ||
      lease.modelRevision !== session.modelRevision ||
      lease.workloadKeysetDigest !== snapshot.keyset.workloadKeysetDigest ||
      lease.channelKeyDigest !== session.channelKeyDigest ||
      lease.workloadId !== snapshot.keyset.workloadId
    ) {
      throw new OfficialAciExchangeError('trust_mismatch');
    }
  }

  private validateLeaseTime(
    lease: ForwardLease,
    snapshot: VerifiedAciTrustSnapshot,
    role: ForwardLease['role'],
    sample: TrustedTimeSample,
  ): void {
    this.validateLeaseTimes(lease);
    const session = snapshot.sessions[role];
    if (
      session === undefined ||
      lease.snapshotExpiresAt > snapshot.expiresAt ||
      sample.trustedNow >= lease.proofExpiresAt ||
      sample.trustedNow >= lease.snapshotExpiresAt ||
      sample.trustedNow >= lease.admissionExpiresAt ||
      sample.trustedNow >= lease.boundedWriteValidUntil ||
      sample.trustedNow >= snapshot.expiresAt ||
      sample.trustedNow >= snapshot.keyset.notAfter ||
      sample.trustedNow >= session.expiresAt ||
      lease.proofIssuedAt > sample.trustedNow ||
      session.establishedAt > sample.trustedNow + this.policy.clockSkewSeconds
    ) {
      throw new OfficialAciExchangeError('trust_expired');
    }
  }

  private validateLeaseTimes(lease: ForwardLease): void {
    const values = [
      lease.proofIssuedAt,
      lease.proofExpiresAt,
      lease.snapshotExpiresAt,
      lease.admissionExpiresAt,
      lease.boundedWriteValidUntil,
    ];
    const expiries = [lease.proofExpiresAt, lease.snapshotExpiresAt, lease.admissionExpiresAt];
    if (
      values.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      expiries.some((value) => value <= lease.proofIssuedAt) ||
      lease.boundedWriteValidUntil <= lease.proofIssuedAt ||
      lease.boundedWriteValidUntil > Math.min(...expiries)
    ) {
      throw new OfficialAciExchangeError('trust_mismatch');
    }
  }

  private leaseTimeContext(lease: ForwardLease): AciTrustContext {
    return {
      orgId: lease.orgId,
      deploymentId: lease.deploymentId,
      bootEpoch: lease.bootEpoch,
      checkpointDigest: lease.trustedTimeCheckpointDigest,
    };
  }

  private validateRequestWire(wire: PrivateOfficialAciRequestWire, lease: ForwardLease): void {
    if (
      wire.byteLength !== lease.requestWireByteLength ||
      wire.bytes.byteLength !== lease.requestWireByteLength ||
      wire.requestWireSha256 !== lease.requestWireSha256 ||
      this.digest(wire.bytes) !== lease.requestWireSha256
    ) {
      throw new OfficialAciExchangeError('request_malformed');
    }
  }

  private copyRequestWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
    return {
      bytes: Uint8Array.from(wire.bytes),
      requestWireSha256: wire.requestWireSha256,
      byteLength: wire.byteLength,
    };
  }

  private async readTrustedTime(context: AciTrustContext): Promise<TrustedTimeSample> {
    if (this.trustedTimeAuthority === undefined) {
      throw new OfficialAciExchangeError('clock_invalid');
    }
    if (!isTrustedTimeContext(context)) {
      throw new OfficialAciExchangeError('clock_invalid');
    }
    try {
      return await readTrustedTimeSample(this.trustedTimeAuthority, context);
    } catch {
      throw new OfficialAciExchangeError('clock_invalid');
    }
  }

  private digest(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
