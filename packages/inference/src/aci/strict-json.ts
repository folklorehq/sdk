// SPDX-License-Identifier: Apache-2.0
import { visit } from 'jsonc-parser';

const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 65_536;

export function parseStrictJsonBytes(bytes: Uint8Array, maximumBytes: number): unknown {
  if (bytes.byteLength > maximumBytes) throw new Error();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const objectKeys: Array<Set<string> | undefined> = [];
  let nodes = 0;
  const beginContainer = (keys: Set<string> | undefined): void => {
    nodes += 1;
    objectKeys.push(keys);
    if (nodes > MAX_JSON_NODES || objectKeys.length > MAX_JSON_DEPTH) throw new Error();
  };
  visit(
    text,
    {
      onArrayBegin: () => beginContainer(undefined),
      onArrayEnd: () => void objectKeys.pop(),
      onError: () => {
        throw new Error();
      },
      onLiteralValue: (value) => {
        nodes += 1;
        if (
          nodes > MAX_JSON_NODES ||
          (typeof value === 'number' && !Number.isSafeInteger(value)) ||
          (typeof value === 'string' && !hasValidUnicode(value))
        ) {
          throw new Error();
        }
      },
      onObjectBegin: () => beginContainer(new Set()),
      onObjectEnd: () => void objectKeys.pop(),
      onObjectProperty: (property) => {
        nodes += 1;
        const keys = objectKeys.at(-1);
        if (
          keys === undefined ||
          keys.has(property) ||
          nodes > MAX_JSON_NODES ||
          !hasValidUnicode(property)
        ) {
          throw new Error();
        }
        keys.add(property);
      },
    },
    { allowTrailingComma: false, disallowComments: true },
  );
  return JSON.parse(text) as unknown;
}

function hasValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}
