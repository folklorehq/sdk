// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';

export const notionManifest = {
  manifestVersion: 1,
  kind: 'notion',
  displayName: 'Notion',
  release: 'beta',
  audience: 'org',
  emitsFacts: true,
  threadRefs: true,
  sourceDirs: ['notion'],
  icon: {
    slug: 'notion',
    color: '000000',
  },
  ui: {
    connectable: true,
    description: 'Docs, specs, and runbooks.',
    scopePreview: ['Pages & databases', 'Comments'],
  },
  auth: {
    type: 'oauth2',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    scopes: [],
    scopeParam: 'scope',
    pkce: 'disabled',
    clientIdEnv: 'NOTION_CLIENT_ID',
    extraAuthParams: {
      owner: 'user',
    },
    redeem: {
      tokenEndpoint: 'https://api.notion.com/v1/oauth/token',
      identityEndpoint: 'https://api.notion.com/v1/users/me',
      refreshRequired: true,
    },
  },
  egress: {
    apiHosts: ['api.notion.com'],
    cdnSuffixes: [],
  },
  webhook: {
    routing: 'payload',
    registration: 'per_connection',
    signature: 'notion',
    tenantKey: 'notion_workspace',
  },
  pull: {
    cadenceMinutes: 15,
    documentBodies: false,
  },
  settings: 'none',
} as const satisfies ConnectorManifest;
