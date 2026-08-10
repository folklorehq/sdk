// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  InternalError,
  NotFoundError,
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
