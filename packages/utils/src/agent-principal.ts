// SPDX-License-Identifier: Apache-2.0
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Derives the only allowed RDS IAM login role for an organization. */
export function agentPrincipalName(orgId: string): string {
  const normalized = orgId.toLowerCase();
  if (!UUID_PATTERN.test(normalized) || normalized === NIL_UUID) {
    throw new Error('organization id must be a non-nil UUID');
  }
  return `folklore_agent_${normalized.replaceAll('-', '')}`;
}

/** Checks whether a role name is the organization-bound agent principal. */
export function isAgentPrincipalName(username: string, orgId: string): boolean {
  try {
    return username === agentPrincipalName(orgId);
  } catch {
    return false;
  }
}
