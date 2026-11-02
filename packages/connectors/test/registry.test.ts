// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ConnectorRegistry } from '../src/registry/index.js';
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
});
