// SPDX-License-Identifier: Apache-2.0
import { isRfcUuid } from './uuid.js';

function normalizedOrgId(orgId: string): string {
  const normalized = orgId.toLowerCase();
  if (!isRfcUuid(normalized)) {
    throw new Error('organization id must be a non-nil UUID');
  }
  return normalized;
}

/** Derives the only allowed RDS IAM login role for an organization. */
export function agentPrincipalName(orgId: string): string {
  return `folklore_agent_${normalizedOrgId(orgId).replaceAll('-', '')}`;
}

/** Derives the isolated RDS IAM login role used only for the authorized tenant purge. */
export function purgePrincipalName(orgId: string): string {
  return `folklore_purge_${normalizedOrgId(orgId).replaceAll('-', '')}`;
}

/** The SSM path of a pool agent's database credential; the agent requires this exact path. */
export function agentDatabaseCredentialSsmPath(orgId: string): string {
  return `/folklore/${normalizedOrgId(orgId)}/agent-db-credential`;
}

/** Checks whether a role name is the organization-bound agent principal. */
export function isAgentPrincipalName(username: string, orgId: string): boolean {
  try {
    return username === agentPrincipalName(orgId);
  } catch {
    return false;
  }
}
