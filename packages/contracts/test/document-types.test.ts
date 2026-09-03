// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  documentTypeSchema,
  KNOWN_DOCUMENT_TYPE_IDS,
  parseDocumentType,
} from '../src/document-types.js';

describe('document type contract', () => {
  it('shares the complete wiki document type vocabulary', () => {
    expect(KNOWN_DOCUMENT_TYPE_IDS).toEqual([
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
    ]);
  });

  it('falls back to concept for unknown persisted values', () => {
    expect(documentTypeSchema.parse('future_type')).toBe('concept');
    expect(parseDocumentType(null)).toBe('concept');
  });

  it('keeps known document types', () => {
    expect(parseDocumentType('onboarding')).toBe('onboarding');
  });
});
