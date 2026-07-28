// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const MAX_EMAIL_LEN = 320;

// Console magic-link sign-in request. Email is the only payload; the control
// plane mints a short-lived single-use token and emails a verification link. Content-free.
export const magicLinkRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(MAX_EMAIL_LEN),
  })
  .strict();
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

// Always-ok acknowledgement (never reveals whether an account exists — no enumeration).
export const magicLinkRequestResultSchema = z.object({ ok: z.literal(true) }).strict();
export type MagicLinkRequestResult = z.infer<typeof magicLinkRequestResultSchema>;

// TOTP (authenticator-app) MFA for control-plane / console sign-in. A 6-digit TOTP code or a
// recovery code (letters/digits + optional separators) is accepted where a code is required.
const MFA_CODE_MIN = 6;
const MFA_CODE_MAX = 32;
export const mfaCodeSchema = z.string().trim().min(MFA_CODE_MIN).max(MFA_CODE_MAX);
export const mfaCodeBodySchema = z.object({ code: mfaCodeSchema }).strict();
export type MfaCodeBody = z.infer<typeof mfaCodeBodySchema>;

export const mfaStatusSchema = z
  .object({
    enabled: z.boolean(),
    pending: z.boolean(),
    recoveryCodesRemaining: z.number().int().nonnegative(),
  })
  .strict();
export type MfaStatusDto = z.infer<typeof mfaStatusSchema>;

// Enrollment start: the base32 secret (for manual entry) plus an otpauth:// URI (for the QR code).
export const mfaEnrollStartSchema = z
  .object({ secret: z.string(), otpauthUri: z.string() })
  .strict();
export type MfaEnrollStart = z.infer<typeof mfaEnrollStartSchema>;

// Recovery codes are returned exactly once, at enrollment confirmation.
export const mfaConfirmResultSchema = z.object({ recoveryCodes: z.array(z.string()) }).strict();
export type MfaConfirmResult = z.infer<typeof mfaConfirmResultSchema>;
