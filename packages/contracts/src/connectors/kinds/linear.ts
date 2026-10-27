// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';

export const linearManifest = {
  manifestVersion: 1,
  kind: 'linear',
  displayName: 'Linear',
  release: 'beta',
  audience: 'org',
  emitsFacts: true,
  threadRefs: true,
  sourceDirs: ['linear'],
  icon: {
    slug: 'linear',
    color: '5E6AD2',
  },
  ui: {
    connectable: true,
    description: 'Issues, projects, and delivery cycles.',
    scopePreview: ['Issues & projects', 'Cycles & roadmap'],
  },
  auth: {
    type: 'oauth2',
    authUrl: 'https://linear.app/oauth/authorize',
    scopes: ['read'],
    scopeParam: 'scope',
    pkce: 'disabled',
    clientIdEnv: 'LINEAR_CLIENT_ID',
    redeem: {
      tokenEndpoint: 'https://api.linear.app/oauth/token',
      identityEndpoint: 'https://api.linear.app/graphql',
      refreshRequired: true,
    },
  },
  egress: {
    apiHosts: ['api.linear.app'],
    cdnSuffixes: [],
  },
  webhook: null,
  pull: {
    cadenceMinutes: 15,
    documentBodies: false,
  },
  settings: 'none',
} as const satisfies ConnectorManifest;
