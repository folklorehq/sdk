// SPDX-License-Identifier: Apache-2.0
export type { AudienceAccess, SensitivityLevel } from './sensitivity.js';
export { isSensitivityWithin } from './sensitivity.js';
export type {
  FactMetadata,
  FactRetriever,
  FactSearchParams,
  RetrievedFact,
  RetrieverDeps,
  RetrieverFactory,
} from './ports.js';
export {
  MemoryVectorIndex,
  loadVectorIndex,
  saveVectorIndex,
  type VectorEntry,
  type VectorSearchHit,
} from './memory-index.js';
export {
  LocalFactRetriever,
  type LocalFactBodyLoader,
  type LocalFactMetadataLoader,
  type LocalFactRetrieverDeps,
} from './local-retriever.js';
