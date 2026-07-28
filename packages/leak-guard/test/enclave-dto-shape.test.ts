// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  processedFactSchema,
  wikiSynthesisResultSchema,
  themeSynthesisResultSchema,
  synthesisRequestSchema,
  themeSynthesisRequestSchema,
  pullCompleteSignalSchema,
  pullDueMessageSchema,
} from '@folklore/contracts/enclave';
import { stringLeafPaths } from '../src/zod-introspect.js';

// The enclave→worker DTOs are content-free BY SHAPE: the only fields that may carry synthesized
// prose are wikiArticle.content (gated by contentFormat) and encryptedBody.ciphertext (ESDK).
// Every other free string is an id, hash, timestamp, source-kind, or an audience-gated descriptor
// (theme/team name, tag, extracted entity). Freezing the string-leaf set turns "someone added a
// `body`/`summary`/`text` field to a wire DTO" into a hard test failure that forces ADL review.
const FROZEN: Record<string, string[]> = {
  processedFact: [
    'bodyHash',
    'bodyS3Key',
    'containerRefs[]',
    'containerSeeds[].label',
    'containerSeeds[].shape',
    'containerSeeds[].sourceContainerId',
    'explicitLinks[]',
    'extractedEntities[]',
    'factId',
    'hnswNeighbors[].factId',
    'occurredAt',
    'orgId',
    'sourceFactId',
    'sourceKind',
    'sourceThreadId',
  ],
  wikiSynthesisResult: [
    'articles[].audienceId',
    'articles[].content',
    'blocks[].audienceId',
    'blocks[].body.ciphertext',
    'blocks[].factIds[]',
    'blocks[].type',
    'citedFactIds[]',
    'orgId',
    'requestId',
    'themeId',
  ],
  themeSynthesisResult: [
    'aggregates[].aggregateThemeId',
    'aggregates[].children[].childThemeId',
    'aggregates[].name',
    'aggregates[].tags[]',
    'mergeCandidates[].themeIdA',
    'mergeCandidates[].themeIdB',
    'orgId',
    'related[].fromThemeId',
    'related[].toThemeId',
    'requestId',
    'themes[].containerIds[]',
    'themes[].docType',
    'themes[].facts[].factId',
    'themes[].name',
    'themes[].team',
    'themes[].themeId',
    'themes[].tags[]',
  ],
  synthesisRequest: [
    'audiences[].id',
    'audiences[].name',
    'factRefs[].factId',
    'factRefs[].kind',
    'factRefs[].occurredAt',
    'factRefs[].s3Key',
    'factRefs[].sourceKind',
    'knowledgeSkeleton.entities[].entityId',
    'knowledgeSkeleton.entities[].kind',
    'knowledgeSkeleton.neighbors[].themeId',
    'knowledgeSkeleton.neighbors[].tags[]',
    'knowledgeSkeleton.node.tags[]',
    'knowledgeSkeleton.node.themeId',
    'newlyAssociatedFactIds[]',
    'orgId',
    'relatedThemes[].name',
    'relatedThemes[].themeId',
    'requestId',
    'themeId',
    'themeName',
    'themeType',
  ],
  themeSynthesisRequest: [
    'containers[].containerId',
    'containers[].factRefs[].entities[]',
    'containers[].factRefs[].factId',
    'containers[].factRefs[].occurredAt',
    'containers[].factRefs[].s3Key',
    'containers[].label',
    'containers[].team',
    'orgId',
    'requestId',
  ],
  pullCompleteSignal: ['completedAt', 'orgId', 'sourceId', 'sourceKind'],
  pullDueMessage: ['kind', 'sourceId', 'tenant_id'],
};

const SCHEMAS = {
  processedFact: processedFactSchema,
  wikiSynthesisResult: wikiSynthesisResultSchema,
  themeSynthesisResult: themeSynthesisResultSchema,
  synthesisRequest: synthesisRequestSchema,
  themeSynthesisRequest: themeSynthesisRequestSchema,
  pullCompleteSignal: pullCompleteSignalSchema,
  pullDueMessage: pullDueMessageSchema,
};

// A new free string whose name reads like prose is the classic silent plaintext channel.
const PROSE_LEAF_NAMES = ['body', 'message', 'summary', 'text', 'description', 'prompt', 'snippet'];
const ACCEPTED_CONTENT_FIELDS = ['articles[].content', 'blocks[].body.ciphertext'];

describe('enclave→worker DTO shapes are content-free by construction', () => {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    it(`${name}: string-leaf set is frozen (a new field forces ADL review)`, () => {
      expect(stringLeafPaths(schema)).toEqual([...(FROZEN[name] ?? [])].sort());
    });
  }

  it('no wire DTO grows a prose-named free-string field', () => {
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      for (const path of stringLeafPaths(schema)) {
        const leaf = path.replace(/\[\]$/, '').split('.').pop() ?? '';
        expect(
          PROSE_LEAF_NAMES.includes(leaf.toLowerCase()),
          `${name}.${path} reads like a prose field`,
        ).toBe(false);
      }
    }
  });

  it('the only accepted content-carrying fields are the two documented ones', () => {
    const contentish = stringLeafPaths(wikiSynthesisResultSchema).filter(
      (p) => p.endsWith('content') || p.endsWith('ciphertext'),
    );
    expect(contentish.sort()).toEqual([...ACCEPTED_CONTENT_FIELDS].sort());
  });
});
