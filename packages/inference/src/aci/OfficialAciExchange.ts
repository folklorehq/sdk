// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import { inferenceTrustPolicyV2Schema, type InferenceTrustPolicyV2 } from '@folklore/contracts';

import type {
  AciTrustContext,
  AciChannelTransport,
  ForwardAdmissionCapability,
  ForwardLease,
  OfficialAciExchangeConfig,
  OfficialAciRequest,
  PrivateOfficialAciRequestWire,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
} from '../ports.js';
import { AciTrustStateError } from './AciTrustState.js';
import { OfficialAciExchangeError } from './OfficialAciExchangeError.js';
import {
  abortForwardAdmissionCapability,
  inspectForwardAdmissionCapability,
  releaseForwardAdmissionCapability,
} from './forward-admission-capability.js';
import { isTrustedTimeContext, readTrustedTimeSample } from './trusted-time.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_REQUEST_BYTES = 16_777_216;
const DEFAULT_MAX_RESPONSE_BYTES = 16_777_216;
const MAX_TIMEOUT_MS = 300_000;
const MAX_BODY_BYTES = 67_108_864;

export class OfficialAciExchange {
  private readonly policy: InferenceTrustPolicyV2;
  private readonly trustState: OfficialAciExchangeConfig['trustState'];
  private readonly receiptVerifier: OfficialAciExchangeConfig['receiptVerifier'];
  private readonly transport: OfficialAciExchangeConfig['transport'];
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly channelTransport: OfficialAciExchangeConfig['channelTransport'];
  private readonly testOnlyAllowUnleasedPaths: boolean;
  private readonly trustedTimeAuthority: OfficialAciExchangeConfig['trustedTimeAuthority'];
  private readonly trustedTimeContext: AciTrustContext;
  private readonly timeoutMs: number;
  private readonly maxRequestBytes: number;
  private readonly maxResponseBytes: number;

  constructor(config: OfficialAciExchangeConfig) {
    const policy = inferenceTrustPolicyV2Schema.safeParse(config.policy);
    if (!policy.success) throw new OfficialAciExchangeError('policy_invalid');
    const testOnlyAllowUnleasedPaths = config.testOnlyAllowUnleasedPaths ?? false;
    if (testOnlyAllowUnleasedPaths && process.env['NODE_ENV'] !== 'test') {
      throw new OfficialAciExchangeError('test_only_path_unavailable');
    }
    if (!testOnlyAllowUnleasedPaths && typeof config.transport?.send !== 'function') {
      throw new OfficialAciExchangeError('channel_transport_required');
    }
    if (testOnlyAllowUnleasedPaths && typeof config.channelTransport?.open !== 'function') {
      throw new OfficialAciExchangeError('channel_transport_required');
    }
    this.policy = policy.data;
    this.trustState = config.trustState;
    this.receiptVerifier = config.receiptVerifier;
    this.transport = config.transport;
    this.fetchImpl = config.fetchImpl;
    this.channelTransport = config.channelTransport;
    this.testOnlyAllowUnleasedPaths = testOnlyAllowUnleasedPaths;
    this.trustedTimeAuthority = config.trustedTimeAuthority;
    this.trustedTimeContext = config.trustedTimeContext;
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
    this.assertTestOnlyUnleasedPath();
    return this.executeTestOnly(request, decode);
  }

  async serialize(request: OfficialAciRequest): Promise<PrivateOfficialAciRequestWire> {
    this.assertTestOnlyUnleasedPath();
    const snapshot = await this.acquireSnapshot(this.trustedTimeContext);
    if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    this.validateSnapshotContext(snapshot, this.trustedTimeContext);
    const session = await this.validateTrust(snapshot, request, this.trustedTimeContext);
    return this.serializeRequest(request.body, session);
  }

  private async executeTestOnly<T>(
    request: OfficialAciRequest,
    decode: (verifiedRawResponse: Uint8Array) => T,
  ): Promise<T> {
    const snapshot = await this.acquireSnapshot(this.trustedTimeContext);
    if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    this.validateSnapshotContext(snapshot, this.trustedTimeContext);
    const session = await this.validateTrust(snapshot, request, this.trustedTimeContext);
    const requestWire = this.serializeRequest(request.body, session);
    let responseBytes: Uint8Array | undefined;
    try {
      const session = snapshot.sessions[request.role];
      if (session === undefined) throw new OfficialAciExchangeError('trust_mismatch');
      const response = await this.sendThroughTestChannel(
        request.endpoint,
        requestWire.bytes,
        snapshot,
        session,
        this.trustedTimeContext,
      );
      responseBytes = response.responseBytes;
      const receipt = await this.verifyReceipt(
        snapshot,
        request,
        requestWire.bytes,
        response,
        this.trustedTimeContext,
      );
      this.validateResponseOutcome(response.responseOk, receipt);
      return this.decodeResponse(responseBytes, receipt, decode);
    } finally {
      requestWire.bytes.fill(0);
      responseBytes?.fill(0);
    }
  }

