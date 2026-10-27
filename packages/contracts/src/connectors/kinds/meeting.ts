// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '../manifest.js';

export const meetingManifest = {
  manifestVersion: 1,
  kind: 'meeting',
  displayName: 'Meeting',
  release: 'beta',
  audience: 'org',
  emitsFacts: true,
  threadRefs: false,
  sourceDirs: ['meeting'],
  icon: null,
  ui: {
    connectable: false,
    description: null,
    scopePreview: [],
  },
  auth: null,
  egress: {
    apiHosts: [],
    cdnSuffixes: [],
  },
  webhook: {
    routing: 'url',
    registration: 'customer_configured',
    signature: 'meeting',
    tenantKey: null,
  },
  pull: null,
  settings: 'none',
} as const satisfies ConnectorManifest;
