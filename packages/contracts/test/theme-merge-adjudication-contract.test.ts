// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  THEME_MERGE_ADJUDICATION_MAX_PAIRS,
  THEME_MERGE_NEIGHBOR_MAX,
  synthesisQueueRequestSchema,
  themeMergeAdjudicationRequestSchema,
  themeMergeAdjudicationResultSchema,
  themeMergeAdjudicationVerdictSchema,
} from '../src/enclave.js';
import { enclaveOutputBindingForPayload } from '../src/enclave-output.js';

const ORG_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = 'a'.repeat(64);
const THEME_A = 'a'.repeat(32);
const THEME_B = 'b'.repeat(32);

function pair(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: CANDIDATE_ID,
    themeIdA: THEME_A,
    themeIdB: THEME_B,
    neighborThemeIdsA: [],
    neighborThemeIdsB: [],
    ...overrides,
  };
}

function request(pairs: unknown[] = [pair()]) {
  return { type: 'theme_merge_adjudication', requestId: REQUEST_ID, orgId: ORG_ID, pairs };
}

function verdict(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: CANDIDATE_ID,
    themeIdA: THEME_A,
    themeIdB: THEME_B,
    verdict: 'merge',
    reason: 'renamed',
    confidence: 0.85,
    ...overrides,
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    type: 'theme_merge_adjudication',
    requestId: REQUEST_ID,
    orgId: ORG_ID,
    model: 'm',
    modelRevision: 'r',
    verdicts: [verdict()],
    tokenUsage: [],
    ...overrides,
  };
}

describe('theme merge adjudication contract', () => {
  it('parses a valid request', () => {
    expect(themeMergeAdjudicationRequestSchema.safeParse(request()).success).toBe(true);
  });

  it('rejects a non-canonical pair', () => {
    const swapped = pair({ themeIdA: THEME_B, themeIdB: THEME_A });
    expect(themeMergeAdjudicationRequestSchema.safeParse(request([swapped])).success).toBe(false);
    const same = pair({ themeIdA: THEME_A, themeIdB: THEME_A });
    expect(themeMergeAdjudicationRequestSchema.safeParse(request([same])).success).toBe(false);
  });

  it('rejects more pairs than the cap', () => {
    const pairs = Array.from({ length: THEME_MERGE_ADJUDICATION_MAX_PAIRS + 1 }, () => pair());
    expect(themeMergeAdjudicationRequestSchema.safeParse(request(pairs)).success).toBe(false);
  });

  it('rejects more neighbours than the cap', () => {
    const neighbors = Array.from({ length: THEME_MERGE_NEIGHBOR_MAX + 1 }, (_, n) => `n${n}`);
    const crowded = pair({ neighborThemeIdsA: neighbors });
    expect(themeMergeAdjudicationRequestSchema.safeParse(request([crowded])).success).toBe(false);
  });

  it('accepts only a confidence quantized to 0.05', () => {
    const off = themeMergeAdjudicationVerdictSchema.safeParse(verdict({ confidence: 0.83 }));
    const on = themeMergeAdjudicationVerdictSchema.safeParse(verdict({ confidence: 0.85 }));
    expect(off.success).toBe(false);
    expect(on.success).toBe(true);
  });

  it('rejects a verdict that carries a name', () => {
    const named = themeMergeAdjudicationVerdictSchema.safeParse(verdict({ name: 'Billing' }));
    expect(named.success).toBe(false);
  });

  it('rejects a result with a stray text field', () => {
    expect(themeMergeAdjudicationResultSchema.safeParse(result()).success).toBe(true);
    const stray = themeMergeAdjudicationResultSchema.safeParse(result({ reasonText: 'free text' }));
    expect(stray.success).toBe(false);
  });

  it('joins the synthesis queue union', () => {
    expect(synthesisQueueRequestSchema.safeParse(request()).success).toBe(true);
  });

  it('binds resource ids to the candidate ids', () => {
    const identity = {
      deploymentId: 'deployment-1',
      assignmentGeneration: 3,
      nonce: '11'.repeat(32),
    };
    const payload = {
      type: 'theme_merge_adjudication',
      requestId: REQUEST_ID,
      orgId: 'org-1',
      verdicts: [{ candidateId: 'cand-b' }, { candidateId: 'cand-a' }],
    };
    const binding = enclaveOutputBindingForPayload(payload, identity);
    expect(binding.outputType).toBe('theme_merge_adjudication');
    expect(binding.outputId).toBe(REQUEST_ID);
    expect(binding.resourceIds).toEqual(['cand-a', 'cand-b']);
  });
});
