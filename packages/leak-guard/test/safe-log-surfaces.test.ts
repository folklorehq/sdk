// SPDX-License-Identifier: Apache-2.0
import { ASK_USAGE_SURFACES } from '@folklore/contracts';
import { SAFE_LOG_USAGE_SURFACES } from '@folklore/core';
import { describe, expect, it } from 'vitest';

describe('SAFE_LOG_USAGE_SURFACES', () => {
  it('is exactly the contract usage surfaces', () => {
    expect([...SAFE_LOG_USAGE_SURFACES].sort()).toEqual([...ASK_USAGE_SURFACES].sort());
  });
});
