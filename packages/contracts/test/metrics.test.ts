// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { factMetricSchema } from '../src/metrics.js';

describe('factMetricSchema — fails closed by shape', () => {
  it('accepts a vocab key + vocab unit', () => {
    expect(() =>
      factMetricSchema.parse({ key: 'github.pr.additions', value: 12, unit: 'lines' }),
    ).not.toThrow();
  });

  it('rejects an out-of-vocab key (a path/filename cannot ride the key field)', () => {
    expect(() =>
      factMetricSchema.parse({ key: 'src/server/auth.ts', value: 1, unit: 'lines' }),
    ).toThrow();
  });

  it('rejects an out-of-vocab unit (only the closed unit vocabulary is accepted)', () => {
    expect(() =>
      factMetricSchema.parse({ key: 'github.pr.additions', value: 1, unit: 'filename.ts' }),
    ).toThrow();
  });
});
