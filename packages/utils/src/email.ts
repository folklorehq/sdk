// SPDX-License-Identifier: Apache-2.0
/** The form sign-in and directory emails are compared in. */
export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}
