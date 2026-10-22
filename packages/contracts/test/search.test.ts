// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ANSWER_DEFAULT_LIMIT,
  ANSWER_MAX_LIMIT,
  abstainReasonSchema,
  answerRequestSchema,
  answerResponseSchema,
} from '../src/search.js';

const AUDIENCE = '11111111-1111-4111-8111-111111111111';

describe('answerRequestSchema', () => {
  it('defaults the limit to 8', () => {
    expect(ANSWER_DEFAULT_LIMIT).toBe(8);
    expect(answerRequestSchema.parse({ q: 'who owns billing?' }).limit).toBe(8);
  });

  it('clamps a limit of 9999 to 20', () => {
    expect(ANSWER_MAX_LIMIT).toBe(20);
    expect(answerRequestSchema.parse({ q: 'x', limit: 9999 }).limit).toBe(20);
  });

  it('coerces a string limit and rejects a non-positive one', () => {
    expect(answerRequestSchema.parse({ q: 'x', limit: '5' }).limit).toBe(5);
    expect(answerRequestSchema.safeParse({ q: 'x', limit: 0 }).success).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(answerRequestSchema.safeParse({ q: 'x', foo: 1 }).success).toBe(false);
    expect(answerRequestSchema.safeParse({ q: 'x', audienceId: AUDIENCE }).success).toBe(false);
  });

  it('accepts a uuid audience and rejects anything else', () => {
    expect(answerRequestSchema.parse({ q: 'x', audience: AUDIENCE }).audience).toBe(AUDIENCE);
    expect(answerRequestSchema.safeParse({ q: 'x', audience: '' }).success).toBe(false);
    expect(answerRequestSchema.safeParse({ q: 'x', audience: 'aud_eng' }).success).toBe(false);
  });

  it('parses without an audience key at all', () => {
    expect(answerRequestSchema.parse({ q: 'x' })).toEqual({ q: 'x', limit: 8 });
  });

  it('rejects a blank question', () => {
    expect(answerRequestSchema.safeParse({ q: '   ' }).success).toBe(false);
  });
});

describe('abstain reasons', () => {
  it('parses outside_lens as an abstain reason', () => {
    expect(abstainReasonSchema.parse('outside_lens')).toBe('outside_lens');
    expect(
      answerResponseSchema.parse({
        query: 'q',
        answer: 'a',
        citations: [],
        grounded: false,
        abstainReason: 'outside_lens',
      }),
    ).toMatchObject({ abstainReason: 'outside_lens' });
  });

  it('cannot carry an abstain reason on a grounded answer', () => {
    const grounded = answerResponseSchema.parse({
      query: 'q',
      answer: 'a',
      citations: [],
      grounded: true,
      abstainReason: 'no_context',
    });
    expect(grounded).not.toHaveProperty('abstainReason');
  });
});
