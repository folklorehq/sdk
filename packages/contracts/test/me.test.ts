// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { audienceLensIdSchema, meProfileSchema } from '../src/me.js';

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

describe('audienceLensIdSchema', () => {
  const LENS_ID = '3f2b8c1e-9d4a-4e6b-8a57-0c1d2e3f4a5b';

  it('accepts a uuid', () => {
    expect(audienceLensIdSchema.parse(LENS_ID)).toBe(LENS_ID);
  });

  it('lowercases an uppercase uuid', () => {
    expect(audienceLensIdSchema.parse(LENS_ID.toUpperCase())).toBe(LENS_ID);
  });

  it.each([
    ['the empty all-members sentinel', ''],
    ['a non-uuid audience id', 'aud_eng'],
    ['a uuid with a trailing space', `${LENS_ID} `],
  ])('rejects %s', (_label, value) => {
    expect(audienceLensIdSchema.safeParse(value).success).toBe(false);
  });
});
