// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const KNOWN_DOCUMENT_TYPE_IDS = [
  'decision',
  'incident',
  'concept',
  'process',
  'initiative',
  'person',
  'onboarding',
  'design_doc',
  'runbook',
  'howto',
  'team',
  'retro',
  'prd',
] as const;

export type DocumentType = (typeof KNOWN_DOCUMENT_TYPE_IDS)[number];

const documentTypeIdSchema = z.enum(KNOWN_DOCUMENT_TYPE_IDS);

export const documentTypeSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && documentTypeIdSchema.safeParse(value).success ? value : 'concept',
  documentTypeIdSchema,
);

export function parseDocumentType(value: unknown): DocumentType {
  return documentTypeSchema.parse(value);
}

export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  initiative: 'Initiative',
  decision: 'Decision',
  design_doc: 'Design doc',
  runbook: 'Runbook',
  howto: 'How-to',
  incident: 'Incident',
  concept: 'Concept',
  process: 'Process',
  person: 'Person',
  onboarding: 'Onboarding',
  team: 'Team',
  retro: 'Retro',
  prd: 'PRD',
};
