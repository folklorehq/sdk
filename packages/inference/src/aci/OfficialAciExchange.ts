// SPDX-License-Identifier: Apache-2.0
import { inferenceTrustPolicyV2Schema, type InferenceTrustPolicyV2 } from '@folklore/contracts';

import type {
  OfficialAciExchangeConfig,
  OfficialAciRequest,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
} from '../ports.js';
import { OfficialAciExchangeError } from './OfficialAciExchangeError.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_REQUEST_BYTES = 16_777_216;
const DEFAULT_MAX_RESPONSE_BYTES = 16_777_216;
const MAX_TIMEOUT_MS = 300_000;
const MAX_BODY_BYTES = 67_108_864;
const RECEIPT_ID_HEADER = 'x-receipt-id';

export class OfficialAciExchange {
  private readonly baseUrl: string;
  private readonly policy: InferenceTrustPolicyV2;
  private readonly trustState: OfficialAciExchangeConfig['trustState'];
  private readonly receiptVerifier: OfficialAciExchangeConfig['receiptVerifier'];
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string | undefined;
  private readonly clock: () => number;
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
    this.clock = config.clock ?? (() => Math.floor(Date.now() / 1_000));
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
    const snapshot = this.trustState.acquire();
    if (snapshot === undefined) throw new OfficialAciExchangeError('trust_unavailable');
    const session = this.validateTrust(snapshot, request);
    const { requestText, requestBytes } = this.serializeRequest(request.body, session);
    const { receiptId, responseBytes } = await this.fetchInference(request, requestText);
    try {
      await this.receiptVerifier.verify({
        snapshot,
        receiptId,
        requestBytes: Uint8Array.from(requestBytes),
        responseBytes: Uint8Array.from(responseBytes),
        role: request.role,
        endpoint: request.endpoint,
        method: request.method,
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

  private validateTrust(
    snapshot: VerifiedAciTrustSnapshot,
    request: OfficialAciRequest,
  ): VerifiedAciSession {
    const session = snapshot.sessions[request.role];
    const model = this.policy.roleModels[request.role];
    if (
      session === undefined ||
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
    let now: number;
    try {
      now = this.clock();
    } catch {
      throw new OfficialAciExchangeError('clock_invalid');
    }
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new OfficialAciExchangeError('clock_invalid');
    }
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
  ): { requestText: string; requestBytes: Uint8Array } {
    let requestText: string | undefined;
    try {
      requestText = JSON.stringify(body);
    } catch {
      throw new OfficialAciExchangeError('request_malformed');
    }
    if (requestText === undefined) throw new OfficialAciExchangeError('request_malformed');
    const requestBytes = new TextEncoder().encode(requestText);
    if (requestBytes.byteLength > this.maxRequestBytes) {
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
    return { requestText, requestBytes };
  }

  private async fetchInference(
    request: OfficialAciRequest,
    body: string,
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
    request: OfficialAciRequest,
    body: string,
    signal: AbortSignal,
  ): Promise<{ receiptId: string; responseBytes: Uint8Array }> {
    const response = await this.fetchImpl(new URL(request.endpoint, this.baseUrl), {
      method: request.method,
      headers: this.headers(),
      body,
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
}
