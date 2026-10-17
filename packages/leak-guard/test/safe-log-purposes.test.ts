// SPDX-License-Identifier: Apache-2.0
import { CLAUDE_INFERENCE_PURPOSES } from '@folklore/contracts';
import { SAFE_LOG_PURPOSES } from '@folklore/core';
import { describe, expect, it } from 'vitest';

describe('SAFE_LOG_PURPOSES', () => {
  it('is exactly the contract purposes plus untagged', () => {
    expect([...SAFE_LOG_PURPOSES].sort()).toEqual(
      [...CLAUDE_INFERENCE_PURPOSES, 'untagged'].sort(),
    );
  });
});
