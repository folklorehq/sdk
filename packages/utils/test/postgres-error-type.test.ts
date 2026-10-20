// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  isRetryablePostgresError,
  postgresErrorType,
  postgresSqlState,
} from '../src/postgres-error-type.js';

describe('postgresErrorType', () => {
  it('reads the SQLSTATE from the cause of a wrapped driver error', () => {
    const error = Object.assign(new Error('query failed'), { cause: { code: '42501' } });
    expect(postgresErrorType(error)).toBe('sqlstate_42501');
  });

  it('follows the cause chain to depth 2 and no further', () => {
    expect(postgresErrorType({ cause: { cause: { code: '42501' } } })).toBe('sqlstate_42501');
    expect(postgresErrorType({ cause: { cause: { cause: { code: '42501' } } } })).toBeNull();
  });

  it('terminates on a cyclic cause chain', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(postgresErrorType(cyclic)).toBeNull();
  });

  it('ignores a non-object cause', () => {
    expect(postgresErrorType({ cause: 'boom' })).toBeNull();
    expect(postgresErrorType({ cause: 42 })).toBeNull();
  });

  it('keeps top-level constraint and routine when the SQLSTATE comes from a cause', () => {
    expect(
      postgresErrorType({ constraint_name: 'pool_assignments_pkey', cause: { code: '23505' } }),
    ).toBe('sqlstate_23505_pool_assignments_pkey');
    expect(postgresErrorType({ routine: 'LockAcquire', cause: { code: '55P03' } })).toBe(
      'sqlstate_55p03_lockacquire',
    );
  });

  it.each(['EPIPE', 'EPERM', 'EBADF', 'EROFS', 'EXDEV'])('rejects the errno code %s', (code) => {
    expect(postgresErrorType({ code })).toBeNull();
  });

  it('still accepts SQLSTATE codes that contain letters', () => {
    expect(postgresErrorType({ code: 'P0001' })).toBe('sqlstate_p0001');
    expect(postgresErrorType({ code: '42P01' })).toBe('sqlstate_42p01');
  });
});

describe('isRetryablePostgresError', () => {
  it.each(['40P01', '40001'])('is true for SQLSTATE %s, bare or wrapped by drizzle', (code) => {
    expect(isRetryablePostgresError({ code })).toBe(true);
    expect(isRetryablePostgresError({ message: 'Failed query', cause: { code } })).toBe(true);
  });

  it.each([{ code: '23505' }, { code: 'EPIPE' }, new Error('x'), null, 'text'])(
    'is false for %o',
    (error) => {
      expect(isRetryablePostgresError(error)).toBe(false);
    },
  );
});

describe('postgresSqlState', () => {
  it('returns the bare SQLSTATE even when the server adds a routine, which postgresErrorType appends', () => {
    const wrapped = Object.assign(new Error('query failed'), {
      cause: { code: '55P03', routine: 'ProcessInterrupts' },
    });
    expect(postgresSqlState(wrapped)).toBe('55P03');
    expect(postgresSqlState({ code: '55P03', routine: 'ProcessInterrupts' })).toBe('55P03');
    expect(postgresErrorType(wrapped)).toBe('sqlstate_55p03_processinterrupts');
  });

  it('is null for an error without a SQLSTATE or with a Node errno code', () => {
    expect(postgresSqlState(new Error('boom'))).toBeNull();
    expect(postgresSqlState({ code: 'EPIPE' })).toBeNull();
    expect(postgresSqlState('boom')).toBeNull();
  });
});
