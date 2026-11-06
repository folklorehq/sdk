// SPDX-License-Identifier: Apache-2.0
import { canonicalJson } from '@folklore/utils/canonical-json-pure';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { firstpartySafeAscii, firstpartyTokenUrlSchema } from './firstparty-definition.js';
import { FIRSTPARTY_SLOT_KINDS } from './firstparty-slot-kinds.js';

// One RSA-4096 block, minus 2 * 32 bytes of SHA-256 OAEP overhead and 2 bytes of padding.
export const FIRSTPARTY_OAUTH_SECRET_CIPHERTEXT_BYTES = 512;
export const FIRSTPARTY_OAUTH_SECRET_MAX_PLAINTEXT_BYTES = 446;
// 512 bytes of base64 is 170 full groups, then 3 characters and one pad.
export const FIRSTPARTY_OAUTH_SECRET_CIPHERTEXT_BASE64 = /^[A-Za-z0-9+/]{683}=$/;
const MAX_CLIENT_ID_LENGTH = 128;
const MAX_SECRET_LENGTH = 160;

export const firstpartyOAuthSecretPlaintextSchema = z
  .object({
    v: z.literal(1),
    slot: z.enum(FIRSTPARTY_SLOT_KINDS),
    definitionId: z.string().uuid(),
    clientId: firstpartySafeAscii(MAX_CLIENT_ID_LENGTH),
    tokenUrl: firstpartyTokenUrlSchema,
    tokenEndpointAuth: z.enum(['client_secret_basic', 'client_secret_post']),
    secret: firstpartySafeAscii(MAX_SECRET_LENGTH),
  })
  .strict();

export type FirstpartyOAuthSecretPlaintext = z.infer<typeof firstpartyOAuthSecretPlaintextSchema>;

export const firstpartyOAuthSecretPlaintextBytes = (
  input: FirstpartyOAuthSecretPlaintext,
): number => utf8ToBytes(canonicalJson(input)).length;

export function encodeFirstpartyOAuthSecretPlaintext(
  input: FirstpartyOAuthSecretPlaintext,
): Uint8Array {
  const parsed = firstpartyOAuthSecretPlaintextSchema.safeParse(input);
  if (!parsed.success) throw new Error('firstparty_oauth_secret_mismatch');
  const bytes = utf8ToBytes(canonicalJson(parsed.data));
  if (bytes.length > FIRSTPARTY_OAUTH_SECRET_MAX_PLAINTEXT_BYTES) {
    throw new Error('firstparty_oauth_secret_too_large');
  }
  return bytes;
}
