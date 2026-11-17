// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';
import { NOTION_API_VERSION } from '../provider-versions.js';

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
    verifier: {
      scheme: 'hmac_body',
      algorithm: 'sha256',
      header: 'x-notion-signature',
      prefix: 'sha256=',
      encoding: 'hex',
    },
    tenantKey: 'notion_workspace',
    eventType: { from: 'body', pointer: '/type' },
    deliveryId: null,
    handshake: { type: 'builtin', id: 'notion_verification' },
  },
  pull: {
    cadenceMinutes: 15,
    documentBodies: false,
  },
  settings: 'none',
  identity: {
    // UNWIRED: stays false until a Notion identity envelope exists.
    live: false,
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    scopes: [],
    scopeParam: 'scope',
    pkce: 'disabled',
    fallbackToSource: true,
    extraAuthParams: { owner: 'user' },
    lookup: {
      method: 'GET',
      url: 'https://api.notion.com/v1/users/me',
      headers: { 'notion-version': NOTION_API_VERSION },
      idPointer: '/id',
    },
  },
} as const satisfies ConnectorManifest;