  async executeSerialized<T>(
    request: Omit<OfficialAciRequest, 'body'>,
    lease: ForwardLease,
    capabilityOrDecode: ForwardAdmissionCapability | ((verifiedRawResponse: Uint8Array) => T),
    decode?: (verifiedRawResponse: Uint8Array) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    if (typeof capabilityOrDecode === 'function') {
      this.assertTestOnlyUnleasedPath();
      return this.executeSerializedTestOnly(request, lease, capabilityOrDecode);
    }
    if (decode === undefined) {
      await abortForwardAdmissionCapability(capabilityOrDecode, 'decode_failed');
      releaseForwardAdmissionCapability(capabilityOrDecode);
      throw new OfficialAciExchangeError('decode_failed');
    }
    const capability = capabilityOrDecode;
    let requestWire: PrivateOfficialAciRequestWire | undefined;
    let capabilityData: ReturnType<typeof inspectForwardAdmissionCapability> | undefined;
    let responseBytes: Uint8Array | undefined;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      const context = this.leaseContext(lease);
      const snapshot = await this.acquireSnapshot(context);
      if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
      this.validateSnapshotContext(snapshot, context);
      this.validateSerializedRequest(snapshot, request, lease);
      const initialTime = await this.readTrustedTime(context);
      this.validateLeaseTime(lease, snapshot, initialTime.trustedNow);
      capabilityData = this.requireCapability(capability, lease);
      requestWire = this.copyWire(capabilityData.requestWire);
      this.validateWire(requestWire, lease);
      const response = await this.send(capability, controller.signal, forwardAbort);
      responseBytes = response.responseBytes;
      const beforeReceipt = await this.readTrustedTime(context);
      this.validateLeaseTime(lease, snapshot, beforeReceipt.trustedNow);
      const receipt = await this.verifyReceipt(
        snapshot,
        request,
        requestWire.bytes,
        response,
        context,
      );
      this.validateResponseOutcome(response.responseOk, receipt);
      const beforeRelease = await this.readTrustedTime(context);
      this.validateLeaseTime(lease, snapshot, beforeRelease.trustedNow);
      return this.decodeResponse(responseBytes, receipt, decode);
    } catch (error) {
      if (error instanceof OfficialAciExchangeError) throw error;
      throw new OfficialAciExchangeError(
        capabilityData?.lease.leaseId === lease.leaseId
          ? 'receipt_verification_failed'
          : 'lease_invalid',
      );
    } finally {
      signal?.removeEventListener('abort', forwardAbort);
      requestWire?.bytes.fill(0);
      lease.privateRequestWire.bytes.fill(0);
      await abortForwardAdmissionCapability(capability, 'exchange_failed');
      responseBytes?.fill(0);
      releaseForwardAdmissionCapability(capability);
    }
  }

  private async executeSerializedTestOnly<T>(
    request: Omit<OfficialAciRequest, 'body'>,
    lease: ForwardLease,
    decode: (verifiedRawResponse: Uint8Array) => T,
  ): Promise<T> {
    const context = this.leaseContext(lease);
    const snapshot = await this.acquireSnapshot(context);
    if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    this.validateSnapshotContext(snapshot, context);
    this.validateSerializedRequest(snapshot, request, lease);
    const initialTime = await this.readTrustedTime(context);
    this.validateLeaseTime(lease, snapshot, initialTime.trustedNow);
    const wire = this.copyWire(lease.privateRequestWire);
    try {
      this.validateWire(wire, lease);
      const session = snapshot.sessions[request.role];
      if (session === undefined) throw new OfficialAciExchangeError('trust_mismatch');
      const response = await this.sendThroughTestChannel(
        request.endpoint,
        wire.bytes,
        snapshot,
        session,
        context,
      );
      const beforeReceipt = await this.readTrustedTime(context);
      this.validateLeaseTime(lease, snapshot, beforeReceipt.trustedNow);
      const receipt = await this.verifyReceipt(snapshot, request, wire.bytes, response, context);
      this.validateResponseOutcome(response.responseOk, receipt);
      const beforeRelease = await this.readTrustedTime(context);
      this.validateLeaseTime(lease, snapshot, beforeRelease.trustedNow);
      return this.decodeResponse(response.responseBytes, receipt, decode);
    } finally {
      wire.bytes.fill(0);
      lease.privateRequestWire.bytes.fill(0);
    }
  }

  private assertTestOnlyUnleasedPath(): void {
    if (!this.testOnlyAllowUnleasedPaths) throw new OfficialAciExchangeError('lease_required');
    if (this.fetchImpl === undefined || this.channelTransport === undefined) {
      throw new OfficialAciExchangeError('test_only_path_unavailable');
    }
  }

  private async sendThroughTestChannel(
    endpoint: string,
    requestBytes: Uint8Array,
    snapshot: VerifiedAciTrustSnapshot,
    session: VerifiedAciSession,
    context: AciTrustContext,
  ): Promise<{ receiptId: string; responseBytes: Uint8Array; responseOk: boolean }> {
    const channelTransport = this.channelTransport;
    if (channelTransport === undefined)
      throw new OfficialAciExchangeError('channel_transport_required');
    let channel: AciChannelTransport | undefined;
    try {
      channel = await channelTransport.open({
        endpoint,
        context,
        session,
        keyset: snapshot.keyset,
      });
      this.validateTestChannel(channel, snapshot, session);
      const response = await this.withTimeout(
        channel.send(Uint8Array.from(requestBytes)),
        () => undefined,
      );
      if (response.receiptId === '') throw new OfficialAciExchangeError('receipt_id_missing');
      if (response.responseBytes.byteLength > this.maxResponseBytes) {
        throw new OfficialAciExchangeError('response_too_large');
      }
      return response;
    } catch (error) {
      if (error instanceof OfficialAciExchangeError) throw error;
      throw new OfficialAciExchangeError('inference_fetch_failed');
    } finally {
      if (channel !== undefined) await channel.close();
    }
  }

  private validateTestChannel(
    channel: AciChannelTransport,
    snapshot: VerifiedAciTrustSnapshot,
    session: VerifiedAciSession,
  ): void {
    const pin = channel.observedChannelPin;
    const matches = (pins: readonly (typeof pin)[]) =>
      pins.some((candidate) => JSON.stringify(candidate) === JSON.stringify(pin));
    if (channel.channelKeyDigest !== session.channelKeyDigest || !matches(session.channelPins)) {
      throw new OfficialAciExchangeError('channel_binding_mismatch');
    }
  }

  private async send(
    capability: ForwardAdmissionCapability,
    signal: AbortSignal,
    onTimeout: () => void,
  ) {
    try {
      const transport = this.transport;
      if (transport === undefined) throw new OfficialAciExchangeError('channel_transport_required');
      const response = await this.withTimeout(transport.send({ capability, signal }), onTimeout);
      if (response.receiptId === '') throw new OfficialAciExchangeError('receipt_id_missing');
      if (response.responseBytes.byteLength > this.maxResponseBytes) {
        throw new OfficialAciExchangeError('response_too_large');
      }
      return response;
    } catch (error) {
      if (error instanceof OfficialAciExchangeError) throw error;
      throw new OfficialAciExchangeError('inference_fetch_failed');
    }
  }

  private async acquireSnapshot(
    context: AciTrustContext,
  ): Promise<VerifiedAciTrustSnapshot | undefined> {
    if (!isTrustedTimeContext(context)) throw new OfficialAciExchangeError('trust_unavailable');
    try {
      return await this.trustState.acquireWithTrustedTime(context);
    } catch (error) {
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
    const value = snapshot.trustContext;
    if (
      value === undefined ||
      value.orgId !== context.orgId ||
      value.deploymentId !== context.deploymentId ||
      value.bootEpoch !== context.bootEpoch ||
      value.checkpointDigest !== context.checkpointDigest
    ) {
      throw new OfficialAciExchangeError('trust_mismatch');
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
    const original = new TextEncoder().encode(requestText);
    if (original.byteLength > this.maxRequestBytes)
      throw new OfficialAciExchangeError('request_too_large');
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
    const provider = record['provider'];
    if (
      provider !== undefined &&
      (typeof provider !== 'object' || provider === null || Array.isArray(provider))
    ) {
      throw new OfficialAciExchangeError('request_malformed');
    }
    const providerRecord = (provider ?? {}) as Record<string, unknown>;
    if (Object.keys(providerRecord).some((key) => key.startsWith('aci_'))) {
      throw new OfficialAciExchangeError('trust_mismatch');
    }
    const bound = new TextEncoder().encode(
      JSON.stringify({
        ...record,
        provider: { ...providerRecord, aci_verified: true, aci_session_ids: [session.sessionId] },
      }),
    );
    if (bound.byteLength > this.maxRequestBytes)
      throw new OfficialAciExchangeError('request_too_large');
    return { bytes: bound, requestWireSha256: this.digest(bound), byteLength: bound.byteLength };
  }

  private async verifyReceipt(
    snapshot: VerifiedAciTrustSnapshot,
    request: Omit<OfficialAciRequest, 'body'> | OfficialAciRequest,
    requestBytes: Uint8Array,
    response: {
      readonly receiptId: string;
      readonly responseBytes: Uint8Array;
      readonly responseOk: boolean;
    },
    context: AciTrustContext,
  ) {
    try {
      return await this.receiptVerifier.verify({
        snapshot,
        receiptId: response.receiptId,
        requestBytes: Uint8Array.from(requestBytes),
        responseBytes: Uint8Array.from(response.responseBytes),
        role: request.role,
        endpoint: request.endpoint,
        method: request.method,
        trustedTimeContext: context,
      });
    } catch {
      throw new OfficialAciExchangeError('receipt_verification_failed');
    }
  }

  private validateResponseOutcome(
    responseOk: boolean,
    receipt: { outcome?: 'served' | 'refused'; sessionId?: string },
  ): void {
    if (receipt.outcome === 'refused') {
      if (responseOk) throw new OfficialAciExchangeError('receipt_verification_failed');
      return;
    }
    if (receipt.sessionId === undefined || !responseOk) {
      throw new OfficialAciExchangeError('receipt_verification_failed');
    }
  }

  private decodeResponse<T>(
    responseBytes: Uint8Array,
    receipt: { outcome?: 'served' | 'refused' },
    decode: (bytes: Uint8Array) => T,
  ): T {
    if (receipt.outcome === 'refused') throw new OfficialAciExchangeError('inference_refused');
    try {
      return decode(Uint8Array.from(responseBytes));
    } catch {
      throw new OfficialAciExchangeError('decode_failed');
    }
  }

  private leaseContext(lease: ForwardLease): AciTrustContext {
    return {
      orgId: lease.orgId,
      deploymentId: lease.deploymentId,
      bootEpoch: lease.bootEpoch,
      checkpointDigest: lease.trustedTimeCheckpointDigest,
    };
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
      throw new OfficialAciExchangeError('lease_invalid');
    }
  }

  private requireCapability(capability: ForwardAdmissionCapability, lease: ForwardLease) {
    try {
      const data = inspectForwardAdmissionCapability(capability);
      if (data.lease.leaseId !== lease.leaseId) throw new Error();
      return data;
    } catch {
      throw new OfficialAciExchangeError('admission_required');
    }
  }

  private validateWire(wire: PrivateOfficialAciRequestWire, lease: ForwardLease): void {
    if (
      wire.byteLength !== lease.requestWireByteLength ||
      wire.bytes.byteLength !== lease.requestWireByteLength ||
      wire.requestWireSha256 !== lease.requestWireSha256 ||
      this.digest(wire.bytes) !== lease.requestWireSha256
    ) {
      throw new OfficialAciExchangeError('request_malformed');
    }
  }

  private copyWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
    return {
      bytes: Uint8Array.from(wire.bytes),
      requestWireSha256: wire.requestWireSha256,
      byteLength: wire.byteLength,
    };
  }

  private async readTrustedTime(context: AciTrustContext): Promise<{ trustedNow: number }> {
    try {
      return await readTrustedTimeSample(this.trustedTimeAuthority, context);
    } catch {
      throw new OfficialAciExchangeError('clock_invalid');
    }
  }

  private validateLeaseTime(
    lease: ForwardLease,
    snapshot: VerifiedAciTrustSnapshot,
    now: number,
  ): void {
    const session = snapshot.sessions[lease.role];
    const times = [
      lease.proofIssuedAt,
      lease.proofExpiresAt,
      lease.snapshotExpiresAt,
      lease.admissionExpiresAt,
      lease.boundedWriteValidUntil,
    ];
    const expiries = [lease.proofExpiresAt, lease.snapshotExpiresAt, lease.admissionExpiresAt];
    if (
      times.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      expiries.some((value) => value <= lease.proofIssuedAt) ||
      lease.boundedWriteValidUntil <= lease.proofIssuedAt ||
      lease.boundedWriteValidUntil > Math.min(...expiries)
    ) {
      throw new OfficialAciExchangeError('lease_invalid');
    }
    if (
      session === undefined ||
      lease.snapshotExpiresAt > snapshot.expiresAt ||
      now >= lease.proofExpiresAt ||
      now >= lease.snapshotExpiresAt ||
      now >= lease.admissionExpiresAt ||
      now >= lease.boundedWriteValidUntil ||
      now >= snapshot.expiresAt ||
      now >= snapshot.keyset.notAfter ||
      now >= session.expiresAt ||
      lease.proofIssuedAt > now ||
      session.establishedAt > now + this.policy.clockSkewSeconds
    ) {
      throw new OfficialAciExchangeError('trust_expired');
    }
  }

  private digest(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }

  private async withTimeout<T>(operation: Promise<T>, onTimeout: () => void): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            onTimeout();
            reject(new OfficialAciExchangeError('inference_timeout'));
          }, this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
