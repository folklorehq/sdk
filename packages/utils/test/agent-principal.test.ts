// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  agentDatabaseCredentialSsmPath,
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

  // Pool and org ids are minted as UUIDv8, and a pool's agent
  // principal is derived from its pool id, so a v1-5-only check failed every pool preview.
  it('derives the principal from a UUIDv8 pool or org id', () => {
    const v8 = '018f2e3d-4c5b-8a69-b7c8-d9e0f1a2b3c4';
    expect(agentPrincipalName(v8)).toBe('folklore_agent_018f2e3d4c5b8a69b7c8d9e0f1a2b3c4');
    expect(purgePrincipalName(v8)).toBe('folklore_purge_018f2e3d4c5b8a69b7c8d9e0f1a2b3c4');
  });

  it.each([
    '00000000-0000-0000-0000-000000000000',
    '018f2e3d-4c5b-0a69-b7c8-d9e0f1a2b3c4',
    '018f2e3d-4c5b-9a69-b7c8-d9e0f1a2b3c4',
    '018f2e3d-4c5b-8a69-c7c8-d9e0f1a2b3c4',
  ])('still rejects a nil, unknown-version or non-RFC-variant id %s', (value) => {
    expect(() => agentPrincipalName(value)).toThrow();
    expect(() => purgePrincipalName(value)).toThrow();
  });

  it('derives a distinct purge principal from the same org UUID', () => {
    expect(purgePrincipalName(ORG_ID)).toBe(PURGE_PRINCIPAL);
    expect(purgePrincipalName(ORG_ID)).not.toBe(PRINCIPAL);
  });
});

describe('agentDatabaseCredentialSsmPath', () => {
  it('derives the pool agent credential path from a lowercased UUID', () => {
    expect(agentDatabaseCredentialSsmPath('018F2E3D-4C5B-8A69-B7C8-D9E0F1A2B3C4')).toBe(
      '/folklore/018f2e3d-4c5b-8a69-b7c8-d9e0f1a2b3c4/agent-db-credential',
    );
  });

  it.each(['not-a-uuid', '', '00000000-0000-0000-0000-000000000000', '../x/agent-db-credential'])(
    'rejects a non-UUID id %s',
    (value) => {
      expect(() => agentDatabaseCredentialSsmPath(value)).toThrow();
    },
  );
});
