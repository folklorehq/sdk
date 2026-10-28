// SPDX-License-Identifier: Apache-2.0
import {
  connectorManifestSchema,
  connectorSpecSchema,
  streamSpecSchema,
  type ConnectorManifest,
  type ConnectorSpec,
  type StreamSpec,
} from '@folklore/contracts';

export const FIXTURE_HOST = 'api.example.test';
export const FIXTURE_ORIGIN = `https://${FIXTURE_HOST}`;

export const FIXTURE_MANIFEST: ConnectorManifest = connectorManifestSchema.parse({
  manifestVersion: 1,
  kind: 'example',
  displayName: 'Example',
  release: 'planned',
  audience: 'org',
  emitsFacts: false,
  threadRefs: false,
  sourceDirs: [],
  icon: null,
  ui: { connectable: false, description: null, scopePreview: [] },
  auth: null,
  egress: { apiHosts: [FIXTURE_HOST], cdnSuffixes: [] },
  webhook: null,
  pull: null,
  settings: 'none',
});

type Json = Record<string, unknown>;

export const ITEM_MAPPING: Json = {
  shape: 'item',
  containerLabel: 'unknown',
  idPointer: '/id',
  titlePointer: '/title',
  bodyPointer: '/body',
  authorIdPointer: '/author',
  createdAtPointer: '/created',
  updatedAtPointer: '/updated',
  status: null,
  sensitivity: { restrictedScope: { mode: 'always' }, namesPointers: [] },
};

export const COMMENT_MAPPING: Json = {
  shape: 'comment',
  parentIdPointer: '/id',
  idPointer: '/id',
  bodyPointer: '/text',
  authorIdPointer: '/author',
  createdAtPointer: '/created',
  sensitivity: { restrictedScope: { mode: 'always' }, namesPointers: [] },
};

export function stream(overrides: Json = {}): StreamSpec {
  const { request, ...rest } = overrides;
  return streamSpecSchema.parse({
    specVersion: 1,
    name: 'items',
    request: { method: 'GET', host: FIXTURE_HOST, path: '/v1/items', ...(request as Json) },
    auth: 'bearer',
    paginator: { type: 'none' },
    recordSelector: '/items',
    cursor: null,
    parent: null,
    mapping: ITEM_MAPPING,
    ...rest,
  });
}

export function spec(...streams: StreamSpec[]): ConnectorSpec {
  return connectorSpecSchema.parse({ specVersion: 1, kind: 'example', identity: null, streams });
}
