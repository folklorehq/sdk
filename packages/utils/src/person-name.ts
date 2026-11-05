// SPDX-License-Identifier: Apache-2.0
/** Folds a person's name for equality: NFKC, accents stripped, case-folded, spaces collapsed. */
export function normalizePersonName(name: string): string | null {
  const folded = name
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toUpperCase()
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
  return folded === '' ? null : folded;
}

const UNNAMED_PERSON = 'Member';

export function personName(displayName: string | null, email: string | null): string {
  return displayName?.trim() || email?.split('@')[0] || UNNAMED_PERSON;
}
