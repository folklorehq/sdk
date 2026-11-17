// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import type { ManifestKind } from './index.js';
import type { ConnectorManifest } from './manifest.js';
import { PRIVATE_CONNECTOR_MANIFESTS } from './private-registry.js';
import { PUBLIC_CONNECTOR_MANIFESTS } from './public-registry.js';
import {
  firstpartySourceKeySchema,
  type FirstpartySourceKey,
} from './firstparty/firstparty-source-key.js';

export const SOURCE_KEY_MAX_INSTANCE = 9999;

const REGISTERED = [...PUBLIC_CONNECTOR_MANIFESTS, ...PRIVATE_CONNECTOR_MANIFESTS] as const;
type Registered = (typeof REGISTERED)[number];
type ManyKind = Extract<Registered, { readonly instances: 'many' }>['kind'];
export type SingleFactSourceKind = Exclude<
  Extract<Registered, { readonly emitsFacts: true }>['kind'],
  ManyKind
>;
export type CustomSourceKey = `custom_${number}`;
export type FactSourceKey = SingleFactSourceKind | CustomSourceKey | FirstpartySourceKey;

export interface ParsedSourceKey {
  readonly kind: ManifestKind;
  readonly instance: number | null;
}

const MANIFESTS: readonly ConnectorManifest[] = REGISTERED;
const MANIFEST_BY_KIND: ReadonlyMap<string, ConnectorManifest> = new Map(
  MANIFESTS.map((manifest) => [manifest.kind, manifest]),
);
const INSTANCE_KEY = /^([a-z][a-z0-9_]*)_([1-9][0-9]{0,3})$/;
const CUSTOM_KEY = /^custom_[1-9][0-9]{0,3}$/;

const isMany = (manifest: ConnectorManifest | undefined): boolean => manifest?.instances === 'many';

export function parseSourceKey(key: string): ParsedSourceKey | null {
  const direct = MANIFEST_BY_KIND.get(key);
  if (direct) return isMany(direct) ? null : { kind: direct.kind as ManifestKind, instance: null };
  const match = INSTANCE_KEY.exec(key);
  const manifest = match ? MANIFEST_BY_KIND.get(match[1] ?? '') : undefined;
  if (!match || !manifest || !isMany(manifest)) return null;
  return { kind: manifest.kind as ManifestKind, instance: Number(match[2]) };
}

// Null when the pair has no key: an instance on a single kind, none on a multi-instance kind, or one out of range.
export function formatSourceKey(kind: ManifestKind, instance: number | null): string | null {
  const many = isMany(MANIFEST_BY_KIND.get(kind));
  const inRange =
    instance === null ||
    (Number.isInteger(instance) && instance >= 1 && instance <= SOURCE_KEY_MAX_INSTANCE);
  if (many !== (instance !== null) || !inRange) return null;
  return instance === null ? kind : `${kind}_${instance}`;
}

export function manifestForSourceKey(key: string): ConnectorManifest | null {
  const parsed = parseSourceKey(key);
  return parsed === null ? null : (MANIFEST_BY_KIND.get(parsed.kind) ?? null);
}

export const customSourceKeySchema = z
  .string()
  .refine((key): key is CustomSourceKey => CUSTOM_KEY.test(key));

const SINGLE_FACT_SOURCE_KINDS = MANIFESTS.filter(
  (manifest) => manifest.emitsFacts && !isMany(manifest),
).map((manifest) => manifest.kind) as unknown as readonly [
  SingleFactSourceKind,
  ...SingleFactSourceKind[],
];

export const factSourceKeySchema = z.union([
  z.enum(SINGLE_FACT_SOURCE_KINDS),
  customSourceKeySchema,
  firstpartySourceKeySchema,
]);
