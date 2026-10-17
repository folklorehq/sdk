// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_DEFERRAL_REASONS,
  CLAUDE_INFERENCE_PURPOSES,
  CLAUDE_PRICE_MICROS_PER_MTOK,
  CLAUDE_ZDR_MODEL_IDS,
  SHADOW_FACT_IDS_MAX,
  claudeArmSchema,
  claudeEffortSchema,
  claudeInferencePurposeSchema,
  claudeQualityScoresSchema,
  inferenceUsageOutcomeSchema,
  usageCostMicros,
} from '../src/claude-inference.js';
import {
  synthesisRequestSchema,
  tokenUsageSchema,
  wikiPageStateEnvelopeSchema,
  wikiShadowArticleSchema,
  wikiSynthesisDeferredSchema,
  wikiSynthesisResultSchema,
} from '../src/enclave.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OBJECT_ID = '22222222-2222-4222-8222-222222222222';
const TOKENS_PER_MTOK = 1_000_000;
const FACT_A = '33333333-3333-4333-8333-333333333331';
const FACT_B = '33333333-3333-4333-8333-333333333332';
const AUDIENCE_ID = '44444444-4444-4444-8444-444444444444';

function factIdAt(index: number): string {
  return `33333333-3333-4333-8333-${index.toString(16).padStart(12, '0')}`;
}

function envelope(purpose: string) {
  return {
    version: 1,
    algorithm: 'ALG_AES256_GCM_IV12_TAG16_HKDF_SHA512_COMMIT_KEY_ECDSA_P384',
    orgId: ORG_ID,
    objectId: OBJECT_ID,
    purpose,
    formatVersion: 1,
    contentKeyVersion: 1,
    ciphertext: 'c2VhbGVk',
  };
}

const scores = {
  arm: 'D',
  audienceId: null,
  citationSupportBp: 9_000,
  uncitedCutBp: 100,
  importantCoverageBp: 8_000,
  revisionRateBp: 0,
  reviewFlagRateBp: 0,
};

function okShadow(overrides: Record<string, unknown> = {}) {
  return {
    arm: 'R',
    audienceId: null,
    factCount: 3,
    sensitivityFloor: 'team_scoped',
    factIds: [FACT_A, FACT_B],
    outcome: 'ok',
    variant: envelope('wiki-shadow'),
    production: envelope('wiki-shadow'),
    scores: { variant: { ...scores, arm: 'R' }, production: scores },
    ...overrides,
  };
}

const usage = {
  model: 'claude-sonnet-5-5',
  operation: 'generate',
  calls: 1,
  promptTokens: 10,
  completionTokens: 2,
};

const resultBase = {
  type: 'wiki_synthesis',
  requestId: 'req-1',
  themeId: 'theme-1',
  orgId: 'org-1',
  leaseToken: 'lease-1',
  articles: [],
  blocks: [],
  citedFactIds: [],
};

const deferredBase = {
  type: 'wiki_synthesis_deferred',
  requestId: 'req-1',
  themeId: 'theme-1',
  orgId: 'org-1',
  leaseToken: 'lease-1',
  reason: 'provider_outage',
  tokenUsage: [],
};

describe('claude inference enums', () => {
  it('lists the ZDR model ids and refuses an excluded model', () => {
    expect([...CLAUDE_ZDR_MODEL_IDS]).toEqual([
      'claude-haiku-5-5',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
    ]);
    expect(claudeInferencePurposeSchema.safeParse('wiki_section').success).toBe(true);
    expect(CLAUDE_INFERENCE_PURPOSES).toHaveLength(20);
    expect((CLAUDE_ZDR_MODEL_IDS as readonly string[]).includes('claude-fable-5-1')).toBe(false);
  });

  it('keeps efforts, arms, outcomes and deferral reasons closed', () => {
    expect(claudeEffortSchema.safeParse('max').success).toBe(false);
    expect(claudeArmSchema.safeParse('X').success).toBe(false);
    expect(inferenceUsageOutcomeSchema.options).toEqual(['ok', 'discarded', 'shadow']);
    expect([...CLAUDE_DEFERRAL_REASONS]).toEqual(['provider_outage', 'provider_slow']);
  });
});

