// SPDX-License-Identifier: Apache-2.0
import { resolveJsonPointer } from '@folklore/utils';
import type { NormalizedActor } from '../../normalized.js';

export function scalarAt(record: unknown, pointer: string): string | undefined {
  const value = resolveJsonPointer(record, pointer);
  if (typeof value === 'string') return value === '' ? undefined : value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

export function textAt(record: unknown, pointer: string): string {
  return scalarAt(record, pointer) ?? '';
}

export function authorsAt(record: unknown, pointer: string): NormalizedActor[] {
  const sourceUserId = scalarAt(record, pointer);
  return sourceUserId === undefined ? [] : [{ sourceUserId, role: 'author' }];
}
