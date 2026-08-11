// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const CANONICAL_LOWERCASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CANONICAL_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:(?:[A-Za-z0-9+/][AQgw])==|(?:[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048])=)?$/;

const canonicalUuidSchema = z.string().uuid().regex(CANONICAL_LOWERCASE_UUID_PATTERN);
const positiveSafeIntegerSchema = z.number().int().safe().positive();
const canonicalBase64Schema = z.string().min(1).regex(CANONICAL_BASE64_PATTERN);

export const sealedContentEnvelopeV1Schema = z
  .object({
    version: z.literal(1),
    algorithm: z.literal('ALG_AES256_GCM_IV12_TAG16_HKDF_SHA512_COMMIT_KEY_ECDSA_P384'),
    orgId: canonicalUuidSchema,
    objectId: canonicalUuidSchema,
    purpose: z.enum([
      'fact-body',
      'wiki-block',
      'team-onboarding-block',
      'wiki-comment',
      'wiki-snapshot',
      'wiki-publication',
      'wiki-edit',
      'hnsw',
      'cache',
    ]),
    formatVersion: positiveSafeIntegerSchema,
    contentKeyVersion: positiveSafeIntegerSchema,
    ciphertext: canonicalBase64Schema,
  })
  .strict();
export type SealedContentEnvelopeV1 = z.infer<typeof sealedContentEnvelopeV1Schema>;

export function sealedEnvelopeHeader(envelope: SealedContentEnvelopeV1) {
  return {
    version: envelope.version,
    algorithm: envelope.algorithm,
    orgId: envelope.orgId,
    objectId: envelope.objectId,
    purpose: envelope.purpose,
    formatVersion: envelope.formatVersion,
    contentKeyVersion: envelope.contentKeyVersion,
  };
}
