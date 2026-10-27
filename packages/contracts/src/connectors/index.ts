// SPDX-License-Identifier: Apache-2.0
// UNWIRED: only factSourceKindSchema and the manifest tests read manifests so far.
import { PRIVATE_CONNECTOR_MANIFESTS } from './private-registry.js';
import { PUBLIC_CONNECTOR_MANIFESTS } from './public-registry.js';

export * from './manifest.js';
export { PUBLIC_CONNECTOR_MANIFESTS } from './public-registry.js';
export { PRIVATE_WIKI_EXPORT_DESTINATIONS } from './private-registry.js';

export const CONNECTOR_MANIFESTS = [
  ...PUBLIC_CONNECTOR_MANIFESTS,
  ...PRIVATE_CONNECTOR_MANIFESTS,
] as const;
type AnyManifest = (typeof CONNECTOR_MANIFESTS)[number];
export type ManifestKind = AnyManifest['kind'];
export type FactSourceKind = Extract<AnyManifest, { readonly emitsFacts: true }>['kind'];

export const FACT_SOURCE_KINDS = CONNECTOR_MANIFESTS.filter((m) => m.emitsFacts).map(
  (m) => m.kind,
) as unknown as readonly [FactSourceKind, ...FactSourceKind[]];
