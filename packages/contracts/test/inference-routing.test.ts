// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_DEFERRAL_REASONS,
  CLAUDE_INFERENCE_PURPOSES,
  claudeArmSchema,
  claudeEffortSchema,
  claudeInferencePurposeSchema,
} from '../src/claude-inference.js';
import {
  COMPILED_DEFAULT_ROUTING,
  PAGE_CHECK_CONFIG_PURPOSES,
  PAGE_CONFIG_PURPOSES,
} from '../src/inference-routing-defaults.js';
import { isInferenceModelId } from '../src/inference-catalog.js';
import {
  INFERENCE_CHECKER_RULES,
  INFERENCE_CHECK_PURPOSES,
  INFERENCE_DEFERRAL_REASONS,
  INFERENCE_LONG_PURPOSES,
  INFERENCE_PURPOSES,
  INFERENCE_PURPOSE_CLASS,
  INFERENCE_PURPOSE_MIN_TRUST,
  INFERENCE_TENANT_TIERS,
  INFERENCE_TENANT_TIER_MIN_TRUST,
  INFERENCE_WRITING_PURPOSES,
  ROUTABLE_INFERENCE_PROVIDERS,
  ROUTING_OVERRIDE_ORG_ID_SHA256S,
  inferenceArmSchema,
  inferenceEffortSchema,
  inferencePurposeSchema,
  inferenceUsageOutcomeSchema,
  type InferenceCheckPurpose,
} from '../src/inference-routing.js';

describe('the provider-neutral routing vocabulary', () => {
  it('lists the 29 purposes in the order the Claude route always had', () => {
    expect(INFERENCE_PURPOSES).toEqual([
      'wiki_outline',
      'wiki_section',
      'wiki_revise',
      'wiki_visual_warrant',
      'wiki_visual_draw',
      'wiki_article',
      'team_onboarding',
      'wiki_review',
      'wiki_critique',
      'citation_check',
      'theme_merge',
      'wiki_relevance',
      'wiki_recovery',
      'wiki_repair',
      'theme_tagging',
      'theme_topic_naming',
      'theme_aggregate_naming',
      'theme_doctype',
      'association_judge',
      'answer',
      'wiki_delta',
      'wiki_section_add',
      'wiki_section_long',
      'wiki_outline_long',
      'wiki_page_check',
      'wiki_page_revise',
      'wiki_article_check',
      'wiki_article_long',
      'team_onboarding_long',
    ]);
  });

  it('accepts exactly the purposes, efforts, arms and outcomes it lists', () => {
    for (const purpose of INFERENCE_PURPOSES) {
      expect(inferencePurposeSchema.safeParse(purpose).success).toBe(true);
    }
    expect(inferencePurposeSchema.safeParse('wiki_unknown').success).toBe(false);
    expect(inferenceEffortSchema.options).toEqual(['low', 'medium', 'high']);
    expect(inferenceArmSchema.options).toEqual(['D', 'R', 'B']);
    expect(inferenceUsageOutcomeSchema.options).toEqual(['ok', 'discarded', 'shadow']);
    expect(INFERENCE_DEFERRAL_REASONS).toEqual(['provider_outage', 'provider_slow']);
  });

  it('keeps the old Claude names pointing at the same values', () => {
    expect(CLAUDE_INFERENCE_PURPOSES).toBe(INFERENCE_PURPOSES);
    expect(claudeInferencePurposeSchema).toBe(inferencePurposeSchema);
    expect(claudeEffortSchema).toBe(inferenceEffortSchema);
    expect(claudeArmSchema).toBe(inferenceArmSchema);
    expect(CLAUDE_DEFERRAL_REASONS).toBe(INFERENCE_DEFERRAL_REASONS);
  });
});

describe('COMPILED_DEFAULT_ROUTING', () => {
  it('routes every purpose to an anthropic catalog model', () => {
    expect(Object.keys(COMPILED_DEFAULT_ROUTING.purposes).sort()).toEqual(
      [...INFERENCE_PURPOSES].sort(),
    );
    for (const target of Object.values(COMPILED_DEFAULT_ROUTING.purposes)) {
      expect(target.provider).toBe('anthropic');
      expect(isInferenceModelId(target.model)).toBe(true);
      expect(inferenceEffortSchema.safeParse(target.effort).success).toBe(true);
    }
  });

  it('is frozen all the way down', () => {
    const frozen = (value: unknown): boolean =>
      typeof value !== 'object' ||
      value === null ||
      (Object.isFrozen(value) && Object.values(value).every(frozen));
    expect(frozen(COMPILED_DEFAULT_ROUTING)).toBe(true);
  });

  it('keeps the writing and checking models apart', () => {
    const { purposes } = COMPILED_DEFAULT_ROUTING;
    expect(purposes.wiki_review.model).not.toBe(purposes.wiki_section.model);
    expect(purposes.wiki_critique.model).not.toBe(purposes.wiki_article.model);
  });
});

