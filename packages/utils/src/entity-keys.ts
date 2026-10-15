// SPDX-License-Identifier: Apache-2.0
export const CLEAR_ENTITY_PATTERN = /^(?:issue:|pr#)\d{1,6}$/;
export const HASHED_ENTITY_PATTERN = /^ent:[0-9a-f]{32}$/;
export const HASHED_ENTITY_PREFIX = 'ent:';

/** A numeric issue or PR ref, the only entity that may be stored readable. */
export function isClearEntity(entity: string): boolean {
  return CLEAR_ENTITY_PATTERN.test(entity);
}

/** A readable numeric ref or a keyed hash: the only entity forms plaintext storage accepts. */
export function isStorableEntity(entity: unknown): entity is string {
  return (
    typeof entity === 'string' && (isClearEntity(entity) || HASHED_ENTITY_PATTERN.test(entity))
  );
}