describe('claudeQualityScoresSchema', () => {
  it('refuses a negative, fractional or out-of-range basis point', () => {
    for (const bad of [-1, 0.5, 10_001]) {
      expect(
        claudeQualityScoresSchema.safeParse({ ...scores, citationSupportBp: bad }).success,
      ).toBe(false);
    }
    expect(claudeQualityScoresSchema.safeParse(scores).success).toBe(true);
  });
});

describe('tokenUsageSchema Claude fields', () => {
  it('parses each new field with and without a value, and sets no default key', () => {
    const bare = tokenUsageSchema.parse(usage);
    for (const key of ['purpose', 'outcome', 'cacheReadTokens', 'cacheWriteTokens']) {
      expect(key in bare).toBe(false);
    }
    const full = tokenUsageSchema.parse({
      ...usage,
      purpose: 'wiki_section',
      outcome: 'ok',
      cacheReadTokens: 5,
      cacheWriteTokens: 7,
    });
    expect(full).toMatchObject({
      purpose: 'wiki_section',
      outcome: 'ok',
      cacheReadTokens: 5,
      cacheWriteTokens: 7,
    });
    expect(tokenUsageSchema.parse({ ...usage, purpose: 'untagged' }).purpose).toBe('untagged');
  });

  it('refuses negatives, fractions, an unknown purpose and an unknown outcome', () => {
    for (const patch of [
      { cacheReadTokens: -1 },
      { cacheWriteTokens: 1.5 },
      { purpose: 'free_text_purpose' },
      { outcome: 'refunded' },
    ]) {
      expect(tokenUsageSchema.safeParse({ ...usage, ...patch }).success).toBe(false);
    }
  });
});

describe('page states on a synthesis result', () => {
  it('accepts a page-state envelope and refuses another purpose', () => {
    expect(
      wikiPageStateEnvelopeSchema.safeParse({
        audienceId: null,
        envelope: envelope('wiki-page-state'),
      }).success,
    ).toBe(true);
    expect(
      wikiPageStateEnvelopeSchema.safeParse({ audienceId: null, envelope: envelope('wiki-block') })
        .success,
    ).toBe(false);
  });

  it('refuses a plaintext key on pageStates, and drops shadowArticles that carry one', () => {
    const state = { audienceId: null, envelope: envelope('wiki-page-state') };
    for (const key of ['text', 'facts', 'body', 'bodyDigest']) {
      expect(
        wikiSynthesisResultSchema.safeParse({
          ...resultBase,
          pageStates: [{ ...state, [key]: 'x' }],
        }).success,
        `pageStates ${key}`,
      ).toBe(false);
      const dropped = wikiSynthesisResultSchema.safeParse({
        ...resultBase,
        shadowArticles: [okShadow({ [key]: 'x' })],
      });
      expect(dropped.success, `shadowArticles ${key}`).toBe(true);
      expect(dropped.data?.shadowArticles, `shadowArticles ${key}`).toBeUndefined();
    }
    expect(
      wikiSynthesisResultSchema.safeParse({
        ...resultBase,
        pageStates: [state],
        shadowArticles: [okShadow()],
        qualityScores: [scores],
        untaggedCalls: 2,
      }).success,
    ).toBe(true);
  });

  it('drops qualityScores that carry a plaintext key, and refuses a fractional untaggedCalls', () => {
    const dropped = wikiSynthesisResultSchema.safeParse({
      ...resultBase,
      qualityScores: [{ ...scores, text: 'x' }],
    });
    expect(dropped.success).toBe(true);
    expect(dropped.data?.qualityScores).toBeUndefined();
    expect(wikiSynthesisResultSchema.safeParse({ ...resultBase, untaggedCalls: 0.5 }).success).toBe(
      false,
    );
  });

  it('reads an optional boolean reused flag on a score and drops the scores when it is not a boolean', () => {
    const reused = wikiSynthesisResultSchema.parse({
      ...resultBase,
      qualityScores: [{ ...scores, reused: true }],
    });
    expect(reused.qualityScores).toEqual([{ ...scores, reused: true }]);
    const unreadable = wikiSynthesisResultSchema.safeParse({
      ...resultBase,
      qualityScores: [{ ...scores, reused: 'yes' }],
    });
    expect(unreadable.success).toBe(true);
    expect(unreadable.data?.qualityScores).toBeUndefined();
  });

  it('keeps the production page when a shadow extra is unreadable, and keeps a readable one', () => {
    const unreadable = wikiSynthesisResultSchema.safeParse({
      ...resultBase,
      qualityScores: [{ arm: 'Z' }],
      shadowArticles: 'not an array',
      pageStates: [{ audienceId: null, envelope: envelope('wiki-page-state') }],
    });
    expect(unreadable.success).toBe(true);
    expect(unreadable.data?.qualityScores).toBeUndefined();
    expect(unreadable.data?.shadowArticles).toBeUndefined();
    expect(unreadable.data?.pageStates).toHaveLength(1);

    const readable = wikiSynthesisResultSchema.parse({
      ...resultBase,
      qualityScores: [scores],
      shadowArticles: [okShadow()],
    });
    expect(readable.qualityScores).toEqual([scores]);
    expect(readable.shadowArticles).toHaveLength(1);
  });

  it('parses a result without the new fields and sets no new keys', () => {
    const parsed = wikiSynthesisResultSchema.parse(resultBase);
    for (const key of ['pageStates', 'shadowArticles', 'qualityScores', 'untaggedCalls']) {
      expect(key in parsed).toBe(false);
    }
  });
});

