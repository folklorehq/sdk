// SPDX-License-Identifier: Apache-2.0
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  checkSafeLogContext,
  contentFreeErrorType,
  contentFreeLogCode,
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

describe('contentFreeLogCode', () => {
  // A code field accepts only `[a-z][a-z0-9]*(.[a-z0-9]+)*`, and one refused field costs the whole
  // record (requestId included). The two identifiers that place a failure are exactly the ones that
  // did not fit: a request path (slashes) and a schema path whose first segment is a digit.
  it('is not satisfied by the raw identifiers it exists for', () => {
    expect(checkSafeLogContext({ route: '/v1/placement/activation' })).toBe(
      'invalid_context_value',
    );
    expect(checkSafeLogContext({ route: '/.well-known/jwks.json' })).toBe('invalid_context_value');
    expect(checkSafeLogContext({ errorCode: '7z' })).toBe('invalid_context_value');
  });

  it('turns a request path into a token the boundary accepts', () => {
    expect(contentFreeLogCode('/v1/placement/activation')).toBe('v1.placement.activation');
    expect(contentFreeLogCode('/.well-known/jwks.json')).toBe('well.known.jwks.json');
    expect(contentFreeLogCode('/throw/:kind')).toBe('throw.kind');
    for (const route of ['/v1/placement/activation', '/.well-known/jwks.json', '/throw/:kind']) {
      expect(checkSafeLogContext({ route: contentFreeLogCode(route) })).toBeNull();
    }
  });

  it('keeps a code that was already representable, spelled as its own enum spells it', () => {
    // Normalizing `organization_slug_invalid` to `organization.slug.invalid` would invent a code no
    // operator can grep for next to the enum it came from.
    expect(contentFreeLogCode('organization_slug_invalid')).toBe('organization_slug_invalid');
    expect(contentFreeLogCode('unmatched')).toBe('unmatched');
    expect(contentFreeLogCode('body.name.invalid_type')).toBe('body.name.invalid_type');
  });

  it('lower-cases, and prefixes a first segment that cannot start a token', () => {
    expect(contentFreeLogCode('Placement/Enrollment')).toBe('placement.enrollment');
    expect(contentFreeLogCode('7z')).toBe('p7z');
    expect(contentFreeLogCode('body.items.0.name')).toBe('body.items.0.name');
  });

  it('returns null instead of an empty token', () => {
    expect(contentFreeLogCode('/')).toBeNull();
    expect(contentFreeLogCode('')).toBeNull();
    expect(contentFreeLogCode('::')).toBeNull();
  });

  it('bounds the token it produces', () => {
    const code = contentFreeLogCode(`/${'long-segment/'.repeat(40)}`);
    expect(code).not.toBeNull();
    expect(code!.length).toBeLessThanOrEqual(256);
    expect(checkSafeLogContext({ route: code })).toBeNull();
  });
});
