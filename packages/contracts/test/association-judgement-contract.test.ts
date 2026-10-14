// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ASSOCIATION_JUDGEMENT_MAX_CONTEXT_FACTS,
  ASSOCIATION_JUDGEMENT_MAX_ITEMS,
  ASSOCIATION_JUDGEMENT_S3_KEY_MAX,
  ASSOCIATION_JUDGEMENT_THEME_NAME_MAX,
  associationJudgementItemSchema,
  associationJudgementRequestSchema,
  associationJudgementResultSchema,
  synthesisQueueRequestSchema,
} from '../src/enclave.js';

const ORG_ID = '33333333-3333-4333-8333-333333333333';
const SCORE_ID = '11111111-1111-4111-8111-111111111111';
const FACT_ID = '22222222-2222-4222-8222-222222222222';
const CONTAINER_ID = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = 'a'.repeat(64);

function factRef(n: number, sensitivity: 'public' | 'team_scoped' = 'public') {
  return {
    factId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    s3Key: `facts/${n}`,
    sensitivity,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    scoreId: SCORE_ID,
    fact: { factId: FACT_ID, s3Key: 'facts/subject', sensitivity: 'public' },
    containerId: CONTAINER_ID,
    containerLabel: 'slack_channel',
    themeName: null,
    contextFacts: [],
    ...overrides,
  };
}

function request(items: unknown[] = [item()], overrides: Record<string, unknown> = {}) {
  return {
    type: 'association_judgement',
    requestId: REQUEST_ID,
    orgId: ORG_ID,
    items,
    ...overrides,
  };
}

function verdict(overrides: Record<string, unknown> = {}) {
  return {
    scoreId: SCORE_ID,
    factId: FACT_ID,
    containerId: CONTAINER_ID,
    verdict: 'assign',
    confidence: 0.85,
    ...overrides,
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    type: 'association_judgement',
    requestId: REQUEST_ID,
    orgId: ORG_ID,
    model: 'judge-model',
    modelRevision: 'rev-1',
    verdicts: [verdict()],
    tokenUsage: [],
    ...overrides,
  };
}

describe('associationJudgementRequestSchema', () => {
  it('accepts 1 and the maximum number of items', () => {
    expect(associationJudgementRequestSchema.safeParse(request([item()])).success).toBe(true);
    const full = Array.from({ length: ASSOCIATION_JUDGEMENT_MAX_ITEMS }, () => item());
    expect(associationJudgementRequestSchema.safeParse(request(full)).success).toBe(true);
  });

  it('rejects no items and one item over the maximum', () => {
    expect(associationJudgementRequestSchema.safeParse(request([])).success).toBe(false);
    const over = Array.from({ length: ASSOCIATION_JUDGEMENT_MAX_ITEMS + 1 }, () => item());
    expect(associationJudgementRequestSchema.safeParse(request(over)).success).toBe(false);
  });

  it('rejects one context fact over the maximum', () => {
    const contextFacts = Array.from(
      { length: ASSOCIATION_JUDGEMENT_MAX_CONTEXT_FACTS + 1 },
      (_, n) => factRef(n + 1),
    );
    expect(associationJudgementItemSchema.safeParse(item({ contextFacts })).success).toBe(false);
    expect(
      associationJudgementItemSchema.safeParse(
        item({ contextFacts: contextFacts.slice(0, ASSOCIATION_JUDGEMENT_MAX_CONTEXT_FACTS) }),
      ).success,
    ).toBe(true);
  });

  it('rejects a container label outside the closed vocabulary', () => {
    expect(
      associationJudgementItemSchema.safeParse(item({ containerLabel: 'Project Zephyr' })).success,
    ).toBe(false);
  });

  it('bounds the theme name and the S3 key', () => {
    const longName = 'n'.repeat(ASSOCIATION_JUDGEMENT_THEME_NAME_MAX + 1);
    expect(associationJudgementItemSchema.safeParse(item({ themeName: longName })).success).toBe(
      false,
    );
    const atBound = 'n'.repeat(ASSOCIATION_JUDGEMENT_THEME_NAME_MAX);
    expect(associationJudgementItemSchema.safeParse(item({ themeName: atBound })).success).toBe(
      true,
    );
    const longKey = { ...factRef(9), s3Key: 'k'.repeat(ASSOCIATION_JUDGEMENT_S3_KEY_MAX + 1) };
    expect(associationJudgementItemSchema.safeParse(item({ fact: longKey })).success).toBe(false);
  });

  it('rejects an unknown key on an item', () => {
    expect(associationJudgementItemSchema.safeParse(item({ body: 'text' })).success).toBe(false);
  });

  it('rejects an unknown key on the request', () => {
    expect(
      associationJudgementRequestSchema.safeParse(request([item()], { leaseToken: 'x' })).success,
    ).toBe(false);
  });

  it('rejects an unknown key on a fact ref', () => {
    const subject = { ...factRef(9), excerpt: 'text' };
    expect(associationJudgementItemSchema.safeParse(item({ fact: subject })).success).toBe(false);
  });

  it.each(['restricted', 'confidential'])('rejects a %s subject fact', (sensitivity) => {
    const subject = { ...factRef(9), sensitivity };
    expect(associationJudgementItemSchema.safeParse(item({ fact: subject })).success).toBe(false);
  });

  it('rejects a context fact more sensitive than the subject', () => {
    const parsed = associationJudgementItemSchema.safeParse(
      item({ contextFacts: [factRef(1, 'team_scoped')] }),
    );
    expect(parsed.success).toBe(false);
  });

  it('accepts a context fact at or below the subject sensitivity', () => {
    const subject = factRef(9, 'team_scoped');
    const parsed = associationJudgementItemSchema.safeParse(
      item({ fact: subject, contextFacts: [factRef(1, 'public'), factRef(2, 'team_scoped')] }),
    );
    expect(parsed.success).toBe(true);
  });

  it.each(['', 'short', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(65)])(
    'rejects the request id %j',
    (requestId) => {
      expect(
        associationJudgementRequestSchema.safeParse(request([item()], { requestId })).success,
      ).toBe(false);
    },
  );

  it('is not a member of the enclave synthesis queue union', () => {
    expect(synthesisQueueRequestSchema.safeParse(request()).success).toBe(false);
  });
});