describe('routing purpose sets and classes', () => {
  it('maps every purpose to exactly one class, with the plan membership', () => {
    expect(Object.keys(INFERENCE_PURPOSE_CLASS).sort()).toEqual([...INFERENCE_PURPOSES].sort());
    const byClass = (purposeClass: string) =>
      INFERENCE_PURPOSES.filter((purpose) => INFERENCE_PURPOSE_CLASS[purpose] === purposeClass);
    expect(byClass('interactive')).toEqual(['answer']);
    expect(byClass('large').sort()).toEqual([
      'team_onboarding',
      'team_onboarding_long',
      'wiki_article',
      'wiki_article_long',
      'wiki_page_revise',
      'wiki_revise',
    ]);
    expect(byClass('small')).toHaveLength(11);
    expect(byClass('medium')).toHaveLength(11);
  });

  it('keeps the eleven writing purposes, the four check purposes and the two long purposes', () => {
    expect([...INFERENCE_WRITING_PURPOSES].sort()).toEqual(
      [
        'wiki_section',
        'wiki_revise',
        'wiki_article',
        'team_onboarding',
        'wiki_visual_draw',
        'wiki_delta',
        'wiki_section_add',
        'wiki_section_long',
        'wiki_page_revise',
        'wiki_article_long',
        'team_onboarding_long',
      ].sort(),
    );
    expect(INFERENCE_CHECK_PURPOSES).toEqual([
      'wiki_review',
      'wiki_critique',
      'wiki_page_check',
      'wiki_article_check',
    ]);
    expect([...INFERENCE_LONG_PURPOSES].sort()).toEqual(['wiki_outline_long', 'wiki_section_long']);
  });

  it('floors every purpose and the standard tier at contractual', () => {
    for (const purpose of INFERENCE_PURPOSES) {
      expect(INFERENCE_PURPOSE_MIN_TRUST[purpose]).toBe('contractual');
    }
    expect(INFERENCE_TENANT_TIERS).toEqual(['standard']);
    expect(INFERENCE_TENANT_TIER_MIN_TRUST.standard).toBe('contractual');
  });

  it('lists the compiled override org and routable providers', () => {
    expect(ROUTING_OVERRIDE_ORG_ID_SHA256S).toEqual([
      '810e451ec9c7513f42ad026c53e97bafa4995188f1b8b2bcefb6713461a5df2c',
    ]);
    expect(ROUTABLE_INFERENCE_PROVIDERS).toEqual(['anthropic', 'phala']);
  });

  it('keeps the page configuration purposes equal to the list the page digest has always hashed', () => {
    expect(PAGE_CONFIG_PURPOSES).toEqual([
      'wiki_outline',
      'wiki_outline_long',
      'wiki_section',
      'wiki_section_long',
      'wiki_revise',
      'citation_check',
      'wiki_review',
    ]);
  });

  it('lists the page-check config purposes the digest adds when the check is on', () => {
    expect(PAGE_CHECK_CONFIG_PURPOSES).toEqual(['wiki_page_check', 'wiki_page_revise']);
  });

  it('keys one checker rule to every check purpose, each fallback fallback-free and reading everything', () => {
    expect(Object.keys(INFERENCE_CHECKER_RULES).sort()).toEqual(
      [...INFERENCE_CHECK_PURPOSES].sort(),
    );
    for (const rule of Object.values(INFERENCE_CHECKER_RULES)) {
      if (rule.fallback === undefined) continue;
      const fallback = INFERENCE_CHECKER_RULES[rule.fallback as InferenceCheckPurpose];
      expect(fallback.fallback).toBeUndefined();
      expect([...rule.reads].every((purpose) => fallback.reads.has(purpose))).toBe(true);
      expect([...(rule.alwaysReads ?? [])].every((purpose) => rule.reads.has(purpose))).toBe(true);
    }
    expect(INFERENCE_CHECKER_RULES.wiki_critique.reads.has('wiki_recovery')).toBe(true);
    expect(INFERENCE_CHECKER_RULES.wiki_review.reads.has('wiki_recovery')).toBe(false);
  });
});
