// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';

export const githubManifest = {
  manifestVersion: 1,
  kind: 'github',
  displayName: 'GitHub',
  release: 'beta',
  audience: 'org',
  emitsFacts: true,
  threadRefs: true,
  sourceDirs: ['github'],
  icon: {
    slug: 'github',
    color: '181717',
  },
  ui: {
    connectable: true,
    description: 'Pull requests, commits, and repository activity.',
    scopePreview: ['Repository metadata', 'Pull requests & issues', 'Commit history'],
  },
  auth: {
    type: 'github_app',
    appSlugEnv: 'GITHUB_APP_SLUG',
    redeem: {
      tokenEndpoint: 'https://github.com/login/oauth/access_token',
      identityEndpoint: 'https://api.github.com/user',
      refreshRequired: false,
    },
  },
  egress: {
    apiHosts: ['api.github.com', 'github.com'],
    cdnSuffixes: [],
  },
  webhook: {
    routing: 'payload',
    registration: 'app_wide',
    signature: 'github',
    tenantKey: 'github_installation',
  },
  pull: {
    cadenceMinutes: 15,
    documentBodies: false,
  },
  settings: 'none',
  identity: {
    live: true,
    authUrl: 'https://github.com/login/oauth/authorize',
    scopes: [],
    scopeParam: 'scope',
    pkce: 'required',
    clientIdEnv: 'GITHUB_IDENTITY_CLIENT_ID',
    fallbackToSource: false,
    lookup: {
      method: 'GET',
      url: 'https://api.github.com/user',
      headers: { accept: 'application/vnd.github+json' },
      idPointer: '/id',
    },
  },
} as const satisfies ConnectorManifest;
