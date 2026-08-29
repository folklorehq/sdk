// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  aciSessionChannelBindingsSchema,
  aciSessionClaimsSchema,
  aciSessionIdentitySchema,
} from '@folklore/contracts';
import { AciSessionVerificationError } from './AciSessionVerificationError.js';
import type {
  AciNativeEvidenceVerificationInputV2,
  AciSessionEvidenceVerifierPort,
  VerifiedAciSessionEvidenceBindingsV2,
} from '../ports.js';

const MAX_BINDING_ITEMS = 32;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 4_096;
const MAX_STRING_LENGTH = 512;
const BARE_DIGEST = /^[0-9a-f]{64}$/;
const PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;

const verifiedBindingsSchema = z
  .object({
    sessionId: z.string().regex(BARE_DIGEST),
    claims: aciSessionClaimsSchema,
    identity: aciSessionIdentitySchema.nullable(),
    channelBindings: aciSessionChannelBindingsSchema,
    establishedAt: z.number().int().positive().safe(),
    expiresAt: z.number().int().positive().safe(),
    upstreamIdentityDigest: z.string().regex(PREFIXED_DIGEST),
    channelKeyDigest: z.string().regex(PREFIXED_DIGEST),
    evidenceTranscriptDigest: z.string().regex(PREFIXED_DIGEST),
  })
  .strict();

export class AciNativeSessionEvidenceVerifier {
  constructor(private readonly evidenceVerifier: AciSessionEvidenceVerifierPort) {}

  async verify(
    input: Omit<AciNativeEvidenceVerificationInputV2, 'expectation'> & {
      readonly expectation: Omit<
        AciNativeEvidenceVerificationInputV2['expectation'],
        'deadline' | 'signal'
      >;
    },
    deadline: number,
  ): Promise<VerifiedAciSessionEvidenceBindingsV2> {
    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) {
      throw new AciSessionVerificationError('session_evidence_verification_failed');
    }
    const controller = new AbortController();
    const timeoutError = new AciSessionVerificationError('session_evidence_verification_failed');
    let didTimeout = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        didTimeout = true;
        controller.abort(timeoutError);
        reject(timeoutError);
      }, remainingMs);
    });
    let operation: Promise<VerifiedAciSessionEvidenceBindingsV2>;
    try {
      operation = Promise.resolve(
        this.evidenceVerifier.verify({
          ...input,
          expectation: { ...input.expectation, deadline, signal: controller.signal },
        }),
      );
    } catch {
      if (timer !== undefined) clearTimeout(timer);
      throw new AciSessionVerificationError('session_evidence_verification_failed');
    }
    if (performance.now() >= deadline) {
      controller.abort(timeoutError);
      if (timer !== undefined) clearTimeout(timer);
      throw timeoutError;
    }
    try {
      const result: unknown = await Promise.race([operation, timeout]);
      if (performance.now() >= deadline) {
        controller.abort(timeoutError);
        throw timeoutError;
      }
      const normalized = normalizeStableResult(result);
      if (normalized === undefined) {
        throw new AciSessionVerificationError('native_result_malformed');
      }
      const parsed = verifiedBindingsSchema.safeParse(normalized);
      if (!parsed.success) throw new AciSessionVerificationError('native_result_malformed');
      const accepted = deepFreeze(normalized as VerifiedAciSessionEvidenceBindingsV2);
      if (performance.now() >= deadline) {
        controller.abort(timeoutError);
        throw timeoutError;
      }
      return accepted;
    } catch (error) {
      if (didTimeout) throw timeoutError;
      if (
        error instanceof AciSessionVerificationError &&
        error.code === 'native_result_malformed'
      ) {
        throw error;
      }
      throw new AciSessionVerificationError('session_evidence_verification_failed');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  }
}

function normalizeStableResult(value: unknown): unknown | undefined {
  const root: { value?: unknown } = {};
  const stack: Array<{
    readonly value: unknown;
    readonly depth: number;
    readonly assign: (normalized: unknown) => void;
  }> = [{ value, depth: 0, assign: (normalized) => (root.value = normalized) }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  try {
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      nodes += 1;
      if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) return undefined;
      const item = current.value;
      if (item === null || typeof item === 'boolean') {
        current.assign(item);
        continue;
      }
      if (typeof item === 'string') {
        if (item.length > MAX_STRING_LENGTH) return undefined;
        current.assign(item);
        continue;
      }
      if (typeof item === 'number') {
        if (!Number.isSafeInteger(item)) return undefined;
        current.assign(item);
        continue;
      }
      if (typeof item !== 'object' || seen.has(item)) return undefined;
      seen.add(item);
      const prototype = Object.getPrototypeOf(item);
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Reflect.ownKeys(descriptors).some((key) => typeof key === 'symbol')) return undefined;
      if (Array.isArray(item)) {
        if (prototype !== Array.prototype || item.length > MAX_BINDING_ITEMS) return undefined;
        const normalized: unknown[] = new Array(item.length);
        current.assign(normalized);
        const keys = Object.keys(descriptors).filter((key) => key !== 'length');
        if (keys.length !== item.length) return undefined;
        for (let index = item.length - 1; index >= 0; index -= 1) {
          const descriptor = descriptors[String(index)];
          if (descriptor === undefined || !isStableDataDescriptor(descriptor)) return undefined;
          stack.push({
            value: descriptor.value,
            depth: current.depth + 1,
            assign: (nested) => (normalized[index] = nested),
          });
        }
        continue;
      }
      if (prototype !== Object.prototype && prototype !== null) return undefined;
      const keys = Object.keys(descriptors);
      if (keys.length > MAX_BINDING_ITEMS) return undefined;
      const normalized: Record<string, unknown> = {};
      current.assign(normalized);
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (
          key.length > MAX_STRING_LENGTH ||
          descriptor === undefined ||
          !isStableDataDescriptor(descriptor)
        )
          return undefined;
        stack.push({
          value: descriptor.value,
          depth: current.depth + 1,
          assign: (nested) =>
            Object.defineProperty(normalized, key, {
              configurable: true,
              enumerable: true,
              value: nested,
              writable: true,
            }),
        });
      }
    }
  } catch {
    return undefined;
  }
  return root.value;
}

function isStableDataDescriptor(
  descriptor: PropertyDescriptor,
): descriptor is PropertyDescriptor & { readonly value: unknown } {
  return 'value' in descriptor && descriptor.get === undefined && descriptor.set === undefined;
}

function deepFreeze<T>(value: T): T {
  const stack: object[] = [];
  if (value !== null && typeof value === 'object') stack.push(value);
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || Object.isFrozen(current)) continue;
    for (const nested of Object.values(current)) {
      if (nested !== null && typeof nested === 'object') stack.push(nested);
    }
    Object.freeze(current);
  }
  return value;
}
