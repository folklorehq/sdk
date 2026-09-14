// SPDX-License-Identifier: Apache-2.0
import { sha256Hex } from './hash.js';
import { canonicalJson } from './canonical-json-pure.js';

export { canonicalJson } from './canonical-json-pure.js';

/** SHA-256 of the canonical JSON representation. */
export function canonicalJsonHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
