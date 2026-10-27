// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  CODEBASE_GRAPH_ERASE_REASONS,
  CODEBASE_GRAPH_ERASE_SUBMISSION_TIMEOUT_MS,
  codebaseGraphEraseCommandSchema,
  codebaseGraphEraseResponseSchema,
} from '../src/enclave.js';

const ERASE_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const DEPLOYMENT_ID = '33333333-3333-4333-8333-333333333333';
const GENERATION = '44444444-4444-4444-8444-444444444444';

const command = {
  eraseId: ERASE_ID,
  orgId: ORG_ID,
  tenantDeploymentId: DEPLOYMENT_ID,
  retiredGeneration: GENERATION,
  reason: 'disabled',
  pass: 1,
};

describe('codebaseGraphEraseCommandSchema', () => {
  it('accepts a generation uuid or the literal all, for every closed reason', () => {
    for (const reason of CODEBASE_GRAPH_ERASE_REASONS) {
      expect(codebaseGraphEraseCommandSchema.parse({ ...command, reason }).reason).toBe(reason);
    }
    expect(
      codebaseGraphEraseCommandSchema.parse({ ...command, retiredGeneration: 'all' })
        .retiredGeneration,
    ).toBe('all');
  });

  it('rejects an unknown reason, a malformed generation and any extra field', () => {
    expect(() => codebaseGraphEraseCommandSchema.parse({ ...command, reason: 'other' })).toThrow();
    expect(() =>
      codebaseGraphEraseCommandSchema.parse({ ...command, retiredGeneration: 'ALL' }),
    ).toThrow();
    expect(() =>
      codebaseGraphEraseCommandSchema.parse({ ...command, retiredGeneration: 'gen-1' }),
    ).toThrow();
    expect(() =>
      codebaseGraphEraseCommandSchema.parse({ ...command, repositoryName: 'acme/api' }),
    ).toThrow();
  });

  it('accepts pass 1 and pass 2 and nothing else', () => {
    expect(codebaseGraphEraseCommandSchema.parse({ ...command, pass: 2 }).pass).toBe(2);
    for (const pass of [0, 3, '1', null]) {
      expect(() => codebaseGraphEraseCommandSchema.parse({ ...command, pass })).toThrow();
    }
  });

  it('requires every id and the pass', () => {
    for (const key of [
      'eraseId',
      'orgId',
      'tenantDeploymentId',
      'retiredGeneration',
      'pass',
    ] as const) {
      const { [key]: _omitted, ...rest } = command;
      expect(() => codebaseGraphEraseCommandSchema.parse(rest)).toThrow();
    }
  });
});

describe('CODEBASE_GRAPH_ERASE_SUBMISSION_TIMEOUT_MS', () => {
  it('stays under the 60 s idle timeout of the tenant load balancer', () => {
    expect(CODEBASE_GRAPH_ERASE_SUBMISSION_TIMEOUT_MS).toBeLessThan(60_000);
  });
});

describe('codebaseGraphEraseResponseSchema', () => {
  it('accepts only a boolean done and nothing else', () => {
    expect(codebaseGraphEraseResponseSchema.parse({ done: false })).toEqual({ done: false });
    expect(() => codebaseGraphEraseResponseSchema.parse({ done: 'yes' })).toThrow();
    expect(() => codebaseGraphEraseResponseSchema.parse({ done: true, cursor: 'k' })).toThrow();
    expect(() => codebaseGraphEraseResponseSchema.parse({})).toThrow();
  });
});