describe('shadow articles', () => {
  it('refuses an article without sensitivityFloor or factIds, and one with too many fact ids', () => {
    const { sensitivityFloor: _floor, ...noFloor } = okShadow();
    const { factIds: _ids, ...noIds } = okShadow();
    expect(wikiShadowArticleSchema.safeParse(noFloor).success).toBe(false);
    expect(wikiShadowArticleSchema.safeParse(noIds).success).toBe(false);
    const atCap = Array.from({ length: SHADOW_FACT_IDS_MAX }, (_v, i) => factIdAt(i));
    expect(wikiShadowArticleSchema.safeParse(okShadow({ factIds: atCap })).success).toBe(true);
    expect(SHADOW_FACT_IDS_MAX).toBe(400);
    expect(
      wikiShadowArticleSchema.safeParse(
        okShadow({ factIds: [...atCap, factIdAt(SHADOW_FACT_IDS_MAX)] }),
      ).success,
    ).toBe(false);
  });

  it('refuses a non-UUID fact id or audience id, so a malformed arm cannot reach the database', () => {
    expect(wikiShadowArticleSchema.safeParse(okShadow({ factIds: ['not-a-uuid'] })).success).toBe(
      false,
    );
    expect(wikiShadowArticleSchema.safeParse(okShadow({ audienceId: 'not-a-uuid' })).success).toBe(
      false,
    );
    expect(wikiShadowArticleSchema.safeParse(okShadow({ audienceId: AUDIENCE_ID })).success).toBe(
      true,
    );
  });

  it('refuses a non-UUID audience on the quality scores of an arm', () => {
    const arm = { ...scores, arm: 'R' };
    expect(claudeQualityScoresSchema.safeParse({ ...arm, audienceId: 'not-a-uuid' }).success).toBe(
      false,
    );
    expect(claudeQualityScoresSchema.safeParse({ ...arm, audienceId: AUDIENCE_ID }).success).toBe(
      true,
    );
  });

  it('parses a failed arm with no envelopes, and refuses one that carries any', () => {
    const failed = {
      arm: 'B',
      audienceId: null,
      factCount: 3,
      sensitivityFloor: 'team_scoped',
      factIds: [FACT_A],
      outcome: 'failed',
    };
    expect(wikiShadowArticleSchema.safeParse(failed).success).toBe(true);
    expect(
      wikiShadowArticleSchema.safeParse({ ...failed, variant: envelope('wiki-shadow') }).success,
    ).toBe(false);
    expect(
      wikiShadowArticleSchema.safeParse({ ...failed, scores: okShadow().scores }).success,
    ).toBe(false);
  });

  it('refuses an ok arm missing production, a variant for another purpose, and arm D', () => {
    const { production: _production, ...noProduction } = okShadow();
    expect(wikiShadowArticleSchema.safeParse(noProduction).success).toBe(false);
    expect(
      wikiShadowArticleSchema.safeParse(okShadow({ variant: envelope('wiki-block') })).success,
    ).toBe(false);
    expect(wikiShadowArticleSchema.safeParse(okShadow({ arm: 'D' })).success).toBe(false);
  });
});

