// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  agentPrincipalName,
  isAgentPrincipalName,
  purgePrincipalName,
} from '../src/agent-principal.js';

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PRINCIPAL = 'folklore_agent_22222222222242228222222222222222';
const PURGE_PRINCIPAL = 'folklore_purge_22222222222242228222222222222222';

describe('agentPrincipalName', () => {
  it('derives the sole allowed RDS IAM principal from a non-nil org UUID', () => {
    expect(agentPrincipalName(ORG_ID)).toBe(PRINCIPAL);
    expect(isAgentPrincipalName(PRINCIPAL, ORG_ID)).toBe(true);
  });

  it.each(['folklore_agent', 'FOLKLORE_AGENT_22222222222242228222222222222222', 'not-a-uuid'])(
    'rejects an invalid agent principal input %s',
    (value) => {
      expect(() => agentPrincipalName(value)).toThrow();
      expect(isAgentPrincipalName(value, ORG_ID)).toBe(false);
    },
  );

  // Pool and org ids are minted as UUIDv8 (prod pool c0626b90-f744-863b-…), and a pool's agent
  // principal is derived from its pool id, so a v1-5-only check failed every pool preview.
  it('derives the principal from a UUIDv8 pool or org id', () => {
    const v8 = 'c0626b90-f744-863b-9254-c3ba1d8dd760';
    expect(agentPrincipalName(v8)).toBe('folklore_agent_c0626b90f744863b9254c3ba1d8dd760');
    expect(purgePrincipalName(v8)).toBe('folklore_purge_c0626b90f744863b9254c3ba1d8dd760');
  });

  it.each([
    '00000000-0000-0000-0000-000000000000',
    'c0626b90-f744-063b-9254-c3ba1d8dd760',
    'c0626b90-f744-963b-9254-c3ba1d8dd760',
    'c0626b90-f744-863b-c254-c3ba1d8dd760',
  ])('still rejects a nil, unknown-version or non-RFC-variant id %s', (value) => {
    expect(() => agentPrincipalName(value)).toThrow();
    expect(() => purgePrincipalName(value)).toThrow();
  });

  it('derives a distinct purge principal from the same org UUID', () => {
    expect(purgePrincipalName(ORG_ID)).toBe(PURGE_PRINCIPAL);
    expect(purgePrincipalName(ORG_ID)).not.toBe(PRINCIPAL);
  });
});
