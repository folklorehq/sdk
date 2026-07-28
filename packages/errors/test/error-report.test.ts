// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { toErrorReport } from '../src/index.js';
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
      route: '/api/v1/wiki/x',
    });
    expect(report.error_type).toBe('not_found');
    expect(report.error_name).toBe('NotFoundError');
    expect(report.category).toBe('not_found');
    expect(report.http_status).toBe(404);
    expect(report.operational).toBe(true);
    expect(report.origin).toBe('http');
    expect(report.route).toBe('/api/v1/wiki/x');
  });

  it('emits a stable fingerprint for the same code + component + location', () => {
    const make = () =>
      toErrorReport(new ValidationError('bad'), { origin: 'manual', component: 'api' });
    expect(make().fingerprint).toBe(make().fingerprint);
    expect(make().fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('carries only a basename:line source location, never a path', () => {
    const report = toErrorReport(new Error('boom'), { origin: 'uncaught', component: 'worker' });
    if (report.source_location !== undefined) {
      expect(report.source_location).toMatch(/^[^/\\]+:\d+$/);
    }
  });
});
