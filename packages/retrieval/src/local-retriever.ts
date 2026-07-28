// SPDX-License-Identifier: Apache-2.0
import type { InferenceBackend } from '@folklore/inference';
import { isSensitivityWithin, type AudienceAccess } from './sensitivity.js';
import type { FactRetriever, FactSearchParams, RetrievedFact } from './ports.js';
import { MemoryVectorIndex } from './memory-index.js';

export interface LocalFactBodyLoader {
  loadBodies(orgId: string, factIds: string[]): Promise<Map<string, string>>;
}

export interface LocalFactMetadataLoader {
  loadMetadata(
    orgId: string,
    factIds: string[],
  ): Promise<
    Array<{
      id: string;
      kind: string;
      sourceId: string;
      occurredAt: Date;
      sensitivityLevel: AudienceAccess['maxSensitivity'];
    }>
  >;
}

export interface LocalFactRetrieverDeps {
  index: MemoryVectorIndex;
  inference: InferenceBackend;
  loadMetadata: LocalFactMetadataLoader['loadMetadata'];
  loadBodies: LocalFactBodyLoader['loadBodies'];
  resolveAudienceAccess: (orgId: string, userId: string) => Promise<AudienceAccess>;
}

export class LocalFactRetriever implements FactRetriever {
  constructor(private readonly deps: LocalFactRetrieverDeps) {}

  async search(params: FactSearchParams): Promise<RetrievedFact[]> {
    const queryVector = await this.deps.inference.embed(params.query);
    const hits = this.deps.index.search(queryVector, params.limit);
    const factIds = hits.map((hit) => hit.factId);
    const access = await this.deps.resolveAudienceAccess(params.orgId, params.userId);
    const metadata = await this.deps.loadMetadata(params.orgId, factIds);
    const visibleIds = metadata
      .filter((row) => isSensitivityWithin(row.sensitivityLevel, access.maxSensitivity))
      .map((row) => row.id);
    const bodies = await this.deps.loadBodies(params.orgId, visibleIds);
    const metaById = new Map(metadata.map((row) => [row.id, row]));

    return hits
      .filter((hit) => visibleIds.includes(hit.factId))
      .map((hit) => {
        const meta = metaById.get(hit.factId)!;
        return {
          id: hit.factId,
          kind: meta.kind,
          occurredAt: meta.occurredAt,
          sourceId: meta.sourceId,
          distance: 1 - hit.score,
          snippet: bodies.get(hit.factId),
        };
      });
  }
}
