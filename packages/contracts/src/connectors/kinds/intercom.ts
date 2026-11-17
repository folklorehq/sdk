// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';

export const intercomManifest = {
  manifestVersion: 1,
  kind: 'intercom',
  displayName: 'Intercom',
  release: 'beta',
  audience: 'org',
  emitsFacts: true,
  threadRefs: true,
  sourceDirs: ['intercom'],
  icon: {
    slug: 'intercom',
    color: '6AFDEF',
  },
  ui: {
    connectable: true,
    description: 'Support conversations and replies.',
    scopePreview: ['Conversations & replies'],
  },
  auth: {
    type: 'oauth2',
    authUrl: 'https://app.intercom.com/oauth',
    scopes: [],
    scopeParam: 'scope',
    pkce: 'disabled',
    clientIdEnv: 'INTERCOM_CLIENT_ID',
    authorizeParameterMode: 'client-state-only',
    redeem: {
      tokenEndpoint: 'https://api.intercom.io/auth/eagle/token',
      identityEndpoint: 'https://api.intercom.io/me',
      refreshRequired: false,
    },
  },
  egress: {
    apiHosts: ['api.intercom.io'],
    cdnSuffixes: [],
  },
  webhook: {
    routing: 'payload',
    registration: 'per_connection',
    verifier: {
      scheme: 'hmac_body',
      algorithm: 'sha1',
      header: 'x-hub-signature',
      prefix: 'sha1=',
      encoding: 'hex',
    },
    tenantKey: 'intercom_workspace',
    eventType: { from: 'header', name: 'x-intercom-topic' },
    deliveryId: null,
    handshake: { type: 'builtin', id: 'intercom_ping' },
  },
  pull: {
    cadenceMinutes: 15,
    documentBodies: false,
  },
  settings: 'none',
  identity: {
    // UNWIRED: a member consent would install the source app and grant its full scope, so this stays false.
    live: false,
    authorEmailSuggestions: true,
    authUrl: 'https://app.intercom.com/oauth',
    scopes: [],
    scopeParam: 'scope',
    pkce: 'disabled',
    fallbackToSource: true,
    lookup: {
      method: 'GET',
      url: 'https://api.intercom.io/me',
      idPointer: '/id',
      namePointer: '/name',
    },
  },
} as const satisfies ConnectorManifest;
