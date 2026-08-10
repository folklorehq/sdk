// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  auditBrowserTelemetrySource,
  auditBrowserTelemetryTree,
} from '../src/browser-telemetry-audit.js';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('browser telemetry static audit', () => {
  it('rejects a browser SDK import outside the facade package', () => {
    expect(
      auditBrowserTelemetrySource('apps/box/src/telemetry.ts', "import posthog from 'posthog-js';"),
    ).toEqual([{ file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_import' }]);
  });

  it('rejects direct browser SDK capture through an imported alias', () => {
    expect(
      auditBrowserTelemetrySource(
        'apps/console/src/telemetry.ts',
        "import analytics from 'posthog-js'; analytics.capture('source.connect_started', {});",
      ),
    ).toEqual([{ file: 'apps/console/src/telemetry.ts', line: 1, reason: 'direct_sdk_capture' }]);
  });

  it('rejects named, TypeScript import-equals, and dynamic SDK imports', () => {
    expect(
      auditBrowserTelemetrySource(
        'apps/box/src/telemetry.ts',
        "import { default as analytics } from 'posthog-js'; analytics.capture('source.connect_started', {});",
      ),
    ).toEqual([{ file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_capture' }]);
    expect(
      auditBrowserTelemetrySource(
        'apps/box/src/telemetry.ts',
        "import posthog = require('posthog-js');",
      ),
    ).toEqual([{ file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_import' }]);
    expect(
      auditBrowserTelemetrySource('apps/box/src/telemetry.ts', "void import('posthog-js');"),
    ).toEqual([{ file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_import' }]);
    expect(
      auditBrowserTelemetrySource('apps/box/src/telemetry.ts', 'void import(`posthog-js`);'),
    ).toEqual([{ file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_import' }]);
    expect(
      auditBrowserTelemetrySource(
        'apps/box/src/telemetry.ts',
        "import posthog from 'posthog-js/react';",
      ),
    ).toEqual([{ file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_import' }]);
  });

  it('rejects an SDK re-export before a local bridge can capture outside the facade', () => {
    const violations = [
      ...auditBrowserTelemetrySource(
        'apps/box/src/posthog-bridge.ts',
        "export { default as analytics } from 'posthog-js';",
      ),
      ...auditBrowserTelemetrySource(
        'apps/box/src/telemetry.ts',
        "import { analytics } from './posthog-bridge.js'; analytics.capture('source.connect_started', {});",
      ),
    ];

    expect(violations).toEqual([
      {
        file: 'apps/box/src/posthog-bridge.ts',
        line: 1,
        reason: 'direct_sdk_import',
      },
    ]);
  });

  it.each([
    "const analytics = require('posthog-js'); analytics.capture('source.connect_started', {});",
    "const posthogModule = require('posthog-js'); const analytics = posthogModule; analytics.capture('source.connect_started', {});",
    "const { capture } = require('posthog-js'); capture('source.connect_started', {});",
    "const { capture: send } = require('posthog-js/lib/src/posthog-core.js'); send('source.connect_started', {});",
  ])('rejects CommonJS SDK capture aliases: %s', (source) => {
    expect(auditBrowserTelemetrySource('apps/box/src/telemetry.ts', source)).toEqual([
      { file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_capture' },
    ]);
  });

  it.each([
    "globalThis.posthog.capture('source.connect_started', {});",
    "window.posthog.capture('source.connect_started', {});",
    "self.posthog.capture('source.connect_started', {});",
    "const analytics = globalThis.posthog; analytics.capture('source.connect_started', {});",
    "const first = window.posthog; const analytics = first; analytics.capture('source.connect_started', {});",
    "const { posthog: analytics } = self; analytics.capture('source.connect_started', {});",
  ])('rejects global SDK capture and aliased receivers: %s', (source) => {
    expect(auditBrowserTelemetrySource('apps/box/src/telemetry.ts', source)).toEqual([
      { file: 'apps/box/src/telemetry.ts', line: 1, reason: 'direct_sdk_capture' },
    ]);
  });

  it('allows the facade adapter to own the browser SDK', () => {
    expect(
      auditBrowserTelemetrySource(
        'packages/web-telemetry/src/PostHogBrowserTelemetryClient.ts',
        "import { PostHog } from 'posthog-js/lib/src/posthog-core.js'; const posthog = new PostHog(); posthog.capture('source.connect_started', {});",
      ),
    ).toEqual([]);
  });

  it('accepts the production browser source tree', () => {
    expect(auditBrowserTelemetryTree(ROOT)).toEqual([]);
  });
});
