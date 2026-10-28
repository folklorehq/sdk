// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ConnectorSpecError } from '@folklore/errors';
import { assertSpecUrl, parseSpecUrl } from '../../src/definition/spec-egress.js';
import { FIXTURE_MANIFEST, FIXTURE_ORIGIN } from './fixtures/streams.js';

function refused(run: () => unknown): ConnectorSpecError {
  try {
    run();
  } catch (error) {
    return error as ConnectorSpecError;
  }
  throw new Error('expected the call to throw');
}

describe('assertSpecUrl', () => {
  it('accepts an https URL on an allowed host with the default port', () => {
    expect(() =>
      assertSpecUrl(new URL('https://api.example.test/v1/items?x=1'), FIXTURE_MANIFEST, null),
    ).not.toThrow();
  });

  it('accepts a followed URL on the spec origin', () => {
    expect(() =>
      assertSpecUrl(new URL('https://api.example.test/p2'), FIXTURE_MANIFEST, FIXTURE_ORIGIN),
    ).not.toThrow();
  });

  it.each([
    ['a host of another kind', 'https://api.other.test/x'],
    ['a suffix-lookalike host', 'https://api.example.test.evil.test/x'],
    ['a prefix-lookalike host', 'https://evil-api.example.test/x'],
    ['http', 'http://api.example.test/x'],
    ['userinfo', 'https://user@api.example.test/x'],
    ['userinfo with a password', 'https://user:pw@api.example.test/x'],
    ['a non-default port', 'https://api.example.test:8443/x'],
    ['an explicit port 443 on another host', 'https://api.other.test:443/x'],
    ['an IP literal', 'https://10.0.0.1/x'],
  ])('refuses %s', (_label, url) => {
    const error = refused(() => assertSpecUrl(new URL(url), FIXTURE_MANIFEST, null));
    expect(error).toBeInstanceOf(ConnectorSpecError);
    expect(error.code).toBe('egress_host_refused');
  });

  it('refuses a followed URL on an allowed host that is not the spec origin', () => {
    const manifest = {
      ...FIXTURE_MANIFEST,
      egress: { apiHosts: ['api.example.test', 'files.example.test'], cdnSuffixes: [] },
    };
    expect(() =>
      assertSpecUrl(new URL('https://files.example.test/x'), manifest, null),
    ).not.toThrow();
    expect(
      refused(() =>
        assertSpecUrl(new URL('https://files.example.test/x'), manifest, FIXTURE_ORIGIN),
      ).code,
    ).toBe('egress_host_refused');
  });
});

describe('parseSpecUrl', () => {
  it('parses an absolute URL', () => {
    expect(parseSpecUrl('https://api.example.test/x').pathname).toBe('/x');
  });

  it('turns a parse failure into egress_host_refused without keeping the input', () => {
    const error = refused(() => parseSpecUrl('not a url CANARY-7f3a'));
    expect(error.code).toBe('egress_host_refused');
    expect(error.cause).toBeUndefined();
    expect(`${error.message}${JSON.stringify(error.context)}${String(error)}`).not.toContain(
      'CANARY-7f3a',
    );
  });
});
