// SPDX-License-Identifier: Apache-2.0
import { SAFE_LOG_FIELDS, type SafeLogContext, type SafeLogField } from './ports.js';

const FORBIDDEN_KEY_SUBSTRINGS = [
  'message',
  'body',
  'content',
  'text',
  'title',
  'summary',
  'description',
  'query',
  'prompt',
  'email',
  'stack',
  'secret',
  'token',
  'password',
  'plaintext',
  'snippet',
  'excerpt',
] as const;

const EXACT_FORBIDDEN_KEYS = new Set(['name']);
const MAX_VALUE_LENGTH = 256;
const MAX_LOG_EVENT_LENGTH = 96;
const MAX_LOG_FIELD_LENGTH = 64;
const SAFE_LOG_EVENT_PATTERN = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/;
const SAFE_DISTINCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_LOG_REQUEST_ID_PATTERN =
  /^(?:[a-z][a-z0-9]{0,31}_[a-z0-9]{1,95}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const SAFE_LOG_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SAFE_LOG_FIELD_SET = new Set<string>(SAFE_LOG_FIELDS);
const EXPLICIT_CONTENT_FREE_FIELDS = new Set(['messageid', 'prompttokens', 'completiontokens']);
const CODE_VALUE_FIELDS = new Set([
  'component',
  'errorCode',
  'error_type',
  'outcome',
  'operation',
  'phase',
  'route',
  'status',
]);

export type SafeLogRejectionReason =
  | 'invalid_event_type'
  | 'invalid_event_code'
  | 'invalid_context_shape'
  | 'invalid_context_key'
  | 'invalid_context_value';

export type SafeLogContextSnapshot =
  | { context: SafeLogContext; rejection: null }
  | { context: null; rejection: SafeLogRejectionReason };

function matchesForbidden(normalizedKey: string): boolean {
  return FORBIDDEN_KEY_SUBSTRINGS.some((substring) => normalizedKey.includes(substring));
}

function isShortPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  return typeof value === 'string' && value.length <= MAX_VALUE_LENGTH;
}

export function checkContentFree(
  event: string,
  properties: Record<string, unknown>,
): string | null {
  for (const [key, value] of Object.entries(properties)) {
    const normalized = key.toLowerCase();
    if (EXACT_FORBIDDEN_KEYS.has(normalized) || matchesForbidden(normalized)) {
      return `field "${key}" on "${event}" is content-bearing`;
    }
    if (!isShortPrimitive(value)) {
      return `field "${key}" on "${event}" is not a short primitive`;
    }
  }
  return null;
}

export function checkDistinctId(distinctId: unknown): string | null {
  if (typeof distinctId !== 'string') return 'distinctId is not a string';
  if (distinctId.length > MAX_VALUE_LENGTH) return 'distinctId exceeds the max length';
  if (distinctId.includes('@')) return 'distinctId looks like an email, not an id';
  if (distinctId === 'system' || SAFE_DISTINCT_ID_PATTERN.test(distinctId)) return null;
  return 'distinctId is not an approved identity';
}

/** Returns a closed reason code when an event cannot cross the logging boundary. */
export function checkSafeLogEvent(event: unknown): SafeLogRejectionReason | null {
  if (typeof event !== 'string') return 'invalid_event_type';
  if (event.length > MAX_LOG_EVENT_LENGTH || !SAFE_LOG_EVENT_PATTERN.test(event)) {
    return 'invalid_event_code';
  }
  return null;
}

/** Returns a closed reason code when context cannot cross the logging boundary. */
export function checkSafeLogContext(context: unknown): SafeLogRejectionReason | null {
  return snapshotSafeLogContext(context).rejection;
}

/** Copies only validated own data-descriptor values into a frozen logging context. */
export function snapshotSafeLogContext(context: unknown): SafeLogContextSnapshot {
  try {
    if (!isPlainRecord(context)) return rejectedContext('invalid_context_shape');

    const snapshot: Partial<Record<SafeLogField, string | number | boolean | null>> = {};
    for (const key of Reflect.ownKeys(context)) {
      if (typeof key !== 'string') return rejectedContext('invalid_context_key');
      const normalizedKey = key.toLowerCase();
      const descriptor = Object.getOwnPropertyDescriptor(context, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        return rejectedContext('invalid_context_shape');
      }
      if (
        key.length > MAX_LOG_FIELD_LENGTH ||
        !SAFE_LOG_FIELD_SET.has(key) ||
        EXACT_FORBIDDEN_KEYS.has(normalizedKey) ||
        (matchesForbidden(normalizedKey) && !EXPLICIT_CONTENT_FREE_FIELDS.has(normalizedKey))
      ) {
        return rejectedContext('invalid_context_key');
      }
      if (!isSafeLogValue(key, descriptor.value)) {
        return rejectedContext('invalid_context_value');
      }
      Object.defineProperty(snapshot, key, {
        configurable: false,
        enumerable: true,
        value: descriptor.value,
        writable: false,
      });
    }

    return { context: Object.freeze(snapshot), rejection: null };
  } catch {
    return rejectedContext('invalid_context_shape');
  }
}

function rejectedContext(rejection: SafeLogRejectionReason): SafeLogContextSnapshot {
  return { context: null, rejection };
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeLogValue(key: string, value: unknown): boolean {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) return false;
  if (CODE_VALUE_FIELDS.has(key)) return SAFE_LOG_EVENT_PATTERN.test(value);
  if (key === 'requestId') return SAFE_LOG_REQUEST_ID_PATTERN.test(value);
  if (key === 'orgId' || key === 'messageId') return SAFE_DISTINCT_ID_PATTERN.test(value);
  if (key === 'model') return SAFE_LOG_MODEL_PATTERN.test(value);
  return false;
}

export class ContentFreeViolationError extends Error {}

export function assertContentFree(event: string, properties: Record<string, unknown>): void {
  const violation = checkContentFree(event, properties);
  if (violation) throw new ContentFreeViolationError(violation);
}
