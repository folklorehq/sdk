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

/** Content-free `error_type` for the logging boundary, or null when it cannot be represented. */
export function contentFreeErrorType(error: unknown): string | null {
  // A plain Error's name is capitalized ('Error', 'PostgresError', 'TimeoutError') and the
  // code-value filter accepts only lower-case tokens, so passing `error.name` through as
  // `error_type` made PinoLogger replace the entire record with `log_record_rejected` and the
  // failure logged nothing at all. Lower-casing keeps the class name; null is returned when even
  // that cannot be represented, because the boundary accepts a null field but rejects a bad one,
  // and a rejected value costs every other field on the record.
  const candidate = (error instanceof Error ? error.name : typeof error).toLowerCase();
  return candidate.length <= MAX_VALUE_LENGTH && SAFE_LOG_EVENT_PATTERN.test(candidate)
    ? candidate
    : null;
}

/** Internal text (a request path, a schema path) as a code-field token, or null when none survives. */
export function contentFreeLogCode(value: string): string | null {
  // Code fields accept only `/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/`, and one refused field costs the
  // whole record, so the identifiers that place a failure needed a form that fits: a request path
  // (`/v1/placement/activation`) and a schema path whose first segment is a digit (`7z`) do not.
  const lowered = value.toLowerCase();
  // Already representable text keeps its own spelling: normalizing `organization_slug_invalid` into
  // `organization.slug.invalid` would invent a code no operator can grep for in the enum it came from.
  if (lowered.length <= MAX_VALUE_LENGTH && SAFE_LOG_EVENT_PATTERN.test(lowered)) return lowered;
  const segments = lowered.split(/[^a-z0-9]+/).filter((segment) => segment.length > 0);
  const first = segments.at(0);
  if (first === undefined) return null;
  // Only the first segment must start with a letter, so only it can need the `p` prefix; digits
  // elsewhere (an array index such as `items.0.name`) already satisfy the pattern.
  const code = `${/^[a-z]/.test(first) ? first : `p${first}`}.${segments.slice(1).join('.')}`;
  // Truncation can land mid-separator; a trailing separator is exactly what the pattern refuses.
  const bounded = code.slice(0, MAX_VALUE_LENGTH).replace(/[._]+$/, '');
  return bounded.length === 0 ? null : bounded;
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
  if (key === 'orgId' || key === 'messageId' || key === 'accountId' || key === 'derivedAccountId')
    return SAFE_DISTINCT_ID_PATTERN.test(value);
  if (key === 'model') return SAFE_LOG_MODEL_PATTERN.test(value);
  return false;
}

export class ContentFreeViolationError extends Error {}

export function assertContentFree(event: string, properties: Record<string, unknown>): void {
  const violation = checkContentFree(event, properties);
  if (violation) throw new ContentFreeViolationError(violation);
}
