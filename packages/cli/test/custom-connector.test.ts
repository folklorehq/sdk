// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConnectorRegistry } from '@folklore/connectors';
import { registerStandupConnector } from '../../../examples/custom-connector/register.js';

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../examples/custom-connector',
);

describe('custom connector example', () => {
  it('normalizes standup_bot fixture through a registered connector', () => {
    const registry = new ConnectorRegistry();
    registerStandupConnector(registry);
    const payload = JSON.parse(readFileSync(join(fixtureDir, 'fixture.json'), 'utf8'));
    const records = registry.normalizeWebhook(
      'standup_bot',
      { type: 'message', payload },
      {
        logger: {
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {},
          child() {
            return this;
          },
        },
      },
    );
    expect(records.facts).toHaveLength(1);
    expect(records.containers).toHaveLength(1);
    expect(records.facts[0]?.sourceFactId).toBe('standup:msg-001');
  });
});
