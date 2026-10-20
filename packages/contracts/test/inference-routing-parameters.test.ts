// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  INFERENCE_ROUTING_DESIRED_PARAMETER,
  INFERENCE_ROUTING_TABLE_PARAMETER,
} from '../src/inference-routing-parameters.js';

describe('inference routing parameter names', () => {
  it('names the signed table and the desired table parameters', () => {
    expect(INFERENCE_ROUTING_TABLE_PARAMETER).toBe(
      '/folklore/prod/provider-inference/routing-table',
    );
    expect(INFERENCE_ROUTING_DESIRED_PARAMETER).toBe(
      '/folklore/prod/provider-inference/routing-table-desired',
    );
  });
});
