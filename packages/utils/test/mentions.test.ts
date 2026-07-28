// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { extractMentions } from '../src/text.js';

describe('extractMentions', () => {
  it('extracts @handle tokens', () => {
    expect(extractMentions('hey @jane and @bob-smith please review')).toEqual([
      'jane',
      'bob-smith',
    ]);
  });

  it('extracts fk-person pill slugs', () => {
    expect(extractMentions('see fk-person:jane-doe on this')).toEqual(['jane-doe']);
  });

  it('does not treat an email address as a mention', () => {
    expect(extractMentions('email me at jane@example.com')).toEqual([]);
  });

  it('lowercases and de-duplicates', () => {
    expect(extractMentions('@Jane @jane fk-person:Jane')).toEqual(['jane']);
  });

  it('returns nothing for text with no mentions', () => {
    expect(extractMentions('a plain comment')).toEqual([]);
  });
});
