// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DATA_CORRECTION_BATCH_MAX,
  dataCorrectionInvocationSchema,
  dataCorrectionResultSchema,
} from '../src/data-correction.js';

const ORG_ID = '7b0f6f0e-3c43-4f43-9b7c-0f8f0c1a2b3c';
const RUN_ID = '0e9c1d6a-4a8b-4f6e-9d3c-2b1a0f9e8d7c';
const DEFAULT_BATCH_LIMIT = 200;

const invocation = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  orgId: ORG_ID,
  job: 'link_referenced_containers',
  mode: 'dry_run',
  ...overrides,
});

const result = (counts: Record<string, number>): Record<string, unknown> => ({
  runId: RUN_ID,
  job: 'rescore_facts',
  mode: 'apply',
  done: false,
  counts,
});

describe('dataCorrectionInvocationSchema', () => {
  it('accepts a valid invocation and defaults the batch limit', () => {
    expect(dataCorrectionInvocationSchema.parse(invocation())).toEqual({
      ...invocation(),
      batchLimit: DEFAULT_BATCH_LIMIT,
    });
  });

  it('lowercases orgId and revertsRunId so lookups and locks see one spelling', () => {
    const parsed = dataCorrectionInvocationSchema.parse(
      invocation({
        orgId: ORG_ID.toUpperCase(),
        mode: 'rollback',
        revertsRunId: RUN_ID.toUpperCase(),
      }),
    );
    expect(parsed.orgId).toBe(ORG_ID);
    expect(parsed.revertsRunId).toBe(RUN_ID);
  });

  it('refuses a rollback without revertsRunId', () => {
    expect(dataCorrectionInvocationSchema.safeParse(invocation({ mode: 'rollback' })).success).toBe(
      false,
    );
  });

  it('refuses an apply that names revertsRunId', () => {
    const parsed = dataCorrectionInvocationSchema.safeParse(
      invocation({ mode: 'apply', revertsRunId: RUN_ID }),
    );
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain('reverts_run_id_mismatch');
  });

  it('refuses a batch limit of 0', () => {
    expect(dataCorrectionInvocationSchema.safeParse(invocation({ batchLimit: 0 })).success).toBe(
      false,
    );
  });

  it('refuses a batch limit above the maximum', () => {
    expect(DATA_CORRECTION_BATCH_MAX).toBe(500);
    expect(
      dataCorrectionInvocationSchema.safeParse(
        invocation({ batchLimit: DATA_CORRECTION_BATCH_MAX + 1 }),
      ).success,
    ).toBe(false);
  });

  it('refuses an unknown key', () => {
    expect(dataCorrectionInvocationSchema.safeParse(invocation({ sql: 'DELETE' })).success).toBe(
      false,
    );
  });
});

describe('dataCorrectionResultSchema', () => {
  it('accepts integer counts under snake_case keys', () => {
    expect(dataCorrectionResultSchema.safeParse(result({ rows_changed: 3 })).success).toBe(true);
  });

  it('refuses a count key that could carry a theme name', () => {
    expect(dataCorrectionResultSchema.safeParse(result({ 'Team: Billing': 1 })).success).toBe(
      false,
    );
  });

  it('refuses a negative count', () => {
    expect(dataCorrectionResultSchema.safeParse(result({ rows_changed: -1 })).success).toBe(false);
  });
});
