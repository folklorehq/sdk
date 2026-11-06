// SPDX-License-Identifier: Apache-2.0
export const KEYED_PLACE_PREFIX = 'plc:';
export const KEYED_PLACE_REF_PATTERN = /^plc:[0-9a-f]{32}$/;

export type KeyedPlaceRef = `plc:${string}`;

/** An org-keyed place id minted in the enclave; the only form source_resources.external_id accepts. */
export function isKeyedPlaceRef(value: unknown): value is KeyedPlaceRef {
  return typeof value === 'string' && KEYED_PLACE_REF_PATTERN.test(value);
}
