// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { meProfileSchema } from '../src/me.js';

const PROFILE = {
  userId: 'usr_1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  initials: 'AL',
  orgName: 'Example',
  audiences: [{ id: 'aud_eng', name: 'Engineering' }],
};

describe('meProfileSchema', () => {
  it('accepts a viewer profile with a null email and no audiences', () => {
    expect(meProfileSchema.parse(PROFILE)).toEqual(PROFILE);
    expect(meProfileSchema.parse({ ...PROFILE, email: null, audiences: [] })).toEqual({
      ...PROFILE,
      email: null,
      audiences: [],
    });
  });

  it('rejects a payload missing audiences or carrying unknown fields', () => {
    const { audiences: _dropped, ...withoutAudiences } = PROFILE;
    expect(meProfileSchema.safeParse(withoutAudiences).success).toBe(false);
    expect(meProfileSchema.safeParse({ ...PROFILE, isAdmin: true }).success).toBe(false);
  });

  it('rejects an audience without a real id', () => {
    expect(
      meProfileSchema.safeParse({ ...PROFILE, audiences: [{ name: 'Engineering' }] }).success,
    ).toBe(false);
  });

  // The box reserves the empty id for its own all-members sentinel.
  it('rejects an audience carrying an empty id', () => {
    expect(
      meProfileSchema.safeParse({ ...PROFILE, audiences: [{ id: '', name: 'Engineering' }] })
        .success,
    ).toBe(false);
  });
});
