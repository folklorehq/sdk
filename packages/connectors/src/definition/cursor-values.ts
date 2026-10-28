// SPDX-License-Identifier: Apache-2.0
import type { StreamSpec } from '@folklore/contracts';

type CursorFormat = NonNullable<StreamSpec['cursor']>['format'];

export function cursorText(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

export function isGreaterCursor(
  candidate: string,
  current: string | null,
  format: CursorFormat,
): boolean {
  if (!isComparable(candidate, format)) return false;
  if (current === null || !isComparable(current, format)) return true;
  if (format === 'opaque') return candidate > current;
  return instant(candidate, format) > instant(current, format);
}

function isComparable(text: string, format: CursorFormat): boolean {
  return format === 'opaque' || !Number.isNaN(instant(text, format));
}

function instant(text: string, format: CursorFormat): number {
  return format === 'epoch_ms' ? Number(text) : Date.parse(text);
}
