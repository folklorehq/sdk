// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  TENANT_OWNER_IDENTITY_DIGEST_DOMAIN_V1,
  providerTokenDigestV1,
  tenantOwnerIdentityDigestV1,
  tenantOwnerIssuerDigestV1,
  tenantOwnerSubjectDigestV1,
} from '../../src/placement-identity/identity-digest.js';

/*
  The provider-agnostic identity derivation, with no provider named.

  The literals below were computed outside this implementation (a plain `node:crypto` script that
  reproduced the derivation from the domain string and the tuple framing), so they are evidence about the
  bytes rather than a restatement of the code. The delegated Google-named helpers and the account id
  derived from this digest live in `placement-authority.ts`, which is not part of the public product
  mirror, so those assertions are in `test/placement-authority.test.ts` instead.
*/
const GOOGLE_ISSUER = 'https://accounts.google.com';
const SECOND_ISSUER = 'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0';
const SUBJECT = 'placement-owner';
const SECOND_SUBJECT = 'placement-owner-microsoft';

const GOOGLE_OWNER_IDENTITY_DIGEST =
  '0eb20829bc0f7308d84a96d74db42a4e62e6ea13519412d48c55cda9c0b43211';
const SECOND_OWNER_IDENTITY_DIGEST =
  'e6aec1d0696a49feeb2b54d1df77385809e028361a791fd5e649a971cba6c1dc';
const SAME_SUBJECT_OTHER_ISSUER_DIGEST =
  'c182684bf6ec7557b8dfd6c3f53104a0e22e58cdd997ebe95a1c93e06d40993f';

describe('provider-agnostic tenant owner identity derivation', () => {
  it('derives the owner identity digest from the issuer and the subject, for any issuer', () => {
    expect(tenantOwnerIdentityDigestV1(GOOGLE_ISSUER, SUBJECT)).toBe(GOOGLE_OWNER_IDENTITY_DIGEST);
    expect(tenantOwnerIdentityDigestV1(SECOND_ISSUER, SECOND_SUBJECT)).toBe(
      SECOND_OWNER_IDENTITY_DIGEST,
    );
  });

  it('scopes the identity by the issuer, so a subject cannot cross providers', () => {
    // The literal is the whole point of the assertion: the same subject under a different issuer is a
    // different identity, which is what stops a second provider's subject namespace reaching the first
    // provider's accounts -- and an account id is derived from this digest.
    expect(tenantOwnerIdentityDigestV1(SECOND_ISSUER, SUBJECT)).toBe(
      SAME_SUBJECT_OTHER_ISSUER_DIGEST,
    );
    expect(tenantOwnerIdentityDigestV1(SECOND_ISSUER, SUBJECT)).not.toBe(
      tenantOwnerIdentityDigestV1(GOOGLE_ISSUER, SUBJECT),
    );
    expect(TENANT_OWNER_IDENTITY_DIGEST_DOMAIN_V1).toBe('folklore.tenant-owner-identity.v1');
  });

  it('separates the identity domain from the plain digests and from the reversed tuple', () => {
    // `issuer` and `subject` are ordered and domain-separated, so no other tuple can produce this
    // identity by concatenation or by swapping the fields.
    expect(tenantOwnerIdentityDigestV1(GOOGLE_ISSUER, SUBJECT)).not.toBe(
      '4ab227d5a29f6314c5f8e30323ba0649a8586d4479befa59611a23e2e47a6b74',
    );
    expect(tenantOwnerIdentityDigestV1(SUBJECT, GOOGLE_ISSUER)).toBe(
      '670954e11a2aeac18a1842b205f880892ecb23b033311893b8881cc2044793b9',
    );
    // The field digests are deliberately the plain `sha256` of the field: they address a stored identity
    // tuple, while only the owner identity digest is domain-separated and account-bearing.
    expect(tenantOwnerSubjectDigestV1(SUBJECT)).not.toBe(
      tenantOwnerIdentityDigestV1(GOOGLE_ISSUER, SUBJECT),
    );
    expect(tenantOwnerIssuerDigestV1(GOOGLE_ISSUER)).toMatch(/^[0-9a-f]{64}$/);
    expect(providerTokenDigestV1('abc.token.body')).toMatch(/^[0-9a-f]{64}$/);
  });
});
