// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  AmbiguousHostError,
  ConcurrencyLimitError,
  AppError,
  CannotChangeSelfError,
  ConflictError,
  ExternalServiceError,
  HostBusyError,
  HostInstanceMismatchError,
  HostInstanceMissingError,
  HostLocationUnknownError,
  InternalError,
  InvalidBillingBasisError,
  LastSuperAdminError,
  NotFoundError,
  PERSONAL_SOURCE_FACT_DENIALS,
  PersonalSourceFactRejectedError,
  PersonalSourceAccountConflictError,
  PersonalSourceOwnerConflictError,
  PERSONAL_SOURCE_RECONNECT_CONFLICTS,
  PersonalSourceReconnectConflictError,
  SourceConnectionScopeViolationError,
  ValidationError,
  isAppError,
  normalizeError,
} from '../src/index.js';

describe('AppError subclasses', () => {
  it('set code, category, status, and name', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('validation_error');
    expect(err.category).toBe('validation');
    expect(err.httpStatus).toBe(400);
    expect(err.name).toBe('ValidationError');
    expect(err.isOperational).toBe(true);
  });

  it('apply per-category default statuses', () => {
    expect(new NotFoundError('x').httpStatus).toBe(404);
    expect(new ConflictError('x').httpStatus).toBe(409);
    expect(new ExternalServiceError('x').httpStatus).toBe(502);
  });

  it('uses stable staff-role conflict codes', () => {
    expect(new CannotChangeSelfError().code).toBe('cannot_change_self');
    expect(new CannotChangeSelfError().httpStatus).toBe(409);
    expect(new LastSuperAdminError().code).toBe('last_super_admin');
    expect(new LastSuperAdminError().httpStatus).toBe(409);
  });

  it.each([
    ['host_instance_ambiguous', new AmbiguousHostError()],
    ['host_instance_mismatch', new HostInstanceMismatchError()],
    ['host_instance_missing', new HostInstanceMissingError()],
    ['host_location_unknown', new HostLocationUnknownError()],
    ['host_busy', new HostBusyError()],
  ])('uses the stable pool host conflict code %s', (code, err) => {
    expect(err.code).toBe(code);
    expect(err.category).toBe('conflict');
    expect(err.httpStatus).toBe(409);
    expect(err.toTelemetry()).toEqual({ error_type: code, component: 'unknown' });
    expect(JSON.stringify(err.toTelemetry())).not.toContain(err.message);
  });

  it('reports an invalid billing basis under its stable operational code, with no message in telemetry', () => {
    const err = new InvalidBillingBasisError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('invalid_billing_basis');
    expect(err.isOperational).toBe(true);
    expect(err.toTelemetry()).toEqual({
      error_type: 'invalid_billing_basis',
      component: 'unknown',
    });
    expect(JSON.stringify(err.toTelemetry())).not.toContain(err.message);
  });

  it('treat internal errors as non-operational by default', () => {
    expect(new InternalError('boom').isOperational).toBe(false);
  });

  it('preserve the cause chain', () => {
    const root = new Error('root');
    const err = new ExternalServiceError('upstream failed', { cause: root });
    expect(err.cause).toBe(root);
  });

  it('allow a status override', () => {
    expect(new ExternalServiceError('x', { httpStatus: 503 }).httpStatus).toBe(503);
  });
});

describe('trust boundary', () => {
  it('toTelemetry exposes only error_type + component — never message/context', () => {
    const err = new ValidationError('user email "secret@corp.com" is invalid', {
      component: 'ingestion',
      context: { email: 'secret@corp.com' },
    });
    const telemetry = err.toTelemetry();

    expect(telemetry).toEqual({ error_type: 'validation_error', component: 'ingestion' });
    expect(Object.keys(telemetry)).toEqual(['error_type', 'component']);
    expect(JSON.stringify(telemetry)).not.toContain('secret@corp.com');
  });

  it('defaults component to "unknown" when unattributed', () => {
    expect(new InternalError('x').toTelemetry().component).toBe('unknown');
  });

  it('toLogContext retains only the closed telemetry classification during migration', () => {
    const err = new ValidationError('customer content', {
      component: 'api',
      context: { field: 'name' },
    });
    const context = err.toLogContext();

    expect(context).toEqual({ error_type: 'validation_error', component: 'api' });
    expect(JSON.stringify(context)).not.toContain('customer content');
    expect(JSON.stringify(context)).not.toContain('field');
  });
});

