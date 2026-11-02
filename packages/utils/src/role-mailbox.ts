// SPDX-License-Identifier: Apache-2.0
const ROLE_LOCAL_PARTS: ReadonlySet<string> = new Set(
  (
    'info support billing sales admin help hello team contact noreply accounts hr jobs press ' +
    'security abuse postmaster cs success ops it finance legal privacy marketing office careers ' +
    'feedback orders notifications alerts donotreply mailerdaemon webmaster helpdesk service all everyone'
  ).split(' '),
);

const LOCAL_PART_SEPARATORS = /[._-]/g;

export function isRoleMailbox(email: string): boolean {
  const local = email.split('@')[0] ?? '';
  const untagged = local.split('+')[0] ?? '';
  const normalized = untagged.toLowerCase().replace(LOCAL_PART_SEPARATORS, '');
  return normalized === '' || ROLE_LOCAL_PARTS.has(normalized);
}
