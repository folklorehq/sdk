// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import { LinearConnector } from '../src/linear/index.js';
import { getDefaultConnectorRegistry } from '../src/registry/index.js';

const logger = new PinoLogger({ level: 'silent' });

describe('Linear registry wiring', () => {
  it('builds a pull connector for the linear kind', () => {
    const connector = getDefaultConnectorRegistry().createPullConnector('linear', {
      logger,
      token: 'lin_oauth_test',
    });

    expect(connector).toBeInstanceOf(LinearConnector);
  });
});
