// SPDX-License-Identifier: Apache-2.0
import { isRfcUuid } from './uuid.js';

/** Derives the only allowed RDS IAM login role for an organization. */
export function agentPrincipalName(orgId: string): string {
  const normalized = orgId.toLowerCase();
  if (!isRfcUuid(normalized)) {
    throw new Error('organization id must be a non-nil UUID');
  }
  return `folklore_agent_${normalized.replaceAll('-', '')}`;
}

/** Derives the isolated RDS IAM login role used only for the authorized tenant purge. */
export function purgePrincipalName(orgId: string): string {
  const normalized = orgId.toLowerCase();
  if (!isRfcUuid(normalized)) {
    throw new Error('organization id must be a non-nil UUID');
  }
  return `folklore_purge_${normalized.replaceAll('-', '')}`;
}

/** Checks whether a role name is the organization-bound agent principal. */
export function isAgentPrincipalName(username: string, orgId: string): boolean {
  try {
    return username === agentPrincipalName(orgId);
  } catch {
    return false;
  }
}
