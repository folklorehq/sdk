// SPDX-License-Identifier: Apache-2.0
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

/** The domain part of an email, lowercased, or null when the address is malformed. */
export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf('@');
  if (at < 1) return null;
  const domain = normalized.slice(at + 1);
  return domain.includes('.') && !domain.endsWith('.') ? domain : null;
}

/** True for free / public mailbox registrars (Gmail, Outlook.com, etc.). */
export function isPublicEmailDomain(email: string): boolean {
  const domain = emailDomain(email);
  return domain != null && PUBLIC_EMAIL_DOMAINS.has(domain);
}

/** Blocks public mailbox registrars; used by magic-link request gates. */
export function isWorkEmail(email: string): boolean {
  const domain = emailDomain(email);
  return domain != null && !PUBLIC_EMAIL_DOMAINS.has(domain);
}
