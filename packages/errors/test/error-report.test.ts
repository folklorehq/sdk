// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { AppError, isErrorReport, ServiceUnavailableError, toErrorReport } from '../src/index.js';
import { NotFoundError, ValidationError } from '../src/index.js';

describe('toErrorReport', () => {
  it('produces a content-free report — no message, no stack text', () => {
    const err = new Error('customer Alice mentioned secret project Zephyr');
    const report = toErrorReport(err, { origin: 'uncaught', component: 'worker' });

    expect(report).not.toHaveProperty('message');
    expect(report).not.toHaveProperty('stack');
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('Alice');
    expect(serialized).not.toContain('Zephyr');
    expect(serialized).not.toContain('secret');
  });

  it('classifies an AppError by its code, category, status, and operational flag', () => {
    const report = toErrorReport(new NotFoundError('theme not found'), {
      origin: 'http',
      route: '/api/v1/wiki/:themeId',
    });
    expect(report.error_type).toBe('not_found');
    expect(report.error_name).toBe('NotFoundError');
    expect(report.category).toBe('not_found');
    expect(report.http_status).toBe(404);
    expect(report.operational).toBe(true);
    expect(report.origin).toBe('http');
    expect(report.route).toBe('/api/v1/wiki/:themeId');
  });

  it('omits a concrete customer-bearing path', () => {
    const report = toErrorReport(new NotFoundError('theme not found'), {
      origin: 'http',
      route: '/api/v1/wiki/customer-secret',
    });

    expect(report).not.toHaveProperty('route');
    expect(JSON.stringify(report)).not.toContain('customer-secret');
  });

  it.each(['/health', 'unmatched'])('omits a non-parameterized route: %s', (route) => {
    const report = toErrorReport(new NotFoundError('theme not found'), {
      origin: 'http',
      route,
    });

    expect(report).not.toHaveProperty('route');
  });

  it('uses the closed taxonomy when an AppError instance is mutated', () => {
    const error = new NotFoundError('theme not found', { component: 'customer_secret' });
    Object.defineProperties(error, {
      category: { value: 'customer_secret' },
      code: { value: 'customer_secret' },
      httpStatus: { value: 599 },
      isOperational: { value: false },
      name: { value: 'CustomerSecretError' },
    });

    const report = toErrorReport(error, { origin: 'http', component: 'http' });

    expect(report).toMatchObject({
      error_type: 'not_found',
      error_name: 'NotFoundError',
      category: 'not_found',
      http_status: 404,
      operational: true,
      component: 'http',
    });
    expect(JSON.stringify(report)).not.toContain('customer_secret');
    expect(JSON.stringify(report)).not.toContain('CustomerSecretError');
  });

  it('maps dynamic service-unavailable codes to one closed classification', () => {
    const report = toErrorReport(new ServiceUnavailableError('not wired', 'customer_secret'), {
      origin: 'manual',
      component: 'worker',
    });

    expect(report).toMatchObject({
      error_type: 'service_unavailable',
      error_name: 'ServiceUnavailableError',
      category: 'unavailable',
      http_status: 503,
      operational: true,
    });
    expect(JSON.stringify(report)).not.toContain('customer_secret');
  });

  it('maps an unknown AppError subclass to the closed internal classification', () => {
    class CustomerSecretError extends AppError {
      constructor() {
        super('customer content', {
          code: 'customer_secret',
          category: 'external',
          component: 'customer_secret',
          httpStatus: 599,
        });
      }
    }

    const report = toErrorReport(new CustomerSecretError(), {
      origin: 'manual',
      component: 'worker',
    });

    expect(report).toMatchObject({
      error_type: 'internal_error',
      error_name: 'InternalError',
      category: 'internal',
      http_status: 500,
      operational: false,
      component: 'worker',
    });
    expect(JSON.stringify(report)).not.toContain('customer_secret');
    expect(JSON.stringify(report)).not.toContain('CustomerSecretError');
  });

  it('emits a stable fingerprint for the same code + component + location', () => {
    const make = () =>
      toErrorReport(new ValidationError('bad'), { origin: 'manual', component: 'api' });
    expect(make().fingerprint).toBe(make().fingerprint);
    expect(make().fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('rejects an arbitrary hex fingerprint that does not match the classification and component', () => {
    const report = toErrorReport(new ValidationError('bad'), {
      origin: 'manual',
      component: 'api',
    });

    expect(isErrorReport({ ...report, fingerprint: '5a455553504c414e' })).toBe(false);
    expect(isErrorReport(report)).toBe(true);
  });

  it('omits source-derived stack data from reports', () => {
    const err = new Error('boom', { cause: new Error('CUSTOMER_CAUSE_SENTINEL') });
    err.stack = 'Error: boom\n    at CUSTOMER_SOURCE_SENTINEL:42:1';

    const report = toErrorReport(err, { origin: 'uncaught', component: 'worker' });

    expect(report).not.toHaveProperty('source_location');
    expect(JSON.stringify(report)).not.toContain('CUSTOMER_SOURCE_SENTINEL');
    expect(JSON.stringify(report)).not.toContain('CUSTOMER_CAUSE_SENTINEL');
  });
});