describe('wikiSynthesisDeferredSchema', () => {
  it('parses provider_outage and provider_slow and refuses any other reason', () => {
    expect(wikiSynthesisDeferredSchema.safeParse(deferredBase).success).toBe(true);
    expect(
      wikiSynthesisDeferredSchema.safeParse({ ...deferredBase, reason: 'provider_slow' }).success,
    ).toBe(true);
    expect(
      wikiSynthesisDeferredSchema.safeParse({ ...deferredBase, reason: 'other' }).success,
    ).toBe(false);
  });

  it('refuses the whole output for a malformed usage entry instead of coercing it to []', () => {
    for (const entry of [
      { ...usage, note: 'extra key' },
      { ...usage, promptTokens: -1 },
    ]) {
      expect(
        wikiSynthesisDeferredSchema.safeParse({ ...deferredBase, tokenUsage: [entry] }).success,
      ).toBe(false);
    }
    const parsed = wikiSynthesisResultSchema.parse({
      ...resultBase,
      tokenUsage: [{ ...usage, note: 'extra key' }],
    });
    expect(parsed.tokenUsage).toEqual([]);
  });

  it('refuses unknown keys', () => {
    expect(wikiSynthesisDeferredSchema.safeParse({ ...deferredBase, text: 'x' }).success).toBe(
      false,
    );
  });
});

describe('synthesisRequestSchema previous page states and shadow arms', () => {
  const request = {
    type: 'wiki_synthesis',
    requestId: 'req-1',
    themeId: 'theme-1',
    orgId: 'org-1',
    leaseToken: 'lease-1',
    themeName: 'Theme',
    themeType: 'concept',
    parentThemeCount: 0,
    factRefs: [],
    relatedThemes: [],
    contributorCount: 1,
    audiences: [],
  };
  const state = { audienceId: null, envelope: envelope('wiki-page-state') };

  it('accepts both fields optionally and sets no default key', () => {
    const bare = synthesisRequestSchema.parse(request);
    expect('previousPageStates' in bare).toBe(false);
    expect('shadowArms' in bare).toBe(false);
    const full = synthesisRequestSchema.parse({
      ...request,
      previousPageStates: [state],
      shadowArms: ['R', 'B'],
    });
    expect(full.shadowArms).toEqual(['R', 'B']);
  });

  it('caps states at 8 and arms at 2, and refuses the production arm', () => {
    expect(
      synthesisRequestSchema.safeParse({
        ...request,
        previousPageStates: Array.from({ length: 9 }, () => state),
      }).success,
    ).toBe(false);
    expect(
      synthesisRequestSchema.safeParse({ ...request, shadowArms: ['R', 'B', 'R'] }).success,
    ).toBe(false);
    expect(synthesisRequestSchema.safeParse({ ...request, shadowArms: ['D'] }).success).toBe(false);
  });

  it('refuses a repeated shadow arm and accepts each distinct pair', () => {
    expect(synthesisRequestSchema.safeParse({ ...request, shadowArms: ['R', 'R'] }).success).toBe(
      false,
    );
    expect(synthesisRequestSchema.safeParse({ ...request, shadowArms: ['B', 'B'] }).success).toBe(
      false,
    );
    expect(synthesisRequestSchema.safeParse({ ...request, shadowArms: ['R', 'B'] }).success).toBe(
      true,
    );
  });
});

