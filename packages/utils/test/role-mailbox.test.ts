// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isRoleMailbox } from '../src/index.js';

describe('isRoleMailbox', () => {
  it.each([
    'support@acme.com',
    'SUPPORT@acme.com',
    'support+eu@acme.com',
    'no_reply@acme.com',
    'do.not.reply@acme.com',
    'mailer-daemon@acme.com',
  ])('treats %s as a role mailbox', (email) => {
    expect(isRoleMailbox(email)).toBe(true);
  });

  it.each(['alice@acme.com', 'alice.support@acme.com', 'bob+support@acme.com', 'ops2@acme.com'])(
    'does not treat %s as a role mailbox',
    (email) => {
      expect(isRoleMailbox(email)).toBe(false);
    },
  );

  it('treats an address with no local part as a role mailbox so it is never suggested', () => {
    expect(isRoleMailbox('@acme.com')).toBe(true);
  });
});
