// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  PUNYCODE_ACE_PREFIX,
  RESERVED_SUBDOMAINS,
  SUBDOMAIN_LABEL_MAX_LENGTH,
  SUBDOMAIN_LABEL_MIN_LENGTH,
  SUBDOMAIN_LABEL_RE,
  isReservedSubdomain,
  isValidSubdomainLabel,
  isValidTenantSubdomain,
  resolveTenantFromHost,
} from '../src/tenant.js';
import * as utils from '../src/index.js';

describe('isValidSubdomainLabel', () => {
  it('accepts lowercase alphanumeric labels with internal hyphens', () => {
    expect(isValidSubdomainLabel('acme')).toBe(true);
    expect(isValidSubdomainLabel('acme-corp')).toBe(true);
    expect(isValidSubdomainLabel('a1b2c3')).toBe(true);
  });

  it('rejects uppercase, leading/trailing hyphens, and out-of-range lengths', () => {
    expect(isValidSubdomainLabel('Acme')).toBe(false);
    expect(isValidSubdomainLabel('-acme')).toBe(false);
    expect(isValidSubdomainLabel('acme-')).toBe(false);
    expect(isValidSubdomainLabel('ab')).toBe(false);
    expect(isValidSubdomainLabel('a'.repeat(41))).toBe(false);
    expect(isValidSubdomainLabel('under_score')).toBe(false);
    expect(isValidSubdomainLabel('has.dot')).toBe(false);
  });

  // A punycode label decodes to non-ASCII characters that can render as a homograph of a real
  // tenant's slug in the browser URL bar (IDN homograph phishing) — reject the ACE prefix outright.
  it('rejects a punycode (xn--) label', () => {
    expect(isValidSubdomainLabel('xn--pple-43d')).toBe(false);
    expect(isValidSubdomainLabel('xn--acme-1a2b3')).toBe(false);
  });
});

describe('isReservedSubdomain', () => {
  it('flags platform-owned hosts regardless of case', () => {
    for (const reserved of ['www', 'app', 'api', 'controlplane', 'admin', 'nango']) {
      expect(isReservedSubdomain(reserved)).toBe(true);
      expect(isReservedSubdomain(reserved.toUpperCase())).toBe(true);
    }
  });

  it('does not flag an ordinary tenant name', () => {
    expect(isReservedSubdomain('acme')).toBe(false);
  });
});

describe('isValidTenantSubdomain', () => {
  it('requires a valid label that is not reserved', () => {
    expect(isValidTenantSubdomain('acme')).toBe(true);
    expect(isValidTenantSubdomain('app')).toBe(false);
    expect(isValidTenantSubdomain('controlplane')).toBe(false);
    expect(isValidTenantSubdomain('-bad')).toBe(false);
  });

  it('rejects a punycode label even though it is otherwise a well-formed DNS label', () => {
    expect(isValidTenantSubdomain('xn--pple-43d')).toBe(false);
  });
});

describe('SUBDOMAIN_LABEL_RE', () => {
  const cases = [
    'acme',
    'acme-corp',
    'a1b2c3',
    'Acme',
    '-acme',
    'acme-',
    'ab',
    'a'.repeat(41),
    'under_score',
    'has.dot',
    'xn--pple-43d',
    'xn--acme-1a2b3',
    'app',
    'controlplane',
    '-bad',
  ];

  // Consumers that cannot import this package rebuild the check from its exports.
  const rebuiltFromExports = (label: string): boolean =>
    label.length >= SUBDOMAIN_LABEL_MIN_LENGTH &&
    label.length <= SUBDOMAIN_LABEL_MAX_LENGTH &&
    SUBDOMAIN_LABEL_RE.test(label) &&
    !label.startsWith(PUNYCODE_ACE_PREFIX) &&
    !RESERVED_SUBDOMAINS.has(label);

  it.each(cases)('agrees with isValidTenantSubdomain on %s', (label) => {
    expect(rebuiltFromExports(label)).toBe(isValidTenantSubdomain(label));
  });

  it('is stateless, so its source can be interpolated and reused', () => {
    expect(SUBDOMAIN_LABEL_RE.flags).toBe('');
  });

  // An escape lost when the source is embedded in another string would silently widen the rule.
  it('has a source with no escapes or delimiters to lose when embedded', () => {
    expect(SUBDOMAIN_LABEL_RE.source).not.toMatch(/[\\/]/);
  });

  it('is exported from the package root beside the rest of the rule', () => {
    expect(utils.SUBDOMAIN_LABEL_RE).toBe(SUBDOMAIN_LABEL_RE);
    expect(utils.PUNYCODE_ACE_PREFIX).toBe(PUNYCODE_ACE_PREFIX);
  });
});

describe('resolveTenantFromHost', () => {
  describe('with an explicit root domain', () => {
    const root = 'folklorehq.com';

    it('extracts the tenant label', () => {
      expect(resolveTenantFromHost('acme.folklorehq.com', root)).toBe('acme');
      expect(resolveTenantFromHost('Acme.Folklorehq.Com', root)).toBe('acme');
      expect(resolveTenantFromHost('acme.folklorehq.com.', root)).toBe('acme');
    });

    it('returns null for the apex and www', () => {
      expect(resolveTenantFromHost('folklorehq.com', root)).toBeNull();
      expect(resolveTenantFromHost('www.folklorehq.com', root)).toBeNull();
    });

    it('returns null for reserved platform hosts', () => {
      expect(resolveTenantFromHost('app.folklorehq.com', root)).toBeNull();
      expect(resolveTenantFromHost('controlplane.folklorehq.com', root)).toBeNull();
      expect(resolveTenantFromHost('api.folklorehq.com', root)).toBeNull();
    });

    it('returns null for a nested (multi-label) subdomain', () => {
      expect(resolveTenantFromHost('a.b.folklorehq.com', root)).toBeNull();
    });

    it('returns null for a different root domain', () => {
      expect(resolveTenantFromHost('acme.evil.com', root)).toBeNull();
      expect(resolveTenantFromHost('acme.folklorehq.com.evil.com', root)).toBeNull();
    });
  });

  describe('without a root domain (leftmost-label heuristic)', () => {
    it('extracts the leading label of a 3+ segment host', () => {
      expect(resolveTenantFromHost('acme.folklorehq.com')).toBe('acme');
      expect(resolveTenantFromHost('acme.example.com')).toBe('acme');
    });

    it('returns null for apex, localhost, and reserved hosts', () => {
      expect(resolveTenantFromHost('folklorehq.com')).toBeNull();
      expect(resolveTenantFromHost('localhost')).toBeNull();
      expect(resolveTenantFromHost('app.folklorehq.com')).toBeNull();
      expect(resolveTenantFromHost('www.folklorehq.com')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(resolveTenantFromHost('')).toBeNull();
    });
  });
});
