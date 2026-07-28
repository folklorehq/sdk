// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  checkContentFree,
  checkDistinctId,
  assertContentFree,
  ContentFreeViolationError,
} from '../src/index.js';

describe('checkContentFree', () => {
  it('accepts a flat record of short primitives', () => {
    expect(
      checkContentFree('org.created', { orgId: 'o1', plan: 'trial', region: 'us-east-1' }),
    ).toBeNull();
    expect(checkContentFree('deployment.checkin', { seatCount: 3, queueDepth: 0 })).toBeNull();
  });

  it('rejects a raw error message field', () => {
    expect(checkContentFree('error.captured', { message: 'user Alice said secret X' })).toMatch(
      /content-bearing/,
    );
  });

  it('rejects a stack field', () => {
    expect(checkContentFree('error.captured', { stack: 'Error: boom\n  at ...' })).toMatch(
      /content-bearing/,
    );
  });

  it.each(['title', 'body', 'content', 'summary', 'email', 'name', 'query', 'prompt'])(
    'rejects a "%s" field that could carry customer content',
    (field) => {
      expect(checkContentFree('wiki.viewed', { [field]: 'anything' })).not.toBeNull();
    },
  );

  it('rejects a long free-text value even under an innocuous key', () => {
    expect(checkContentFree('wiki.viewed', { note: 'x'.repeat(300) })).toMatch(/short primitive/);
  });

  it('rejects a nested object where content could hide', () => {
    expect(checkContentFree('wiki.viewed', { meta: { title: 'secret' } })).toMatch(
      /short primitive/,
    );
  });

  it('allows the content-free ErrorReport shape', () => {
    expect(
      checkContentFree('error.captured', {
        error_type: 'internal_error',
        error_name: 'InternalError',
        category: 'internal',
        http_status: 500,
        operational: false,
        component: 'http',
        origin: 'http',
        fingerprint: 'abc123',
        route: '/api/v1/wiki/x',
        source_location: 'wiki.js:42',
      }),
    ).toBeNull();
  });
});

describe('checkDistinctId', () => {
  it('accepts synthetic ids', () => {
    expect(checkDistinctId('11111111-1111-1111-1111-111111111111')).toBeNull();
    expect(checkDistinctId('system')).toBeNull();
  });

  it('rejects an email-as-distinctId footgun', () => {
    expect(checkDistinctId('alice@acme.com')).toMatch(/email/);
  });

  it('rejects an over-long distinctId', () => {
    expect(checkDistinctId('x'.repeat(300))).toMatch(/length/);
  });
});

describe('assertContentFree', () => {
  it('throws ContentFreeViolationError on a body-bearing field', () => {
    expect(() => assertContentFree('error.captured', { message: 'boom' })).toThrow(
      ContentFreeViolationError,
    );
  });
});
