// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  processedFactSchema,
  wikiSynthesisResultSchema,
  themeSynthesisResultSchema,
  teamOnboardingSynthesisResultSchema,
  synthesisRequestSchema,
  themeSynthesisRequestSchema,
  pullCompleteSignalSchema,
  pullDueMessageSchema,
  tokenUsageSchema,
  TOKEN_USAGE_MODEL_MAX_LENGTH,
} from '@folklore/contracts/enclave';
import { stringLeafPaths } from '../src/zod-introspect.js';

function usageWith(model: string) {
  return { model, operation: 'generate', calls: 1, promptTokens: 10, completionTokens: 2 };
}

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
    'blocks[].body.objectId',
    'blocks[].body.orgId',
    'blocks[].factIds[]',
    'blocks[].type',
    'citedFactIds[]',
    'orgId',
    'requestId',
    'themeId',
    'tokenUsage[].model',
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
    'tokenUsage[].model',
  ],
  teamOnboardingSynthesisResult: [
    'articles[].audienceId',
    'articles[].content',
    'blocks[].audienceId',
    'blocks[].body.ciphertext',
    'blocks[].body.objectId',
    'blocks[].body.orgId',
    'blocks[].factIds[]',
    'blocks[].type',
    'citedFactIds[]',
    'orgId',
    'requestId',
    'teamId',
    'teamName',
    'tokenUsage[].model',
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
  teamOnboardingSynthesisResult: teamOnboardingSynthesisResultSchema,
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

  // The one free string the cost telemetry adds is a model id. It is pattern-bound rather than
  // merely named safely, so prose cannot ride it even if the enclave's sanitizer were bypassed.
  it('tokenUsage.model rejects anything that is not a bare model id', () => {
    for (const prose of [
      'the payments team cut over on 2026-01-01',
      'z-ai/glm-5.2 leaked this',
      'x'.repeat(TOKEN_USAGE_MODEL_MAX_LENGTH + 1),
      '',
    ]) {
      expect(tokenUsageSchema.safeParse(usageWith(prose)).success, prose).toBe(false);
    }
    expect(tokenUsageSchema.safeParse(usageWith('z-ai/glm-5.2')).success).toBe(true);
  });

  it('tokenUsage rejects an added field rather than passing it through', () => {
    expect(
      tokenUsageSchema.safeParse({ ...usageWith('z-ai/glm-5.2'), note: 'a prompt fragment' })
        .success,
    ).toBe(false);
  });

  it('the only accepted content-carrying fields are the two documented ones', () => {
    const contentish = stringLeafPaths(wikiSynthesisResultSchema).filter(
      (p) => p.endsWith('content') || p.endsWith('ciphertext'),
    );
    expect(contentish.sort()).toEqual([...ACCEPTED_CONTENT_FIELDS].sort());
  });
});
