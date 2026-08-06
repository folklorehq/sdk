// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { containerSeedSchema } from '../src/enclave.js';

const SEED = { sourceContainerId: 'C1', shape: 'flat' };

describe('containerSeedSchema.label', () => {
  it('degrades an off-vocabulary label to our own literal instead of rejecting the fact', () => {
    const parsed = containerSeedSchema.parse({ ...SEED, label: 'Q3 Acquisition Diligence' });
    expect(parsed.label).toBe('unknown');
  });

  it('keeps a known label', () => {
    expect(containerSeedSchema.parse({ ...SEED, label: 'slack_channel' }).label).toBe(
      'slack_channel',
    );
  });
});
