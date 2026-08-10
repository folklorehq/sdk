// SPDX-License-Identifier: Apache-2.0
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  checkSafeLogContext,
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