describe('usageCostMicros', () => {
  it('prices each Claude model exactly, per token class', () => {
    for (const [model, prices] of Object.entries(CLAUDE_PRICE_MICROS_PER_MTOK)) {
      const base = { model, promptTokens: 0, completionTokens: 0 };
      expect(usageCostMicros({ ...base, promptTokens: TOKENS_PER_MTOK })).toBe(prices.input);
      expect(usageCostMicros({ ...base, completionTokens: TOKENS_PER_MTOK })).toBe(prices.output);
      expect(usageCostMicros({ ...base, cacheReadTokens: TOKENS_PER_MTOK })).toBe(prices.cacheRead);
      expect(usageCostMicros({ ...base, cacheWriteTokens: TOKENS_PER_MTOK })).toBe(
        prices.cacheWrite,
      );
    }
    expect(CLAUDE_PRICE_MICROS_PER_MTOK['claude-sonnet-5-5'].output).toBe(11_000_000);
  });

  it('sums the classes at their own prices and rounds the total up', () => {
    expect(
      usageCostMicros({
        model: 'claude-sonnet-5-5',
        promptTokens: 1_000,
        completionTokens: 500,
        cacheReadTokens: 10_000,
        cacheWriteTokens: 2_000,
      }),
    ).toBe(2_200 + 5_500 + 2_200 + 5_500);
    expect(
      usageCostMicros({
        model: 'claude-haiku-5-5',
        promptTokens: 0,
        completionTokens: 0,
        cacheReadTokens: 1,
      }),
    ).toBe(1);
  });

  it('is exact where float arithmetic would round a whole total up', () => {
    expect(
      usageCostMicros({ model: 'claude-opus-5-5', promptTokens: 5, completionTokens: 0 }),
    ).toBe(22);
  });

  it('is 0 for a model that is not a Claude model', () => {
    for (const model of ['phala/glm-5.3', 'z-ai/glm-5.2', 'toString', 'unknown']) {
      expect(
        usageCostMicros({
          model,
          promptTokens: TOKENS_PER_MTOK,
          completionTokens: TOKENS_PER_MTOK,
        }),
      ).toBe(0);
    }
  });
  it.each([
    ['a negative prompt count', { promptTokens: -1, completionTokens: 0 }],
    ['a negative completion count', { promptTokens: 0, completionTokens: -1 }],
    ['a fractional count', { promptTokens: 1.5, completionTokens: 0 }],
    ['NaN', { promptTokens: Number.NaN, completionTokens: 0 }],
    ['Infinity', { promptTokens: Number.POSITIVE_INFINITY, completionTokens: 0 }],
    ['an unsafe integer', { promptTokens: Number.MAX_SAFE_INTEGER + 1, completionTokens: 0 }],
    ['a negative cache read', { promptTokens: 0, completionTokens: 0, cacheReadTokens: -1 }],
    ['a fractional cache write', { promptTokens: 0, completionTokens: 0, cacheWriteTokens: 0.5 }],
  ])('throws claude_usage_tokens_invalid for %s', (_name, counts) => {
    expect(() => usageCostMicros({ model: 'claude-sonnet-5-5', ...counts })).toThrow(
      'claude_usage_tokens_invalid',
    );
    expect(() => usageCostMicros({ model: 'phala/glm-5.3', ...counts })).toThrow(
      'claude_usage_tokens_invalid',
    );
  });

  it('accepts zero counts and the largest safe integer', () => {
    expect(
      usageCostMicros({ model: 'claude-haiku-5-5', promptTokens: 0, completionTokens: 0 }),
    ).toBe(0);
    expect(
      usageCostMicros({
        model: 'claude-haiku-5-5',
        promptTokens: Number.MAX_SAFE_INTEGER,
        completionTokens: 0,
      }),
    ).toBeGreaterThan(0);
  });
});
