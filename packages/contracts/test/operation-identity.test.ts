// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  operationIdFromSubjectDigest,
  operationIdMatchesSubjectDigest,
} from '../src/operation-identity.js';

/*
  The four production records are the pin, not an illustration: each pair is an `operation/<id>` item
  from `folklore-platform-prod-pool-provisioning-authority` read on 2026-09-26, the id it is keyed
  under, and the `operationSubjectDigest` the record carries. If the rule changes, these break before
  a ledger record can be written under an id that no longer matches its content.
*/
const PRODUCTION_RECORDS: ReadonlyArray<{ id: string; subjectDigest: string }> = [
  // Generation 45, succeeded.
  {
    id: 'b1328968-290f-87aa-b814-a3c571714a68',
    subjectDigest: 'b1328968290f27aa3814a3c571714a687e8758ec92ad99f516b21ee73ef12d15',
  },
  // Generation 46, authorized. Variant nibble 9: byte 8 is 0x95, so `(byte & 0x3f) | 0x80` = 0x95.
  {
    id: '2f5272a2-3001-8208-95ec-a228316c7f08',
    subjectDigest: '2f5272a23001a20895eca228316c7f081fe3de54d500412f38e34b9727ccded1',
  },
  // Generation 47, authorized.
  {
    id: 'ea0461fc-94d3-8533-8fba-ccc2bd09a247',
    subjectDigest: 'ea0461fc94d3f5330fbaccc2bd09a24785759bda2b633df6150e445790fc904c',
  },
  // Generation 48, authorized. Variant nibble 8 after clearing bit 0x40 of 0x47.
  {
    id: '0688dcef-4111-87bb-8743-9a21d1c8ae00',
    subjectDigest: '0688dcef411147bb47439a21d1c8ae00573528b36b658aa891e714c064b88f4b',
  },
];

describe('operation identity', () => {
  it('reproduces every production record', () => {
    for (const record of PRODUCTION_RECORDS) {
      expect(operationIdFromSubjectDigest(record.subjectDigest)).toBe(record.id);
      expect(operationIdMatchesSubjectDigest(record.id, record.subjectDigest)).toBe(true);
    }
  });

  it('preserves the low two bits of the variant nibble, which is what the splice-a-literal-8 copy got wrong', () => {
    // Gen-42 and gen-44 failed on this: `attemptIdFor` splices '8' into the variant position, while
    // the rule preserves bit 0x40 and so yields 9, a or b. The variant nibble follows the high nibble
    // of hex char 16.
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['0', '8'],
      ['1', '9'],
      ['2', 'a'],
      ['3', 'b'],
    ];
    for (const [high, expectedVariant] of cases) {
      const digest = `${'0'.repeat(16)}${high}${'0'.repeat(15)}`;
      const id = operationIdFromSubjectDigest(digest);
      expect(id?.split('-')[3]?.slice(0, 1)).toBe(expectedVariant);
    }
  });

  it('is total: a malformed digest has no id rather than an invented one', () => {
    for (const value of ['', 'zz', 'a'.repeat(31), 'A'.repeat(64), `${'a'.repeat(63)}g`]) {
      expect(operationIdFromSubjectDigest(value)).toBeUndefined();
      expect(operationIdMatchesSubjectDigest('123e4567-e89b-82d3-a456-426614174000', value)).toBe(
        false,
      );
    }
  });

  it('truncates a long digest to its first 16 bytes, as the control plane always has', () => {
    const digest = 'ab'.repeat(32);
    expect(operationIdFromSubjectDigest(digest)).toBe(
      operationIdFromSubjectDigest(digest.slice(0, 32)),
    );
  });

  it('refuses an id that is not the one its subject digest denotes', () => {
    const { id, subjectDigest } = PRODUCTION_RECORDS[0] as (typeof PRODUCTION_RECORDS)[number];
    const other = PRODUCTION_RECORDS[1] as (typeof PRODUCTION_RECORDS)[number];
    expect(operationIdMatchesSubjectDigest(other.id, subjectDigest)).toBe(false);
    expect(operationIdMatchesSubjectDigest(id, other.subjectDigest)).toBe(false);
  });
});