describe('associationJudgementResultSchema', () => {
  it('accepts a quantized confidence', () => {
    expect(associationJudgementResultSchema.safeParse(result()).success).toBe(true);
  });

  it('rejects an unknown verdict', () => {
    const verdicts = [verdict({ verdict: 'merge' })];
    expect(associationJudgementResultSchema.safeParse(result({ verdicts })).success).toBe(false);
  });

  it('rejects a confidence above 1', () => {
    const verdicts = [verdict({ confidence: 1.01 })];
    expect(associationJudgementResultSchema.safeParse(result({ verdicts })).success).toBe(false);
  });

  it('rejects a confidence that is not a multiple of 0.05', () => {
    const verdicts = [verdict({ confidence: 0.83 })];
    expect(associationJudgementResultSchema.safeParse(result({ verdicts })).success).toBe(false);
  });

  it('accepts the bounds 0 and 1', () => {
    const verdicts = [verdict({ confidence: 0 }), verdict({ confidence: 1 })];
    expect(associationJudgementResultSchema.safeParse(result({ verdicts })).success).toBe(true);
  });

  it('rejects a result request id that is not a sha256 hex digest', () => {
    expect(
      associationJudgementResultSchema.safeParse(result({ requestId: 'request-1' })).success,
    ).toBe(false);
  });

  it('rejects a model longer than 128 characters', () => {
    expect(
      associationJudgementResultSchema.safeParse(result({ model: 'm'.repeat(129) })).success,
    ).toBe(false);
    expect(
      associationJudgementResultSchema.safeParse(result({ model: 'm'.repeat(128) })).success,
    ).toBe(true);
  });

  it('rejects any extra field on the result and on a verdict', () => {
    expect(associationJudgementResultSchema.safeParse(result({ text: 'prose' })).success).toBe(
      false,
    );
    const verdicts = [verdict({ reason: 'prose' })];
    expect(associationJudgementResultSchema.safeParse(result({ verdicts })).success).toBe(false);
  });

  it('rejects more verdicts than the request maximum', () => {
    const verdicts = Array.from({ length: ASSOCIATION_JUDGEMENT_MAX_ITEMS + 1 }, () => verdict());
    expect(associationJudgementResultSchema.safeParse(result({ verdicts })).success).toBe(false);
  });
});
