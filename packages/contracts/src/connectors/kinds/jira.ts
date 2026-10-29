// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';

export const jiraManifest = {
  manifestVersion: 1,
  kind: 'jira',
  displayName: 'Jira',
  release: 'beta',
  audience: 'org',
  emitsFacts: true,
  threadRefs: true,
  sourceDirs: ['jira', 'atlassian'],
  icon: {
    slug: 'jira',
    color: '0052CC',
  },
  ui: {
    connectable: true,
    description: 'Issues, sprints, and project tracking.',
    scopePreview: ['Issues & sprints', 'Comments & activity'],
  },
  auth: {
    type: 'oauth2',
    authUrl: 'https://auth.atlassian.com/authorize',
    scopes: [
      'read:jira-work',
      'read:jira-user',
      'read:me',
      'manage:jira-webhook',
      'offline_access',
    ],
    scopeParam: 'scope',
    pkce: 'disabled',
    clientIdEnv: 'ATLASSIAN_CLIENT_ID',
    extraAuthParams: {
      audience: 'api.atlassian.com',
      prompt: 'consent',
    },
    redeem: {
      tokenEndpoint: 'https://auth.atlassian.com/oauth/token',
      identityEndpoint: 'https://api.atlassian.com/me',
      refreshRequired: false,
    },
  },
  egress: {
    apiHosts: ['api.atlassian.com', 'auth.atlassian.com'],
    cdnSuffixes: [],
  },
  webhook: {
    routing: 'url',
    registration: 'per_connection',
    signature: 'jira',
    tenantKey: 'jwt_iss',
  },
  pull: {
    cadenceMinutes: 15,
    documentBodies: false,
  },
  settings: 'none',
  identity: {
    live: true,
    authUrl: 'https://auth.atlassian.com/authorize',
    scopes: ['read:me'],
    scopeParam: 'scope',
    pkce: 'disabled',
    fallbackToSource: true,
    extraAuthParams: {
      audience: 'api.atlassian.com',
      prompt: 'consent',
    },
    lookup: {
      method: 'GET',
      url: 'https://api.atlassian.com/me',
      idPointer: '/account_id',
      namePointer: '/name',
    },
  },
} as const satisfies ConnectorManifest;
