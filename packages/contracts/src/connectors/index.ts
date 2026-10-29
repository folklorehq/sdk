// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from './manifest.js';
import type { ResourceScopeUnit } from './resource-scope.js';
import { PRIVATE_CONNECTOR_MANIFESTS } from './private-registry.js';
import { PUBLIC_CONNECTOR_MANIFESTS } from './public-registry.js';

export * from './manifest.js';
export * from './resource-scope.js';
export * from './stream-spec.js';
export * from './identity.js';
export * from './provider-versions.js';
export * from './custom/index.js';
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

export type MemberManifestKind = Extract<AnyManifest, { readonly audience: 'member' }>['kind'];

// Widened first: the SDK registry holds only org kinds, so the narrow tuple type makes this comparison a type error there.
export const MEMBER_MANIFEST_KINDS = (CONNECTOR_MANIFESTS as readonly ConnectorManifest[])
  .filter((m) => m.audience === 'member')
  .map((m) => m.kind) as unknown as readonly [MemberManifestKind, ...MemberManifestKind[]];

const ORG_MANIFESTS = (CONNECTOR_MANIFESTS as readonly ConnectorManifest[]).filter(
  (m) => m.audience === 'org',
);

export function resourceScopeUnitFor(kind: string): ResourceScopeUnit | undefined {
  return ORG_MANIFESTS.find((m) => m.kind === kind && m.settings === 'resource_scope')
    ?.resourceScope?.unit;
}

export function isPausableSourceKind(kind: string): boolean {
  return ORG_MANIFESTS.some((m) => m.kind === kind && m.emitsFacts && m.pull !== null);
}
