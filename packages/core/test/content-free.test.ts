// SPDX-License-Identifier: Apache-2.0
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  checkSafeLogContext,
  contentFreeErrorType,
  SAFE_LOG_FIELDS,
  type SafeLogContext,
  type SafeLogField,
} from '../src/index.js';

describe('checkSafeLogContext', () => {
  it('keeps the runtime and type-level safe field catalogs aligned', () => {
    expectTypeOf<(typeof SAFE_LOG_FIELDS)[number]>().toEqualTypeOf<SafeLogField>();
  });

  it('exposes an immutable safe field catalog', () => {
    expect(Object.isFrozen(SAFE_LOG_FIELDS)).toBe(true);
  });

  it('accepts a server-generated canonical UUID request ID', () => {
    expect(checkSafeLogContext({ requestId: '11111111-1111-4111-8111-111111111111' })).toBeNull();
  });

  it('rejects an unbounded request ID', () => {
    expect(checkSafeLogContext({ requestId: 'customer content must not be logged' })).toBe(
      'invalid_context_value',
    );
  });

  it('rejects version fields so callers cannot log external release strings', () => {
    type VersionIsExcluded = 'version' extends SafeLogField ? false : true;
    const versionIsExcluded: VersionIsExcluded = true;
    expect(versionIsExcluded).toBe(true);

    const unsafeContext = {
      // @ts-expect-error version is not permitted at the logging boundary.
      version: 'CUSTOMER_CONTENT_MUST_NOT_BE_LOGGED',
    } satisfies SafeLogContext;
    expect(unsafeContext.version).toBe('CUSTOMER_CONTENT_MUST_NOT_BE_LOGGED');
    expect(checkSafeLogContext({ version: 'CUSTOMER_CONTENT_MUST_NOT_BE_LOGGED' })).toBe(
      'invalid_context_key',
    );
  });

  it('accepts bounded operational generation signals', () => {
    expect(checkSafeLogContext({ generation: 3 })).toBeNull();
  });
});

describe('account id fields are distinct ids, not free text', () => {
  // The deterministic account id is a UUID v8 (deriveUuidV8FromDigest). An earlier version of this
  // logged it as `requestId`, whose pattern only admits versions 1-5, so the logger dropped the
  // whole record and the diagnostic produced nothing in prod. The v4 literal below passed that
  // broken code, which is exactly why the version digit has to be covered explicitly.
  const V8 = 'e9c8b865-732c-86c3-a6f1-445be5daa8c3';
  const V4 = '3d8d50c9-9439-402f-b997-ce22ee81b035';

  it('accepts both a random v4 and a derived v8 account id', () => {
    expect(checkSafeLogContext({ accountId: V4 })).toBeNull();
    expect(checkSafeLogContext({ accountId: V8 })).toBeNull();
    expect(checkSafeLogContext({ derivedAccountId: V8 })).toBeNull();
    expect(checkSafeLogContext({ accountId: V4, derivedAccountId: V8 })).toBeNull();
  });

  it('rejects anything that could carry an identity', () => {
    for (const value of ['nate@folklorehq.com', 'not-a-uuid', '']) {
      expect(checkSafeLogContext({ accountId: value })).not.toBeNull();
      expect(checkSafeLogContext({ derivedAccountId: value })).not.toBeNull();
    }
  });

  it('does not accept a derived v8 id in requestId, which cannot represent one', () => {
    expect(checkSafeLogContext({ requestId: V8 })).not.toBeNull();
  });
});

describe('contentFreeErrorType', () => {
  // An Error's `name` is capitalized, and the boundary's code-value filter only admits lower-case
  // tokens. Passing `error.name` through as `error_type` made PinoLogger replace the whole record
  // with log_record_rejected, so the failure logged nothing at all (see SharedPoolReconciler).
  it('lower-cases error class names into accepted codes', () => {
    expect(contentFreeErrorType(new Error('boom'))).toBe('error');
    expect(contentFreeErrorType(new TypeError('boom'))).toBe('typeerror');
    const named = new Error('boom');
    named.name = 'PostgresError';
    expect(contentFreeErrorType(named)).toBe('postgreserror');
    expect(checkSafeLogContext({ error_type: contentFreeErrorType(named) })).toBeNull();
  });

  it('describes a non-Error throw by its type', () => {
    expect(contentFreeErrorType('nope')).toBe('string');
    expect(contentFreeErrorType(undefined)).toBe('undefined');
    expect(checkSafeLogContext({ error_type: contentFreeErrorType('nope') })).toBeNull();
  });

  it('returns null rather than a value the boundary would reject', () => {
    // null is an accepted field value; an invalid one costs every other field on the record.
    const named = new Error('boom');
    named.name = 'Weird Error: class';
    const code = contentFreeErrorType(named);
    expect(code).toBeNull();
    expect(checkSafeLogContext({ error_type: code })).toBeNull();
  });
});
