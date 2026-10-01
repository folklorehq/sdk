// SPDX-License-Identifier: Apache-2.0
// RFC 9562 versions 1-8 with the RFC variant. Pool and org ids are minted as UUIDv8, so a
// v1-5-only check refuses every real pool and workspace; nil and max fail the version digit.
export const RFC_UUID_PATTERN_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

const RFC_UUID_PATTERN = new RegExp(`^${RFC_UUID_PATTERN_SOURCE}$`, 'i');

/** True for a canonical-form RFC 9562 UUID of versions 1-8, in either case. */
export function isRfcUuid(value: string): boolean {
  return RFC_UUID_PATTERN.test(value);
}
