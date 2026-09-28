// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/*
  THE PROVIDER-AGNOSTIC IDENTITY DERIVATION (2026-09-28).

  A tenant owner identity is the pair `(issuer, subject)` that a configured provider authority signed.
  Every value below is a pure function of that pair and nothing else: no provider name, no audience, no
  client id, no vendor-specific claim. The Google-named helpers in `placement-authority.ts` are thin
  delegates to these functions, so the digests a Google sign-in produces are byte-for-byte what they
  were and a second issuer runs through *this* derivation rather than a parallel one.

  The issuer is what makes the derivation provider-independent and collision-safe at the same time. It
  is mixed into the preimage, so subject `abc` under Google and subject `abc` under a second issuer are
  two distinct identities. Deriving from the subject alone (the shape the operator's note warned about)
  would let a second provider's subject namespace land on the first provider's accounts, and because
  the digest *is* the account id (`deriveAccountIdFromTenantOwnerIdentityDigest`), that is an account
  takeover rather than a lookup miss.

  The domain string is the one the pre-neutralization helper already used, so no existing account id
  moves. Changing it is a migration, not a refactor.
*/
export const TENANT_OWNER_IDENTITY_DIGEST_DOMAIN_V1 = 'folklore.tenant-owner-identity.v1';

/** Digest of the raw provider token. Unsalted because the token is opaque and single-use evidence. */
export function providerTokenDigestV1(providerToken: string): string {
  return bytesToHex(sha256(utf8ToBytes(providerToken)));
}

/** Digest of the issuer, as the identity-storage tuple addresses it. */
export function tenantOwnerIssuerDigestV1(issuer: string): string {
  return bytesToHex(sha256(utf8ToBytes(issuer)));
}

/** Digest of the subject, as the identity-storage tuple addresses it. */
export function tenantOwnerSubjectDigestV1(subject: string): string {
  return bytesToHex(sha256(utf8ToBytes(subject)));
}

/** The account-bearing identity digest, for any issuer. An account id is derived from this value. */
export function tenantOwnerIdentityDigestV1(issuer: string, subject: string): string {
  return bytesToHex(
    sha256(
      concatBytes(
        utf8ToBytes(TENANT_OWNER_IDENTITY_DIGEST_DOMAIN_V1),
        Uint8Array.of(0),
        utf8ToBytes(issuer),
        Uint8Array.of(0),
        utf8ToBytes(subject),
      ),
    ),
  );
}
