// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { parseRetryAfterMs } from '../src/retry-after.js';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const MAX_MS = 60_000;

describe('parseRetryAfterMs', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfterMs('2', NOW, MAX_MS)).toBe(2_000);
    expect(parseRetryAfterMs(' 0 ', NOW, MAX_MS)).toBe(0);
  });

  it('reads an HTTP-date as the delay from now', () => {
    expect(parseRetryAfterMs('Wed, 14 Oct 2026 12:00:05 GMT', NOW, MAX_MS)).toBe(5_000);
  });

  it('treats an HTTP-date already past as no wait', () => {
    expect(parseRetryAfterMs('Wed, 14 Oct 2026 11:59:00 GMT', NOW, MAX_MS)).toBe(0);
  });

  it('clamps a long delay to the ceiling', () => {
    expect(parseRetryAfterMs('3600', NOW, MAX_MS)).toBe(MAX_MS);
    expect(parseRetryAfterMs('Thu, 15 Oct 2026 12:00:00 GMT', NOW, MAX_MS)).toBe(MAX_MS);
  });

  it.each([
    null,
    undefined,
    '',
    'soon',
    '-1',
    '1.5',
    '1e3',
    '0x10',
    'Wed, 99 Foo 2026 GMT',
    '2026-10-14',
  ])('ignores %p', (value) => {
    expect(parseRetryAfterMs(value, NOW, MAX_MS)).toBeUndefined();
  });
});
