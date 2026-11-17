// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from './manifest.js';
import type { ResourceScopeUnit } from './resource-scope.js';
import { manifestForSourceKey, parseSourceKey } from './source-key.js';
import { PRIVATE_CONNECTOR_MANIFESTS } from './private-registry.js';
import { PUBLIC_CONNECTOR_MANIFESTS } from './public-registry.js';

export * from './manifest.js';
export * from './resource-scope.js';
export * from './stream-spec.js';
export * from './fact-definition.js';
export * from './identity.js';
export * from './source-key.js';
export * from './provider-versions.js';
export * from './custom/index.js';
export * from './firstparty/index.js';
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

const isFactSourceKind = (kind: string): kind is FactSourceKind =>
  (FACT_SOURCE_KINDS as readonly string[]).includes(kind);

export function factSourceKindOf(key: string): FactSourceKind | null {
  const kind = parseSourceKey(key)?.kind;
  return kind !== undefined && isFactSourceKind(kind) ? kind : null;
}

export type MemberManifestKind = Extract<AnyManifest, { readonly audience: 'member' }>['kind'];

// Widened first: the SDK registry holds only org kinds, so the narrow tuple type makes this comparison a type error there.
export const MEMBER_MANIFEST_KINDS = (CONNECTOR_MANIFESTS as readonly ConnectorManifest[])
  .filter((m) => m.audience === 'member')
  .map((m) => m.kind) as unknown as readonly [MemberManifestKind, ...MemberManifestKind[]];

export function resourceScopeUnitFor(kind: string): ResourceScopeUnit | undefined {
  const manifest = manifestForSourceKey(kind);
  return manifest?.audience === 'org' && manifest.settings === 'resource_scope'
    ? manifest.resourceScope?.unit
    : undefined;
}

export function isPausableSourceKind(kind: string): boolean {
  const manifest = manifestForSourceKey(kind);
  return manifest?.audience === 'org' && manifest.emitsFacts && manifest.pull !== null;
}
