// SPDX-License-Identifier: Apache-2.0
function toEpoch(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** A pulled record is a create when it was born inside the pull window, or when no lower bound applies. */
export function isCreateEvent(
  createdAt: Date | string | undefined,
  since: Date | string | undefined,
): boolean {
  if (since === undefined) return true;
  if (createdAt === undefined) return false;
  return toEpoch(createdAt) >= toEpoch(since);
}

// The created fact is un-revisioned, so an in-window event edited after creation must classify 'updated' on every pull or the edit dedupes away as a re-seeded create.
export function isCalendarCreateEvent(
  createdAt: Date | string | undefined,
  updatedAt: Date | string | undefined,
  since: Date | string | undefined,
): boolean {
  if (updatedAt === undefined) return isCreateEvent(createdAt, since);
  if (createdAt === undefined) return false;
  return toEpoch(updatedAt) <= toEpoch(createdAt) && isCreateEvent(createdAt, since);
}
