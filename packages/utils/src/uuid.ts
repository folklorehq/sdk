// SPDX-License-Identifier: Apache-2.0
// RFC 9562 versions 1-8: pool and org ids are minted as UUIDv8, which a v1-5 check refuses.
export const RFC_UUID_PATTERN_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

const RFC_UUID_PATTERN = new RegExp(`^${RFC_UUID_PATTERN_SOURCE}$`, 'i');
const LOWERCASE_RFC_UUID_PATTERN = new RegExp(`^${RFC_UUID_PATTERN_SOURCE}$`);

/** True for a canonical-form RFC 9562 UUID of versions 1-8, in either case. */
export function isRfcUuid(value: string): boolean {
  return RFC_UUID_PATTERN.test(value);
}

/** True for a canonical-form RFC 9562 UUID of versions 1-8 written in lowercase only. */
export function isLowercaseRfcUuid(value: string): boolean {
  return LOWERCASE_RFC_UUID_PATTERN.test(value);
}

const UUID_VERSION_NIBBLE_INDEX = 14;
const UUID_V7_NIBBLE = '7';

/** The 48-bit unix-ms timestamp of an RFC UUIDv7, or null for any other id. */
export function uuidV7Millis(id: string): number | null {
  if (!isRfcUuid(id) || id[UUID_VERSION_NIBBLE_INDEX] !== UUID_V7_NIBBLE) return null;
  return Number.parseInt(`${id.slice(0, 8)}${id.slice(9, 13)}`, 16);
}
