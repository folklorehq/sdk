// SPDX-License-Identifier: Apache-2.0
import type { InferenceModelId } from './inference-catalog.js';
import {
  INFERENCE_WRITING_PURPOSES,
  isInferenceCheckPurpose,
  type InferenceEffort,
  type InferencePurpose,
  type RoutedProviderId,
} from './inference-routing.js';

export interface CompiledRouteTarget {
  readonly provider: RoutedProviderId;
  readonly model: InferenceModelId;
  readonly effort: InferenceEffort;
}

export interface CompiledRouting {
  readonly purposes: Readonly<Record<InferencePurpose, CompiledRouteTarget>>;
}

const HAIKU = 'claude-haiku-5-5';
const SONNET = 'claude-sonnet-5-5';
const OPUS = 'claude-opus-5-5';

const anthropic = (model: InferenceModelId, effort: InferenceEffort): CompiledRouteTarget =>
  Object.freeze({ provider: 'anthropic', model, effort });

const OPUS_MEDIUM = anthropic(OPUS, 'medium');

// Compiled routing default: the coupling check requires a change here to ship with an enclave change.
export const COMPILED_DEFAULT_ROUTING: CompiledRouting = Object.freeze({
  purposes: Object.freeze({
    wiki_outline: OPUS_MEDIUM,
    wiki_section: anthropic(SONNET, 'medium'),
    wiki_revise: anthropic(SONNET, 'medium'),
    wiki_visual_warrant: anthropic(SONNET, 'low'),
    wiki_visual_draw: anthropic(SONNET, 'low'),
    wiki_article: anthropic(SONNET, 'medium'),
    team_onboarding: anthropic(SONNET, 'medium'),
    wiki_review: OPUS_MEDIUM,
    wiki_critique: OPUS_MEDIUM,
    citation_check: anthropic(SONNET, 'low'),
    theme_merge: anthropic(SONNET, 'low'),
    wiki_relevance: anthropic(HAIKU, 'low'),
    wiki_recovery: anthropic(HAIKU, 'low'),
    wiki_repair: anthropic(HAIKU, 'low'),
    theme_tagging: anthropic(HAIKU, 'low'),
    theme_topic_naming: anthropic(SONNET, 'medium'),
    theme_aggregate_naming: anthropic(SONNET, 'medium'),
    theme_doctype: anthropic(HAIKU, 'low'),
    association_judge: anthropic(SONNET, 'low'),
    answer: anthropic(SONNET, 'medium'),
    wiki_delta: anthropic(SONNET, 'medium'),
    wiki_section_add: anthropic(SONNET, 'medium'),
    wiki_section_long: anthropic(SONNET, 'medium'),
    wiki_outline_long: OPUS_MEDIUM,
    wiki_page_check: OPUS_MEDIUM,
    wiki_page_revise: anthropic(SONNET, 'medium'),
    wiki_article_check: OPUS_MEDIUM,
    wiki_article_long: anthropic(SONNET, 'medium'),
    team_onboarding_long: anthropic(SONNET, 'medium'),
  }),
});

export const PAGE_CONFIG_PURPOSES: readonly InferencePurpose[] = [
  'wiki_outline',
  'wiki_outline_long',
  'wiki_section',
  'wiki_section_long',
  'wiki_revise',
  'citation_check',
  'wiki_review',
];
export const PAGE_CHECK_CONFIG_PURPOSES: readonly InferencePurpose[] = [
  'wiki_page_check',
  'wiki_page_revise',
];

export const inferencePurposeNeverFallsBack = (purpose: InferencePurpose): boolean =>
  INFERENCE_WRITING_PURPOSES.has(purpose) ||
  isInferenceCheckPurpose(purpose) ||
  PAGE_CONFIG_PURPOSES.includes(purpose) ||
  PAGE_CHECK_CONFIG_PURPOSES.includes(purpose);
