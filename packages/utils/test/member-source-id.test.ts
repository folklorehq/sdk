// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  MEMBER_FACT_ID_NAMESPACE,
  deriveMemberSourceId,
  deterministicUuid,
  deriveSourceId,
  memberFactKey,
  type KeyedSourceFactId,
} from '../src/index.js';

const ORG = '99999999-9999-4999-8999-999999999999';
const OTHER_ORG = '88888888-8888-4888-8888-888888888888';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER_OWNER = '22222222-2222-4222-8222-222222222222';
const UPPERCASE_UUID = 'ABCDEFAB-1111-4111-8111-111111111111';
const KIND = 'google_calendar';
const KEYED_FACT_ID = 'hmac-1' as KeyedSourceFactId;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PINNED_MEMBER_SOURCE_ID = 'bfbe522b-b399-57ed-ac12-39ee50e8f900';

describe('deriveMemberSourceId', () => {
  it('is deterministic', () => {
    expect(deriveMemberSourceId(ORG, KIND, OWNER)).toBe(deriveMemberSourceId(ORG, KIND, OWNER));
  });

  it('is pinned to a stable value', () => {
    expect(deriveMemberSourceId(ORG, KIND, OWNER)).toBe(PINNED_MEMBER_SOURCE_ID);
  });

  it('never equals the org source id for the same kind', () => {
    expect(deriveMemberSourceId(ORG, KIND, OWNER)).not.toBe(deriveSourceId(ORG, KIND));
  });

  it('cannot be reproduced by an org source id whose kind spells out the member path', () => {
    expect(deriveSourceId(ORG, `${KIND}/member/${OWNER}`)).not.toBe(
      deriveMemberSourceId(ORG, KIND, OWNER),
    );
  });

  it('differs per owner', () => {
    expect(deriveMemberSourceId(ORG, KIND, OWNER)).not.toBe(
      deriveMemberSourceId(ORG, KIND, OTHER_OWNER),
    );
  });

  it('differs per org', () => {
    expect(deriveMemberSourceId(ORG, KIND, OWNER)).not.toBe(
      deriveMemberSourceId(OTHER_ORG, KIND, OWNER),
    );
  });

  it('differs per kind', () => {
    expect(deriveMemberSourceId(ORG, KIND, OWNER)).not.toBe(
      deriveMemberSourceId(ORG, 'gmail', OWNER),
    );
  });

  it('has the RFC-4122 8-4-4-4-12 shape', () => {
    expect(deriveMemberSourceId(ORG, KIND, OWNER)).toMatch(UUID_SHAPE);
  });

  it('leaves the org source id unchanged', () => {
    expect(deriveSourceId(ORG, KIND)).toBe('d6e9ee3c-0e1e-9342-1a4d-6148b3f10062');
  });

  it.each([
    ['a kind with a path separator', ORG, 'google_calendar/member', OWNER],
    ['an uppercase kind', ORG, 'Google_Calendar', OWNER],
    ['an empty kind', ORG, '', OWNER],
    ['a kind with a NUL byte', ORG, 'google\0calendar', OWNER],
    ['a non-uuid org', 'org-1', KIND, OWNER],
    ['an uppercase org uuid', UPPERCASE_UUID, KIND, OWNER],
    ['a non-uuid owner', ORG, KIND, 'owner-1'],
    ['an uppercase owner uuid', ORG, KIND, UPPERCASE_UUID],
  ])('refuses %s', (_label, orgId, kind, ownerAccountId) => {
    expect(() => deriveMemberSourceId(orgId, kind, ownerAccountId)).toThrow(/deriveMemberSourceId/);
  });
});

describe('memberFactKey', () => {
  it('scopes the keyed source fact id by org, kind, and owner', () => {
    expect(memberFactKey(ORG, KIND, OWNER, KEYED_FACT_ID)).toBe(
      `${ORG}:${KIND}:member:${OWNER}:hmac-1`,
    );
  });

  it('differs per owner', () => {
    expect(memberFactKey(ORG, KIND, OWNER, KEYED_FACT_ID)).not.toBe(
      memberFactKey(ORG, KIND, OTHER_OWNER, KEYED_FACT_ID),
    );
  });

  it('hashes to a different fact id than an org fact whose source id spells out the member key', () => {
    const memberFactId = deterministicUuid(
      MEMBER_FACT_ID_NAMESPACE,
      memberFactKey(ORG, KIND, OWNER, KEYED_FACT_ID),
    );
    const orgFactId = deterministicUuid('fact', `${ORG}:${KIND}:member:${OWNER}:${KEYED_FACT_ID}`);
    expect(memberFactId).not.toBe(orgFactId);
  });

  it('differs per org', () => {
    expect(memberFactKey(ORG, KIND, OWNER, KEYED_FACT_ID)).not.toBe(
      memberFactKey(OTHER_ORG, KIND, OWNER, KEYED_FACT_ID),
    );
  });

  it.each([
    ['a kind with a separator', ORG, 'google:calendar', OWNER],
    ['an uppercase org uuid', UPPERCASE_UUID, KIND, OWNER],
    ['an uppercase owner uuid', ORG, KIND, UPPERCASE_UUID],
  ])('refuses %s', (_label, orgId, kind, ownerAccountId) => {
    expect(() => memberFactKey(orgId, kind, ownerAccountId, KEYED_FACT_ID)).toThrow(
      /memberFactKey/,
    );
  });
});
