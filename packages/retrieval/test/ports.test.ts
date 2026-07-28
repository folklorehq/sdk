// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isSensitivityWithin } from '../src/sensitivity.js';

describe('@folklore/retrieval', () => {
  it('orders sensitivity levels for audience gating', () => {
    expect(isSensitivityWithin('public', 'team_scoped')).toBe(true);
    expect(isSensitivityWithin('confidential', 'team_scoped')).toBe(false);
  });
});
