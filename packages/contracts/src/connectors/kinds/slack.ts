// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';

export const slackManifest = {
  manifestVersion: 1,
  kind: 'slack',
  displayName: 'Slack',
  release: 'beta',
  audience: 'org',
  emitsFacts: true,
  threadRefs: true,
  sourceDirs: ['slack'],
  icon: {
    slug: 'slack',
    color: '4A154B',
  },
  ui: {
    connectable: true,
    description: 'Channel discussions, decisions, and threads.',
    scopePreview: ['Public channel messages', 'Channel & user directory'],
  },
  auth: {
    type: 'oauth2',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    scopes: [
      'channels:history',
      'channels:read',
      'groups:history',
      'groups:read',
      'reactions:read',
      'users:read',
      'users:read.email',
    ],
    scopeParam: 'user_scope',
    pkce: 'disabled',
    clientIdEnv: 'SLACK_CLIENT_ID',
    redeem: {
      tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
      identityEndpoint: 'https://slack.com/api/auth.test',
      refreshRequired: false,
    },
  },
  egress: {
    apiHosts: ['slack.com'],
    cdnSuffixes: [],
  },
  webhook: {
    routing: 'payload',
    registration: 'per_connection',
    signature: 'slack',
    tenantKey: 'slack_team',
  },
  pull: {
    cadenceMinutes: 15,
    documentBodies: false,
  },
  settings: 'none',
  identity: {
    // UNWIRED: stays false until a Slack identity envelope exists.
    live: false,
    authUrl: 'https://slack.com/oauth/v2/authorize',
    scopes: ['identity.basic'],
    scopeParam: 'user_scope',
    pkce: 'disabled',
    clientIdEnv: 'SLACK_IDENTITY_CLIENT_ID',
    fallbackToSource: true,
    lookup: {
      method: 'GET',
      url: 'https://slack.com/api/auth.test',
      idPointer: '/user_id',
    },
  },
} as const satisfies ConnectorManifest;
