// SPDX-License-Identifier: Apache-2.0
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

export function resolveJsonPointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document;
  if (!pointer.startsWith('/')) return undefined;
  let current = document;
  for (const segment of pointer.slice(1).split('/')) {
    current = child(current, segment.replaceAll('~1', '/').replaceAll('~0', '~'));
    if (current === undefined) return undefined;
  }
  return current;
}

function child(parent: unknown, key: string): unknown {
  if (Array.isArray(parent)) return ARRAY_INDEX.test(key) ? parent[Number(key)] : undefined;
  if (typeof parent !== 'object' || parent === null) return undefined;
  return Object.hasOwn(parent, key) ? (parent as Record<string, unknown>)[key] : undefined;
}
