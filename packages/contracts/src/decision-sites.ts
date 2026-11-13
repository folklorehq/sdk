// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import type { InferencePurpose } from './inference-routing.js';

export const DECIDING_SITES = [
  'theme_tagging',
  'theme_doctype',
  'wiki_relevance',
  'theme_merge_adjudication',
  'association_judge',
  'wiki_visual_warrant',
  'citation_check',
  'ingest_salience',
  'ingest_sensitivity',
] as const;
export const SHADOW_ONLY_SITES = ['theme_merge_pair', 'theme_disposition'] as const;
export const DECISION_SITES = [...DECIDING_SITES, ...SHADOW_ONLY_SITES] as const;

export type DecidingSite = (typeof DECIDING_SITES)[number];
export type ShadowOnlySite = (typeof SHADOW_ONLY_SITES)[number];
export type DecisionSite = DecidingSite | ShadowOnlySite;
export const decisionSiteSchema = z.enum(DECISION_SITES);

export type ShadowOnlyMode = 'off' | 'shadow';
export type DecidingMode = ShadowOnlyMode | 'jev';
export type DecisionSiteMode = DecidingMode;
export type ModeFor<S extends DecisionSite> = S extends ShadowOnlySite
  ? ShadowOnlyMode
  : DecidingMode;

/** The usage purpose each site meters under; ingest runs outside a measured run, so it is untagged. */
export const DECISION_SITE_PURPOSE: Readonly<Record<DecisionSite, InferencePurpose | 'untagged'>> =
  {
    theme_tagging: 'theme_tagging',
    theme_doctype: 'theme_doctype',
    theme_disposition: 'theme_doctype',
    wiki_relevance: 'wiki_relevance',
    theme_merge_pair: 'theme_merge',
    theme_merge_adjudication: 'theme_merge',
    association_judge: 'association_judge',
    wiki_visual_warrant: 'wiki_visual_warrant',
    citation_check: 'citation_check',
    ingest_salience: 'untagged',
    ingest_sensitivity: 'untagged',
  };