describe('normalizeError', () => {
  it('passes AppErrors through unchanged', () => {
    const err = new NotFoundError('missing');
    expect(normalizeError(err)).toBe(err);
  });

  it('wraps native Errors in a non-operational InternalError', () => {
    const native = new Error('kaboom');
    const normalized = normalizeError(native, { component: 'worker' });
    expect(normalized).toBeInstanceOf(InternalError);
    expect(normalized.isOperational).toBe(false);
    expect(normalized.cause).toBe(native);
    expect(normalized.component).toBe('worker');
  });

  it('wraps non-error throws', () => {
    const normalized = normalizeError('just a string');
    expect(normalized).toBeInstanceOf(InternalError);
    expect(normalized.context).toMatchObject({ thrownType: 'string' });
  });

  it('isAppError narrows correctly', () => {
    expect(isAppError(new ValidationError('x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError('x')).toBe(false);
  });
});

describe('personal-source errors', () => {
  it('reports the owner conflict as a code-only conflict', () => {
    const err = new PersonalSourceOwnerConflictError({ component: 'personal_source_binding' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('personal_source_owner_conflict');
    expect(err.httpStatus).toBe(409);
    expect(err.toTelemetry()).toEqual({
      error_type: 'personal_source_owner_conflict',
      component: 'personal_source_binding',
    });
    expect(err.message).toBe('PERSONAL_SOURCE_OWNER_CONFLICT');
  });

  it.each(PERSONAL_SOURCE_FACT_DENIALS)('carries only the closed reason %s', (reason) => {
    const err = new PersonalSourceFactRejectedError(reason);
    expect(err.code).toBe('personal_source_fact_rejected');
    expect(err.reason).toBe(reason);
    expect(err.message).toBe('PERSONAL_SOURCE_FACT_REJECTED');
    expect(JSON.stringify(err.toTelemetry())).not.toContain(reason);
  });

  it('reports a provider account already held by another member as a code-only conflict', () => {
    const err = new PersonalSourceAccountConflictError({ component: 'personal_source_connect' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('personal_source_account_conflict');
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe('PERSONAL_SOURCE_ACCOUNT_CONFLICT');
    expect(err.toTelemetry()).toEqual({
      error_type: 'personal_source_account_conflict',
      component: 'personal_source_connect',
    });
  });

  it('reports a connection written outside its owner scope as a code-only conflict', () => {
    const err = new SourceConnectionScopeViolationError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('source_scope_violation');
    expect(err.httpStatus).toBe(409);
    expect(err.message).toBe('SOURCE_SCOPE_VIOLATION');
    expect(err.toTelemetry()).toEqual({
      error_type: 'source_scope_violation',
      component: 'unknown',
    });
  });

  it.each(PERSONAL_SOURCE_RECONNECT_CONFLICTS)(
    'reports the reconnect conflict %s with a code-only telemetry shape',
    (reason) => {
      const err = new PersonalSourceReconnectConflictError(reason);
      expect(err.code).toBe('personal_source_reconnect_conflict');
      expect(err.httpStatus).toBe(409);
      expect(err.reason).toBe(reason);
      expect(JSON.stringify(err.toTelemetry())).not.toContain(reason);
    },
  );
});

describe('ConcurrencyLimitError', () => {
  it('is a 429 carrying the code it was given', () => {
    const error = new ConcurrencyLimitError('busy', 'audience_lens_busy');
    expect([error.httpStatus, error.code, error.isOperational]).toEqual([
      429,
      'audience_lens_busy',
      true,
    ]);
  });
});
