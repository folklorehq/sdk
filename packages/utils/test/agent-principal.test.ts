// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { agentPrincipalName, isAgentPrincipalName } from '../src/agent-principal.js';

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PRINCIPAL = 'folklore_agent_22222222222242228222222222222222';

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
});
