// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ConnectorRegistry,
  createPullConnector,
  listPullConnectorKinds,
} from '../src/registry/index.js';
import type { Logger } from '@folklore/core';

const noop = () => {};
const noopLogger: Logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child(): Logger {
    return noopLogger;
  },
};

describe('ConnectorRegistry', () => {
  it('lists built-in pull-capable kinds', () => {
    const kinds = listPullConnectorKinds();
    expect(kinds).toContain('github');
    expect(kinds).toContain('slack');
    expect(kinds).toContain('linear');
    expect(kinds).not.toContain('gmail');
    expect(kinds).not.toContain('meeting');
  });

  it('rejects duplicate registration', () => {
    const registry = new ConnectorRegistry();
    const stub = {
      kind: 'demo',
      listResources: async () => [],
      pull: async () => ({ facts: [], containers: [], cursor: { value: null }, hasMore: false }),
      normalizeWebhook: () => ({ facts: [], containers: [] }),
    };
    registry.register({
      kind: 'demo',
      createForWebhook: () => stub,
    });
    expect(() =>
      registry.register({
        kind: 'demo',
        createForWebhook: () => stub,
      }),
    ).toThrow(/duplicate connector kind/);
  });

  it('constructs pull connectors from registry', () => {
    const connector = createPullConnector('slack', { logger: noopLogger, token: 'xoxb-test' });
    expect(connector?.kind).toBe('slack');
  });
});
