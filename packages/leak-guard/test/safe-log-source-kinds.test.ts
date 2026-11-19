// SPDX-License-Identifier: Apache-2.0
import { CONNECTOR_MANIFESTS } from '@folklore/contracts';
import { SAFE_LOG_SOURCE_KINDS } from '@folklore/core';
import { describe, expect, it } from 'vitest';

describe('SAFE_LOG_SOURCE_KINDS', () => {
  it('covers every connector manifest kind', () => {
    const missing = CONNECTOR_MANIFESTS.map((manifest) => manifest.kind).filter(
      (kind) => !SAFE_LOG_SOURCE_KINDS.has(kind),
    );

    expect(missing).toEqual([]);
  });
});
